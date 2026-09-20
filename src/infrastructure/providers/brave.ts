import { normalizeCanonicalUrl } from "../../domain/identity-material.js";
import type { ImageSearchResult, LinkSearchResult, SearchResult, SearchResultKind, SourceId, VideoSearchResult } from "../../domain/types.js";
import type { SearchOptions, SearchProvider } from "../../ports/providers.js";

type BraveFetch = (input: string, init?: RequestInit) => Promise<Response>;
const boundedText = (value: string, maximum: number): string => [...value].slice(0, maximum).join("");
const boundedUrl = (value: string): boolean => [...value].length <= 2_048;

interface SourceIdentity { sourceId(canonicalUrl: string): Promise<SourceId> }

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const normalized = normalizeCanonicalUrl(value);
    return boundedUrl(normalized) ? normalized : undefined;
  } catch { return undefined; }
}
function text(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value ? boundedText(value, maximum) : undefined;
}
function numeric(value: unknown, maximum: number): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : undefined;
}
function durationSeconds(value: unknown): number | undefined {
  if (typeof value === "number") return numeric(value, 86_400);
  if (typeof value !== "string" || !/^\d{1,2}:(?:\d{2}:)?\d{2}$/u.test(value)) return undefined;
  const parts = value.split(":").map(Number);
  const seconds = parts.length === 3 ? parts[0] * 3_600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return numeric(seconds, 86_400);
}

export class BraveSearchProvider implements SearchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: BraveFetch = fetch,
    private readonly identities: SourceIdentity,
    private readonly endpoint = "https://api.search.brave.com/res/v1/web/search",
  ) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const kind = options.resultKind ?? "link";
    const endpoint = kind === "image"
      ? this.endpoint.replace(/\/web\/search$/u, "/images/search")
      : kind === "video"
        ? this.endpoint.replace(/\/web\/search$/u, "/videos/search")
        : this.endpoint;
    const url = new URL(endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(options.maxResults, 10)));
    if (options.locale) url.searchParams.set("search_lang", options.locale);
    const response = await this.fetcher(url.toString(), { headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey } });
    if (!response.ok) throw new Error(response.status === 429 ? "provider_rate_limited" : "provider_unavailable");
    return normalizeBravePayload(await response.json() as unknown, options.maxResults, this.identities, kind);
  }
}

function normalizeLinkEntries(entries: unknown[], maxResults: number, identities: SourceIdentity): Promise<SearchResult[]> {
  return (async () => {
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const entry of entries) {
      if (results.length >= maxResults || typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const canonicalUrl = safeUrl(item.url);
      const title = text(item.title, 500);
      if (!canonicalUrl || !title || seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);
      const sourceId = await identities.sourceId(canonicalUrl);
      const result: LinkSearchResult = {
        kind: "link", sourceId, rank: results.length + 1, title, url: canonicalUrl, canonicalUrl,
        displayUrl: boundedText(new URL(canonicalUrl).hostname, 512), snippet: text(item.description, 1_000),
      };
      results.push(result);
    }
    return results;
  })();
}

async function normalizeImageEntries(entries: unknown[], maxResults: number, identities: SourceIdentity): Promise<SearchResult[]> {
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const entry of entries) {
    if (results.length >= maxResults || typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const properties = typeof item.properties === "object" && item.properties !== null ? item.properties as Record<string, unknown> : {};
    const imageUrl = safeUrl(properties.url);
    if (!imageUrl || seen.has(imageUrl)) continue;
    const title = text(item.title, 500);
    if (!title) continue;
    seen.add(imageUrl);
    const sourcePageUrl = safeUrl(item.url ?? item.source);
    const thumbnail = typeof item.thumbnail === "object" && item.thumbnail !== null ? item.thumbnail as Record<string, unknown> : {};
    const thumbnailUrl = safeUrl(thumbnail.src);
    const sourceId = await identities.sourceId(imageUrl);
    results.push({
      kind: "image", sourceId, rank: results.length + 1, title, url: imageUrl, canonicalUrl: imageUrl, imageUrl,
      sourcePageUrl, thumbnailUrl, displayUrl: sourcePageUrl ? boundedText(new URL(sourcePageUrl).hostname, 512) : boundedText(new URL(imageUrl).hostname, 512),
      snippet: text(item.description, 1_000), creator: text(item.creator ?? item.source, 500), width: numeric(properties.width, 100_000), height: numeric(properties.height, 100_000),
    } satisfies ImageSearchResult);
  }
  return results;
}

async function normalizeVideoEntries(entries: unknown[], maxResults: number, identities: SourceIdentity): Promise<SearchResult[]> {
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const entry of entries) {
    if (results.length >= maxResults || typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const video = typeof item.video === "object" && item.video !== null ? item.video as Record<string, unknown> : {};
    const videoUrl = safeUrl(item.url);
    if (!videoUrl || seen.has(videoUrl)) continue;
    const title = text(item.title, 500);
    if (!title) continue;
    seen.add(videoUrl);
    const sourcePageUrl = safeUrl(item.sourcePageUrl);
    const thumbnail = typeof item.thumbnail === "object" && item.thumbnail !== null ? item.thumbnail as Record<string, unknown> : {};
    const thumbnailUrl = safeUrl(thumbnail.original ?? thumbnail.src);
    const sourceId = await identities.sourceId(videoUrl);
    results.push({
      kind: "video", sourceId, rank: results.length + 1, title, url: videoUrl, canonicalUrl: videoUrl, videoUrl,
      sourcePageUrl: sourcePageUrl && sourcePageUrl !== videoUrl ? sourcePageUrl : undefined,
      thumbnailUrl, displayUrl: sourcePageUrl ? boundedText(new URL(sourcePageUrl).hostname, 512) : boundedText(new URL(videoUrl).hostname, 512),
      snippet: text(item.description, 1_000), creator: text(video.creator ?? item.creator, 500), durationSeconds: durationSeconds(video.duration ?? item.duration),
    } satisfies VideoSearchResult);
  }
  return results;
}

export async function normalizeBravePayload(payload: unknown, maxResults: number, identities: SourceIdentity, resultKind: SearchResultKind = "link"): Promise<SearchResult[]> {
  if (typeof payload !== "object" || payload === null) throw new Error("invalid_response");
  const root = payload as Record<string, unknown>;
  if (resultKind === "link") {
    const web = root.web;
    const entries = typeof web === "object" && web !== null && Array.isArray((web as Record<string, unknown>).results) ? (web as Record<string, unknown>).results as unknown[] : null;
    if (!entries) throw new Error("invalid_response");
    return normalizeLinkEntries(entries, maxResults, identities);
  }
  const key = resultKind === "image" ? "images" : "videos";
  const container = root[key];
  const entries = Array.isArray(root.results)
    ? root.results as unknown[]
    : typeof container === "object" && container !== null && Array.isArray((container as Record<string, unknown>).results)
      ? (container as Record<string, unknown>).results as unknown[]
      : null;
  if (!entries) throw new Error("invalid_response");
  return resultKind === "image" ? normalizeImageEntries(entries, maxResults, identities) : normalizeVideoEntries(entries, maxResults, identities);
}
