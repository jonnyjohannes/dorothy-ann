import type { SearchResult, SearchResultKind } from "../domain/types.js";
export interface SearchOptions { maxResults: number; resultKind?: SearchResultKind; locale?: string; safeSearch?: "off" | "moderate" | "strict" }
export interface SearchProvider { search(query: string, options: SearchOptions): Promise<SearchResult[]> }
