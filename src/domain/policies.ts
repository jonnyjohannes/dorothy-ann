import type { EvidencePack, ExtractedPage, SearchResult, SourceId } from "./types";

export type QueryMode = "lookup" | "research";
export function inferQueryMode(query: string): QueryMode { return query.trimEnd().endsWith("?") ? "research" : "lookup"; }
export function resolveQueryMode(query: string, override?: QueryMode): QueryMode { return override ?? inferQueryMode(query); }
export function titleFromQuery(query: string): string { const title = query.trim().replace(/\s+/g, " "); return title.length > 60 ? `${title.slice(0, 57).trimEnd()}…` : title; }
export const researchPrefixes = ["what", "what's", "why", "how", "when", "where", "who", "which", "is", "are", "can", "could", "should", "does", "do", "did"] as const;
export function canPromoteToResearch(query: string): boolean { const tokens = query.trim().toLowerCase().split(/\s+/); return tokens.length >= 4 && researchPrefixes.some((prefix) => tokens[0] === prefix); }
export function canonicalizeUrl(value: string): string { const url = new URL(value); url.hash = ""; url.hostname = url.hostname.toLowerCase(); if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = ""; return url.toString(); }
export function reconcileSearchResults(results: SearchResult[], knownSources: SearchResult[] = []): SearchResult[] { const ids = new Map(knownSources.map((source) => [source.canonicalUrl, source.sourceId])); const seen = new Set<string>(); return results.filter((result) => { const canonicalUrl = canonicalizeUrl(result.canonicalUrl || result.url); if (seen.has(canonicalUrl)) return false; seen.add(canonicalUrl); result.canonicalUrl = canonicalUrl; result.sourceId = ids.get(canonicalUrl) ?? result.sourceId; return true; }).sort((a, b) => a.rank - b.rank).map((result, index) => ({ ...result, rank: index + 1 })); }
export function buildEvidencePack(query: string, sources: SearchResult[], pages: ExtractedPage[], createdAt: string): EvidencePack { const pageMap = new Map(pages.map((page) => [page.sourceId, page])); const evidence = sources.flatMap((source) => { const page = pageMap.get(source.sourceId); return page ? [{ source, page }] : []; }); return { query, sources: evidence, createdAt: createdAt as EvidencePack["createdAt"] }; }
export function sourceIds(pack: EvidencePack): Set<SourceId> { return new Set(pack.sources.map(({ source }) => source.sourceId)); }
