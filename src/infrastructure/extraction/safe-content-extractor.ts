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
export type ExtractionTextDiagnostic = "no_readable_text" | "under_minimum" | "fallback_recovered" | EmptyResponseShape;

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
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] >= 224
  );
};

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return !privateIPv4(address);
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(
    /^::ffff:(\\d+\\.\\d+\\.\\d+\\.\\d+)$/,
  )?.[1];
  if (mappedIpv4) return isPublicAddress(mappedIpv4);
  return (
    normalized !== "::" &&
    normalized !== "::1" &&
    !normalized.startsWith("fc") &&
    !normalized.startsWith("fd") &&
    !normalized.startsWith("fe8") &&
    !normalized.startsWith("fe9") &&
    !normalized.startsWith("fea") &&
    !normalized.startsWith("feb") &&
    !normalized.startsWith("::ffff:127.")
  );
}

async function resolvePublicAddresses(url: URL): Promise<PublicAddress[]> {
  if (
    ["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())
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

function emptyShape(bytes: number, contentType: "text/html" | "text/plain", content?: ReturnType<typeof semanticContent>): EmptyResponseShape {
  if (bytes === 0) return "empty_body";
  if (contentType === "text/plain") return "plain_no_text";
  if (content?.hasStaticText) return content.hasRoot ? "html_text_outside_semantic_root" : "html_text_without_semantic_root";
  return content?.hasScript ? "html_no_text_with_script" : "html_no_text_without_script";
}

function boundedText(text: string, maxCharacters: number): string {
  return [...text.replace(/\s+/g, " ").trim()].slice(0, maxCharacters).join("");
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

export class SafeContentExtractor implements ContentExtractor {
  constructor(
    private readonly config: ExtractorConfig,
    private readonly fetcher: FetchWithDispatcher = fetchWithDispatcher,
    private readonly onTextDiagnostic?: (category: ExtractionTextDiagnostic) => void,
    private readonly onEmptyHtmlSample?: (html: string) => void,
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
    let sampleHtml: string | undefined;
    try {
      const outcome = await Promise.race([this.extractInternal(source, limits, (category) => { diagnostics.push(category); }, (html) => { sampleHtml = html; }), timeout]);
      // A fetch may finish after the outer timeout; only count the outcome
      // actually returned to acquisition, never a late background result.
      for (const category of diagnostics) {
        if ((outcome.status === "viable" && category === "fallback_recovered")
          || (outcome.status === "skipped" && outcome.reason === "empty_content" && category !== "fallback_recovered")) this.report(category);
      }
      if (outcome.status === "skipped" && outcome.reason === "empty_content"
        && diagnostics.includes("html_no_text_with_script") && sampleHtml !== undefined) {
        try { this.onEmptyHtmlSample?.(sampleHtml); } catch { /* Local observation cannot change extraction. */ }
      }
      return outcome;
    } finally { if (timer) clearTimeout(timer); }
  }

  private async extractInternal(
    source: SearchResult,
    limits: ExtractionLimits,
    recordTextDiagnostic: (category: ExtractionTextDiagnostic) => void,
    recordEmptyHtml: (html: string) => void,
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
        }
        const characterCount = [...bounded].length;
        if (characterCount < this.config.minCharacters) {
          if (characterCount === 0) {
            recordTextDiagnostic("no_readable_text");
            const shape = emptyShape(buffer.byteLength, contentType, semantic);
            recordTextDiagnostic(shape);
            if (shape === "html_no_text_with_script" && this.onEmptyHtmlSample) recordEmptyHtml(raw);
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
