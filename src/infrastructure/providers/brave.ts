import { normalizeCanonicalUrl } from "../../domain/identity-material.js";
import type { SourceId } from "../../domain/types.js";
import type { SearchResult } from "../../domain/types.js";
import type { SearchOptions, SearchProvider } from "../../ports/providers.js";

type BraveFetch = (input: string, init?: RequestInit) => Promise<Response>;
const boundedText = (value: string, maximum: number): string => [...value].slice(0, maximum).join("");
const boundedUrl = (value: string): boolean => [...value].length <= 2_048;

interface SourceIdentity {
  sourceId(canonicalUrl: string): Promise<SourceId>;
}

export class BraveSearchProvider implements SearchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: BraveFetch = fetch,
    private readonly identities: SourceIdentity,
    private readonly endpoint = "https://api.search.brave.com/res/v1/web/search",
  ) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const url = new URL(this.endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(options.maxResults, 10)));
    if (options.locale) url.searchParams.set("search_lang", options.locale);
    const response = await this.fetcher(url.toString(), { headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey } });
    if (!response.ok) throw new Error(response.status === 429 ? "provider_rate_limited" : "provider_unavailable");
    return normalizeBravePayload(await response.json() as unknown, options.maxResults, this.identities);
  }
}

export async function normalizeBravePayload(
  payload: unknown,
  maxResults: number,
  identities: SourceIdentity,
): Promise<SearchResult[]> {
  const entries = typeof payload === "object" && payload !== null && "web" in payload && typeof payload.web === "object" && payload.web !== null && "results" in payload.web && Array.isArray(payload.web.results) ? payload.web.results : null;
  if (!entries) throw new Error("invalid_response");
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const entry of entries) {
    if (results.length >= maxResults || typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.title !== "string" || typeof item.url !== "string") continue;
    let canonicalUrl: string;
    try { canonicalUrl = normalizeCanonicalUrl(item.url); } catch { continue; }
    const title = boundedText(item.title, 500);
    if (!title || !boundedUrl(canonicalUrl) || seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    const sourceId = await identities.sourceId(canonicalUrl);
    results.push({
      sourceId: sourceId as SearchResult["sourceId"],
      rank: results.length + 1,
      title,
      url: canonicalUrl,
      canonicalUrl,
      displayUrl: boundedText(new URL(canonicalUrl).hostname, 512),
      snippet: typeof item.description === "string" ? boundedText(item.description, 1_000) : undefined,
    });
  }
  return results;
}
