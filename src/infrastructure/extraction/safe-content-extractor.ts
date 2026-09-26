import { lookup as resolveHost } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { ExtractionOutcome, SearchResult } from "../../domain/types.js";
import type {
  ContentExtractor,
  ExtractionLimits,
} from "../../ports/extraction.js";

export interface ExtractorConfig {
  maxFetchBytes: number;
  maxRedirects: number;
  userAgent: string;
  minCharacters: number;
}

/** Aggregate-only categories. Never include page data or source identity. */
export type EmptyResponseShape =
  | "empty_body"
  | "plain_no_text"
  | "html_no_text_with_script"
  | "html_no_text_without_script"
  | "html_text_without_semantic_root"
  | "html_text_outside_semantic_root";
export type ExtractionTextDiagnostic = "no_readable_text" | "under_minimum" | "fallback_recovered" | "json_ld_recovered" | EmptyResponseShape;

type PublicAddress = { address: string; family: 4 | 6 };
type FetchWithDispatcher = (input: string | URL, init?: RequestInit & { dispatcher?: Agent }) => Promise<Response>;

const fetchWithDispatcher: FetchWithDispatcher = async (input, init) =>
  (await undiciFetch(input, init as Parameters<typeof undiciFetch>[1])) as unknown as Response;

const privateIPv4 = (ip: string) => {
  const octets = ip.split(".").map(Number);
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && (octets[1] === 0 || octets[1] === 168)) ||
    (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19)) ||
    octets[0] >= 224
  );
};

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !privateIPv4(address);
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPublicAddress(mappedIpv4);
  const mappedHex = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/.exec(normalized);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1]!, 16);
    const low = Number.parseInt(mappedHex[2]!, 16);
    return isPublicAddress(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
  }
  return (
    normalized !== "::" &&
    normalized !== "::1" &&
    !normalized.startsWith("fc") &&
    !normalized.startsWith("fd") &&
    !normalized.startsWith("fe") &&
    !normalized.startsWith("ff") &&
    !normalized.startsWith("::ffff:")
  );
}

async function resolvePublicAddresses(url: URL): Promise<PublicAddress[]> {
  if (
    ["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase()) ||
    (isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0 && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, "")))
  ) {
    throw new Error("unsafe_url");
  }
  const addresses = await resolveHost(url.hostname, {
    all: true,
    verbatim: true,
  });
  const publicAddresses = addresses
    .filter(({ address }) => isPublicAddress(address))
    .map(({ address, family }) => ({ address, family: family as 4 | 6 }))
    .sort((left, right) => left.family - right.family);
  if (!publicAddresses.length || publicAddresses.length !== addresses.length) {
    throw new Error("unsafe_url");
  }
  return publicAddresses;
}

export async function assertSafeUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  ) {
    throw new Error("unsafe_url");
  }
  await resolvePublicAddresses(url);
  return url;
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes)
    throw new Error("body_limit");
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let abortReader: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abortReader = () => {
      void reader.cancel();
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    if (signal.aborted) abortReader();
    else signal.addEventListener("abort", abortReader, { once: true });
  });
  try {
    while (true) {
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("body_limit");
        throw new Error("body_limit");
      }
      chunks.push(next.value);
    }
  } finally {
    if (abortReader) signal.removeEventListener("abort", abortReader);
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function sanitizeDocument(document: ReturnType<typeof parseHTML>["document"]): ReturnType<typeof parseHTML>["document"] {
  document.querySelectorAll("script, style, noscript, template, svg, nav, footer, header, form, aside, button, input, textarea, select, [hidden], [inert], [aria-hidden='true'], [role='navigation'], [role='complementary']")
    .forEach((node) => node.remove());
  document.querySelectorAll("[style]").forEach((node) => {
    if (/\bdisplay\s*:\s*none\b|\bvisibility\s*:\s*hidden\b/i.test(node.getAttribute("style") ?? "")) node.remove();
  });
  return document;
}

function readableText(html: string): string {
  const { document } = parseHTML(html);
  const article = new Readability(sanitizeDocument(document) as unknown as Document).parse();
  return article?.textContent ?? "";
}

/** Shape flags remain local; only a fixed category may leave the extractor. */
function semanticContent(html: string): { text: string; hasRoot: boolean; hasStaticText: boolean; hasScript: boolean } {
  const { document } = parseHTML(html);
  const hasScript = Boolean(document.querySelector("script"));
  sanitizeDocument(document);
  const root = document.querySelector("article") ?? document.querySelector("main") ?? document.querySelector("[role='main']");
  const body = document.querySelector("body");
  const staticText = body?.innerText ?? (document.documentElement?.localName === "html" ? "" : document.documentElement?.innerText ?? "");
  return {
    text: root?.innerText ?? "",
    hasRoot: Boolean(root),
    hasStaticText: Boolean(staticText.trim()),
    hasScript,
  };
}

export type TextLengthBucket = "none" | "under_120" | "at_least_120";
export type NodeCountBucket = "none" | "one" | "two_or_more";

function textLengthBucket(text: string | undefined): TextLengthBucket {
  const normalized = text?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "none";
  const characters = normalized[Symbol.iterator]();
  for (let length = 0; length < 120; length++) if (characters.next().done) return "under_120";
  return "at_least_120";
}

function nodeCountBucket(count: number): NodeCountBucket {
  return count === 0 ? "none" : count === 1 ? "one" : "two_or_more";
}

/** Local-only response-boundary view. Never return any page content, URL, or arbitrary labels. */
export function inspectEmptyHtmlShape(html: string): {
  bytes: "under_4k" | "4k_to_64k" | "over_64k";
  body_present: boolean;
  root_before: boolean;
  root_after: boolean;
  body_before: TextLengthBucket;
  root_text_before: TextLengthBucket;
  body_dom_text_before: TextLengthBucket;
  root_dom_text_before: TextLengthBucket;
  body_after: TextLengthBucket;
  root_text_after: TextLengthBucket;
  body_elements: NodeCountBucket;
  inline_scripts: NodeCountBucket;
  external_scripts: NodeCountBucket;
} {
  const bytes = new TextEncoder().encode(html).byteLength;
  if (bytes > 2_000_000) throw new Error("inspection_limit");
  const { document } = parseHTML(html);
  const inline = document.querySelectorAll("script:not([src])").length;
  const external = document.querySelectorAll("script[src]").length;
  const body = document.querySelector("body");
  const bodyElements = body?.querySelectorAll("*").length ?? 0;
  document.querySelectorAll("script, style, noscript, template").forEach((node) => node.remove());
  const rootBefore = document.querySelector("article") ?? document.querySelector("main") ?? document.querySelector("[role='main']");
  const bodyBefore = textLengthBucket(body?.innerText);
  const rootTextBefore = textLengthBucket(rootBefore?.innerText);
  const bodyDomBefore = textLengthBucket(body?.textContent ?? undefined);
  const rootDomBefore = textLengthBucket(rootBefore?.textContent ?? undefined);
  sanitizeDocument(document);
  const rootAfter = document.querySelector("article") ?? document.querySelector("main") ?? document.querySelector("[role='main']");
  return {
    bytes: bytes < 4_096 ? "under_4k" : bytes <= 65_536 ? "4k_to_64k" : "over_64k",
    body_present: Boolean(body), root_before: Boolean(rootBefore), root_after: Boolean(rootAfter),
    body_before: bodyBefore, root_text_before: rootTextBefore,
    body_dom_text_before: bodyDomBefore, root_dom_text_before: rootDomBefore,
    body_after: textLengthBucket(body?.innerText), root_text_after: textLengthBucket(rootAfter?.innerText),
    body_elements: nodeCountBucket(bodyElements), inline_scripts: nodeCountBucket(inline), external_scripts: nodeCountBucket(external),
  };
}

function emptyShape(bytes: number, contentType: "text/html" | "text/plain", content?: ReturnType<typeof semanticContent>): EmptyResponseShape {
  if (bytes === 0) return "empty_body";
  if (contentType === "text/plain") return "plain_no_text";
  if (content?.hasStaticText) return content.hasRoot ? "html_text_outside_semantic_root" : "html_text_without_semantic_root";
  return content?.hasScript ? "html_no_text_with_script" : "html_no_text_without_script";
}

function boundedText(text: string, maxCharacters: number): string {
  return [...text.replace(/\s+/g, " ").trim()].slice(0, maxCharacters).join("");
}

const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting"]);
const MAX_JSON_LD_SCRIPTS = 4;
const MAX_JSON_LD_UNITS = 100_000;
const MAX_JSON_LD_NODES = 32;

/** Only page-authored articleBody data from the already fetched HTML may qualify. */
function structuredArticleText(html: string, maxCharacters: number, minCharacters: number): string {
  if (!/application\/ld\+json/i.test(html)) return "";
  const { document } = parseHTML(html);
  let scripts = 0;
  for (const script of document.querySelectorAll("script[type]")) {
    if (script.getAttribute("type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/ld+json") continue;
    if (++scripts > MAX_JSON_LD_SCRIPTS) break;
    const payload = script.textContent ?? "";
    if (!payload || payload.length > MAX_JSON_LD_UNITS) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { continue; }
    let nodes = 0;
    const articleText = (candidate: unknown): string => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return "";
      const value = candidate as Record<string, unknown>;
      const types = Array.isArray(value["@type"]) ? value["@type"].slice(0, 4) : [value["@type"]];
      if (!types.some((type) => typeof type === "string" && ARTICLE_TYPES.has(type)) || typeof value.articleBody !== "string" || value.articleBody.length > MAX_JSON_LD_UNITS) return "";
      try {
        const bodyDocument = parseHTML(`<main>${value.articleBody}</main>`).document;
        sanitizeDocument(bodyDocument);
        const text = boundedText(bodyDocument.querySelector("main")?.innerText ?? "", maxCharacters);
        return [...text].length >= minCharacters ? text : "";
      } catch { return ""; }
    };
    for (const root of Array.isArray(parsed) ? parsed : [parsed]) {
      if (++nodes > MAX_JSON_LD_NODES) break;
      const direct = articleText(root);
      if (direct) return direct;
      if (!root || typeof root !== "object" || Array.isArray(root)) continue;
      const graph = (root as Record<string, unknown>)["@graph"];
      if (!Array.isArray(graph)) continue;
      for (const node of graph) {
        if (++nodes > MAX_JSON_LD_NODES) break;
        const nested = articleText(node);
        if (nested) return nested;
      }
      if (nodes > MAX_JSON_LD_NODES) break;
    }
  }
  return "";
}

function pinnedAgent(addresses: PublicAddress[]): Agent {
  let index = 0;
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        const requestedFamily = "family" in options && (options.family === 4 || options.family === 6) ? options.family : undefined;
        const candidates = requestedFamily ? addresses.filter(({ family }) => family === requestedFamily) : addresses;
        const available = candidates.length ? candidates : addresses;
        const address = available[index++ % available.length];
        if ("all" in options && options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    },
  });
}

/** Local diagnostic only: HTTPS JavaScript bytes, pinned to validated public DNS. Never evidence. */
export async function fetchPublicScript(value: string, fetcher: FetchWithDispatcher = fetchWithDispatcher): Promise<string | null> {
  let current: URL;
  try {
    const requested = new URL(value);
    if (requested.protocol !== "https:") return null;
    current = await assertSafeUrl(requested.toString());
  } catch { return null; }
  for (let redirects = 0; redirects <= 2; redirects++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    let dispatcher: Agent | undefined;
    try {
      const addresses = (await resolvePublicAddresses(current)).filter((entry) => entry.family === 4);
      if (!addresses.length) return null; // The local pilot never opens an IPv6 socket.
      dispatcher = pinnedAgent(addresses);
      const response = await fetcher(current, {
        redirect: "manual", signal: controller.signal, dispatcher,
        headers: { accept: "text/javascript,application/javascript", "user-agent": "dorothy-ann-local-probe" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 2) return null;
        const next = new URL(location, current);
        if (next.protocol !== "https:") return null;
        current = await assertSafeUrl(next.toString());
        continue;
      }
      if (!response.ok) return null;
      const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (mime !== "text/javascript" && mime !== "application/javascript" && mime !== "application/x-javascript") return null;
      const body = await readBoundedBody(response, 256_000, controller.signal);
      return body.length ? new TextDecoder("utf-8", { fatal: true }).decode(body) : null;
    } catch { return null; }
    finally { clearTimeout(timer); await dispatcher?.close().catch(() => undefined); }
  }
  return null;
}

export type PresentationComparison =
  | { outcome: "html"; shape: ReturnType<typeof inspectEmptyHtmlShape> }
  | { outcome: "empty" | "redirect" | "http_error" | "unsupported" | "too_large" | "timeout" | "failed"; shape: null };

/** Local-only diagnostic refetch of the same validated URL. Never a source or extraction outcome. */
export async function compareHtmlPresentation(url: string, fetcher: FetchWithDispatcher = fetchWithDispatcher): Promise<PresentationComparison> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  let dispatcher: Agent | undefined;
  let response: Response | undefined;
  try {
    const current = await assertSafeUrl(url);
    if (controller.signal.aborted) return { outcome: "timeout", shape: null };
    const addresses = await resolvePublicAddresses(current);
    if (controller.signal.aborted) return { outcome: "timeout", shape: null };
    dispatcher = pinnedAgent(addresses);
    response = await fetcher(current, {
      redirect: "manual", signal: controller.signal, dispatcher,
      headers: {
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "text/html,text/plain;q=0.9",
      },
    });
    if (response.status >= 300 && response.status < 400) return { outcome: "redirect", shape: null };
    if (!response.ok) return { outcome: "http_error", shape: null };
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "text/html")
      return { outcome: "unsupported", shape: null };
    const body = await readBoundedBody(response, 2_000_000, controller.signal);
    if (!body.length) return { outcome: "empty", shape: null };
    return { outcome: "html", shape: inspectEmptyHtmlShape(new TextDecoder().decode(body)) };
  } catch (error) {
    if (controller.signal.aborted) return { outcome: "timeout", shape: null };
    return { outcome: error instanceof Error && error.message === "body_limit" ? "too_large" : "failed", shape: null };
  } finally {
    clearTimeout(timer);
    if (response?.body && !response.bodyUsed) await response.body.cancel().catch(() => undefined);
    await dispatcher?.close().catch(() => undefined);
  }
}

export class SafeContentExtractor implements ContentExtractor {
  constructor(
    private readonly config: ExtractorConfig,
    private readonly fetcher: FetchWithDispatcher = fetchWithDispatcher,
    private readonly onTextDiagnostic?: (category: ExtractionTextDiagnostic) => void,
    private readonly onEmptyHtmlSample?: (sample: { html: string; baseUrl: string }) => void,
  ) {}

  private report(category: ExtractionTextDiagnostic): void {
    try { this.onTextDiagnostic?.(category); } catch { /* Observability must not change extraction. */ }
  }

  async extract(source: SearchResult, limits: ExtractionLimits): Promise<ExtractionOutcome> {
    if (source.kind !== "link") return { sourceId: source.sourceId, status: "skipped", reason: "unsupported_content" };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<ExtractionOutcome>((resolve) => {
      timer = setTimeout(() => resolve({ sourceId: source.sourceId, status: "failed", code: "timeout", retryable: true }), limits.timeoutMs);
    });
    const diagnostics: ExtractionTextDiagnostic[] = [];
    let sample: { html: string; baseUrl: string } | undefined;
    try {
      const outcome = await Promise.race([this.extractInternal(source, limits, (category) => { diagnostics.push(category); }, (value) => { sample = value; }), timeout]);
      // A fetch may finish after the outer timeout; only count the outcome
      // actually returned to acquisition, never a late background result.
      for (const category of diagnostics) {
        if ((outcome.status === "viable" && (category === "fallback_recovered" || category === "json_ld_recovered"))
          || (outcome.status === "skipped" && outcome.reason === "empty_content" && category !== "fallback_recovered" && category !== "json_ld_recovered")) this.report(category);
      }
      if (outcome.status === "skipped" && outcome.reason === "empty_content"
        && source.rank <= 3 && diagnostics.includes("html_no_text_with_script") && sample !== undefined) {
        try { this.onEmptyHtmlSample?.(sample); } catch { /* Local observation cannot change extraction. */ }
      }
      return outcome;
    } finally { if (timer) clearTimeout(timer); }
  }

  private async extractInternal(
    source: SearchResult,
    limits: ExtractionLimits,
    recordTextDiagnostic: (category: ExtractionTextDiagnostic) => void,
    recordEmptyHtml: (sample: { html: string; baseUrl: string }) => void,
  ): Promise<ExtractionOutcome> {
    let current: URL;
    try {
      current = await assertSafeUrl(source.url);
    } catch {
      return {
        sourceId: source.sourceId,
        status: "skipped",
        reason: "unsafe_url",
      };
    }

    for (
      let redirects = 0;
      redirects <= this.config.maxRedirects;
      redirects++
    ) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
      let dispatcher: Agent | undefined;
      try {
        const addresses = await resolvePublicAddresses(current);
        dispatcher = pinnedAgent(addresses);
        const response = await this.fetcher(current, {
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent": this.config.userAgent,
            accept: "text/html,text/plain;q=0.9",
          },
          dispatcher,
        } as RequestInit & { dispatcher: Agent });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || redirects === this.config.maxRedirects) {
            return {
              sourceId: source.sourceId,
              status: "skipped",
              reason: "blocked",
            };
          }
          current = await assertSafeUrl(new URL(location, current).toString());
          continue;
        }
        if (!response.ok) {
          return {
            sourceId: source.sourceId,
            status: "failed",
            code: "fetch_failed",
            retryable: response.status >= 500,
          };
        }
        const contentType = response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (contentType !== "text/html" && contentType !== "text/plain") {
          return {
            sourceId: source.sourceId,
            status: "skipped",
            reason: "unsupported_content",
          };
        }
        const buffer = await readBoundedBody(
          response,
          this.config.maxFetchBytes,
          controller.signal,
        );
        // An HTTP 200 with no body is missing content, not a parser/fetch failure.
        if (buffer.byteLength === 0) {
          recordTextDiagnostic("no_readable_text");
          recordTextDiagnostic("empty_body");
          return { sourceId: source.sourceId, status: "skipped", reason: "empty_content" };
        }
        const raw = new TextDecoder().decode(buffer);
        let bounded = boundedText(contentType === "text/html" ? readableText(raw) : raw, limits.maxCharacters);
        let semantic: ReturnType<typeof semanticContent> | undefined;
        if (contentType === "text/html" && [...bounded].length < this.config.minCharacters) {
          semantic = semanticContent(raw);
          const fallback = boundedText(semantic.text, limits.maxCharacters);
          if ([...fallback].length >= this.config.minCharacters) {
            bounded = fallback;
            recordTextDiagnostic("fallback_recovered");
          } else if ([...fallback].length > [...bounded].length) bounded = fallback;
          if ([...bounded].length < this.config.minCharacters) {
            const structured = structuredArticleText(raw, limits.maxCharacters, this.config.minCharacters);
            if (structured) {
              bounded = structured;
              recordTextDiagnostic("json_ld_recovered");
            }
          }
        }
        const characterCount = [...bounded].length;
        if (characterCount < this.config.minCharacters) {
          if (characterCount === 0) {
            recordTextDiagnostic("no_readable_text");
            const shape = emptyShape(buffer.byteLength, contentType, semantic);
            recordTextDiagnostic(shape);
            if (shape === "html_no_text_with_script" && this.onEmptyHtmlSample && source.rank <= 3) recordEmptyHtml({ html: raw, baseUrl: current.toString() });
          } else recordTextDiagnostic("under_minimum");
          return {
            sourceId: source.sourceId,
            status: "skipped",
            reason: "empty_content",
          };
        }
        return {
          sourceId: source.sourceId,
          status: "viable",
          page: {
            sourceId: source.sourceId,
            canonicalUrl: current.toString(),
            title: source.title,
            text: bounded,
            extractedAt: new Date().toISOString() as never,
            characterCount,
          },
        };
      } catch (error) {
        if (error instanceof Error && error.message === "body_limit") {
          return {
            sourceId: source.sourceId,
            status: "failed",
            code: "fetch_failed",
            retryable: false,
          };
        }
        return {
          sourceId: source.sourceId,
          status: "failed",
          code:
            error instanceof DOMException && error.name === "AbortError"
              ? "timeout"
              : "fetch_failed",
          retryable: true,
        };
      } finally {
        clearTimeout(timer);
        await dispatcher?.close().catch(() => undefined);
      }
    }
    return { sourceId: source.sourceId, status: "skipped", reason: "blocked" };
  }
}
