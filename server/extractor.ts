import { lookup as resolveHost } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { ExtractionOutcome, SearchResult } from "../src/domain/types.js";
import type {
  ContentExtractor,
  ExtractionLimits,
} from "../src/ports/extraction.js";

export interface ExtractorConfig {
  maxFetchBytes: number;
  maxRedirects: number;
  userAgent: string;
  minCharacters: number;
}

type PublicAddress = { address: string; family: 4 | 6 };
type FetchWithDispatcher = typeof fetch;

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
    .map(({ address, family }) => ({ address, family: family as 4 | 6 }));
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
  try {
    while (true) {
      if (signal.aborted)
        throw new DOMException("The operation was aborted", "AbortError");
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("body_limit");
        throw new Error("body_limit");
      }
      chunks.push(next.value);
    }
  } finally {
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

function readableText(html: string): string {
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  return article?.textContent ?? "";
}

function pinnedAgent(addresses: PublicAddress[]): Agent {
  let index = 0;
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        const address = addresses[index++ % addresses.length];
        if ("all" in options && options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    },
  });
}

export class SafeContentExtractor implements ContentExtractor {
  constructor(
    private readonly config: ExtractorConfig,
    private readonly fetcher: FetchWithDispatcher = fetch,
  ) {}

  async extract(
    source: SearchResult,
    limits: ExtractionLimits,
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
        const raw = new TextDecoder().decode(buffer);
        const text = contentType === "text/html" ? readableText(raw) : raw;
        const bounded = text
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, limits.maxCharacters);
        if (bounded.length < this.config.minCharacters) {
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
            characterCount: bounded.length,
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
