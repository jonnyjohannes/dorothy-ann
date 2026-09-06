import type { ExtractionOutcome, SearchResult } from "../domain/types.js";
export interface ExtractionLimits { maxCharacters: number; timeoutMs: number }
export interface ContentExtractor { extract(source: SearchResult, limits: ExtractionLimits): Promise<ExtractionOutcome> }
