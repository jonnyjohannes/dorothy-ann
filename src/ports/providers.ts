import type { SearchResult } from "../domain/types.js";
export interface SearchOptions { maxResults: number; locale?: string; safeSearch?: "off" | "moderate" | "strict" }
export interface SearchProvider { search(query: string, options: SearchOptions): Promise<SearchResult[]> }
