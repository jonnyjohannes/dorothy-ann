import { canonicalizeUrl } from "../src/domain/policies.js";
import type { SearchResult } from "../src/domain/types.js";
import type { SearchOptions, SearchProvider } from "../src/ports/providers.js";

type BraveFetch = (input: string, init?: RequestInit) => Promise<Response>;
export class BraveSearchProvider implements SearchProvider {
  constructor(private readonly apiKey: string, private readonly fetcher: BraveFetch = fetch, private readonly endpoint = "https://api.search.brave.com/res/v1/web/search") {}
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> { const url = new URL(this.endpoint); url.searchParams.set("q", query); url.searchParams.set("count", String(Math.min(options.maxResults, 10))); if (options.locale) url.searchParams.set("search_lang", options.locale); const response = await this.fetcher(url.toString(), { headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey } }); if (!response.ok) throw new Error(response.status === 429 ? "provider_rate_limited" : "provider_unavailable"); const payload: unknown = await response.json(); return normalizeBravePayload(payload, options.maxResults); }
}
function normalizeThumbnail(value: unknown, title: string): SearchResult["image"] | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const thumbnail = value as Record<string, unknown>;
  if (typeof thumbnail.src !== "string" || thumbnail.src.length > 2_048) return undefined;
  try {
    const url = new URL(thumbnail.src);
    if (url.protocol !== "https:") return undefined;
  } catch { return undefined; }
  const dimension = (candidate: unknown) => typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0 && candidate <= 4_000 ? candidate : undefined;
  return { src: thumbnail.src, width: dimension(thumbnail.width), height: dimension(thumbnail.height), alt: title.slice(0, 300) };
}
export function normalizeBravePayload(payload: unknown, maxResults: number): SearchResult[] { const entries = typeof payload === "object" && payload !== null && "web" in payload && typeof payload.web === "object" && payload.web !== null && "results" in payload.web && Array.isArray(payload.web.results) ? payload.web.results : []; const seen = new Set<string>(); const results: SearchResult[] = []; for (const entry of entries) { if (results.length >= maxResults || typeof entry !== "object" || entry === null) continue; const item = entry as Record<string, unknown>; if (typeof item.title !== "string" || typeof item.url !== "string") continue; let canonicalUrl: string; try { canonicalUrl = canonicalizeUrl(item.url); } catch { continue; } if (seen.has(canonicalUrl)) continue; seen.add(canonicalUrl); results.push({ sourceId: `source-${results.length + 1}` as SearchResult["sourceId"], rank: results.length + 1, title: item.title, url: canonicalUrl, canonicalUrl, displayUrl: new URL(canonicalUrl).hostname, snippet: typeof item.description === "string" ? item.description : undefined, image: normalizeThumbnail(item.thumbnail, item.title) }); } return results; }
