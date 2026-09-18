import { normalizeCanonicalUrl } from "../domain/identity-material.js";
import type {
  CanonicalSource,
  EvidencePack,
  IsoTimestamp,
  ResearchBudget,
  ResearchProblemId,
} from "../domain/types.js";
import type {
  ExtractionOutcome,
  SearchResult,
} from "../domain/types.js";
import type {
  ContentExtractor,
  ExtractionLimits,
} from "../ports/extraction.js";
import type { SearchOptions, SearchProvider } from "../ports/providers.js";

export interface EvidenceRequest {
  problemId: ResearchProblemId;
  query: string;
  purpose: string;
  successCriterion: string;
  priority: 1 | 2 | 3;
  problemDepth: number;
  createdOrder: number;
}

export interface ResearchLimits {
  maxCandidatesPerSearch?: number;
  maxSourcesPerRequest?: number;
  extractionConcurrency?: number;
  extractionMaxCharacters?: number;
  extractionTimeoutMs?: number;
  /** Runtime-config aliases retained at this port boundary. */
  maxSearchResults?: number;
  maxConcurrentSearches?: number;
  maxConcurrentExtractions?: number;
  maxExtractedCharsPerPage?: number;
  now?: () => IsoTimestamp;
}

export type EvidenceAcquisitionStage = "searching" | "extracting";

export interface EvidenceAcquisitionInput {
  requests: EvidenceRequest[];
  knownSources: CanonicalSource[];
  availableEvidenceSourceIds: CanonicalSource["sourceId"][];
  budget: ResearchBudget;
  limits: ResearchLimits;
  onStage?: (stage: EvidenceAcquisitionStage) => void | Promise<void>;
}

export type EvidenceRequestFailure =
  | { code: "search_unavailable" | "invalid_response" | "extraction_failed"; retryable: true }
  | { code: "rate_limited"; retryable: true; retryAfterSeconds?: number };

export interface EvidenceRequestResult {
  request: EvidenceRequest;
  candidates: SearchResult[];
  ownedConsumedSources: SearchResult[];
  evidenceSourceIds: CanonicalSource["sourceId"][];
  failure?: EvidenceRequestFailure;
}

export interface EvidenceAcquisitionResult {
  requests: EvidenceRequest[];
  results: EvidenceRequestResult[];
  selectedSources: CanonicalSource[];
  admittedSources: CanonicalSource[];
  extractions: ExtractionOutcome[];
  evidence: EvidencePack[];
  budget: ResearchBudget;
}

export interface EvidenceAcquirerDependencies {
  search?: SearchProvider;
  extractor?: ContentExtractor;
  fixture?: boolean;
}

const DEFAULT_LIMITS = {
  maxCandidatesPerSearch: 5,
  maxSourcesPerRequest: 3,
  extractionConcurrency: 3,
  extractionMaxCharacters: 20_000,
  extractionTimeoutMs: 8_000,
};

const fixtureSource = (request: EvidenceRequest): SearchResult => ({
  sourceId: `fixture-${request.problemId}` as SearchResult["sourceId"],
  rank: 1,
  title: "Fixture evidence",
  url: "https://example.com/fixture",
  canonicalUrl: "https://example.com/fixture",
  displayUrl: "example.com/fixture",
  snippet: "Fixture evidence for local development.",
});

function fixtureExtraction(source: SearchResult): ExtractionOutcome {
  return {
    sourceId: source.sourceId,
    status: "viable",
    page: {
      sourceId: source.sourceId,
      canonicalUrl: source.canonicalUrl,
      title: source.title,
      text: "Fixture extracted evidence.",
      extractedAt: "1970-01-01T00:00:00.000Z" as IsoTimestamp,
      characterCount: 27,
    },
  };
}

function requestOrder(left: EvidenceRequest, right: EvidenceRequest): number {
  return left.priority - right.priority
    || left.problemDepth - right.problemDepth
    || left.createdOrder - right.createdOrder
    || left.problemId.localeCompare(right.problemId);
}

function failureFor(error: unknown): EvidenceRequestFailure {
  const message = error instanceof Error ? error.message : "";
  if (message === "provider_rate_limited" || message === "rate_limited" || message.includes("rate")) {
    return { code: "rate_limited", retryable: true };
  }
  if (message === "invalid_response") return { code: "invalid_response", retryable: true };
  return { code: "search_unavailable", retryable: true };
}

function canonicalKey(source: { canonicalUrl: string; url: string }): string | null {
  try {
    return normalizeCanonicalUrl(source.canonicalUrl || source.url);
  } catch {
    return null;
  }
}

function canonicalizeSearchResults(
  raw: unknown,
  maxResults: number,
  knownByUrl: ReadonlyMap<string, CanonicalSource>,
): SearchResult[] {
  if (!Array.isArray(raw)) throw new Error("invalid_response");
  const seen = new Set<string>();
  const normalized: SearchResult[] = [];
  for (const entry of raw) {
    if (normalized.length >= maxResults || typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Partial<SearchResult>;
    if (typeof candidate.title !== "string" || typeof candidate.url !== "string" || typeof candidate.canonicalUrl !== "string") continue;
    const key = canonicalKey({ url: candidate.url, canonicalUrl: candidate.canonicalUrl });
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const known = knownByUrl.get(key);
    const sourceId = known?.sourceId ?? candidate.sourceId;
    if (typeof sourceId !== "string") continue;
    const rank = typeof candidate.rank === "number" && Number.isSafeInteger(candidate.rank) && candidate.rank > 0
      ? candidate.rank
      : normalized.length + 1;
    if ([...key].length > 2_048 || typeof candidate.displayUrl !== "string") continue;
    const title = [...candidate.title].slice(0, 500).join("");
    const displayUrl = [...candidate.displayUrl].slice(0, 512).join("");
    if (!title || !displayUrl) continue;
    const snippet = typeof candidate.snippet === "string" ? [...candidate.snippet].slice(0, 1_000).join("") : undefined;
    const publishedAt = typeof candidate.publishedAt === "string" && Number.isFinite(Date.parse(candidate.publishedAt))
      ? new Date(candidate.publishedAt).toISOString() as SearchResult["publishedAt"]
      : undefined;
    normalized.push({ sourceId: sourceId as SearchResult["sourceId"], title, url: key, canonicalUrl: key, displayUrl, snippet, publishedAt, rank });
  }
  return normalized.sort((left, right) => left.rank - right.rank || left.canonicalUrl.localeCompare(right.canonicalUrl));
}

function sourceAsSearchResult(source: CanonicalSource, rank: number): SearchResult {
  return { ...source, rank };
}

function extractionLimits(limits: ResearchLimits): ExtractionLimits {
  return {
    maxCharacters: limits.extractionMaxCharacters ?? limits.maxExtractedCharsPerPage ?? DEFAULT_LIMITS.extractionMaxCharacters,
    timeoutMs: limits.extractionTimeoutMs ?? DEFAULT_LIMITS.extractionTimeoutMs,
  };
}

function normalizedPageText(text: string, maxCharacters: number): { text: string; characterCount: number } {
  const codePoints = [...text].slice(0, maxCharacters);
  return { text: codePoints.join(""), characterCount: codePoints.length };
}

/**
 * Performs only bounded search, source allocation, and extraction. Assessment,
 * recursion, joining, and synthesis deliberately remain outside this box.
 */
export class EvidenceAcquirer {
  private readonly dependencies: EvidenceAcquirerDependencies;

  constructor(dependencies: EvidenceAcquirerDependencies) {
    this.dependencies = dependencies;
  }

  async acquire(input: EvidenceAcquisitionInput): Promise<EvidenceAcquisitionResult> {
    const limits = { ...DEFAULT_LIMITS, ...input.limits };
    const maxCandidates = Math.max(0, Math.min(5, input.limits.maxCandidatesPerSearch ?? input.limits.maxSearchResults ?? limits.maxCandidatesPerSearch));
    const maxSources = Math.max(0, Math.min(3, input.limits.maxSourcesPerRequest ?? limits.maxSourcesPerRequest));
    const extractionWorkers = Math.max(1, Math.min(3, input.limits.extractionConcurrency ?? input.limits.maxConcurrentExtractions ?? limits.extractionConcurrency));
    const requests = [...input.requests].sort(requestOrder).slice(0, 3);
    const knownByUrl = new Map<string, CanonicalSource>();
    for (const source of input.knownSources) {
      const key = canonicalKey(source);
      if (key && !knownByUrl.has(key)) knownByUrl.set(key, { ...source, url: key, canonicalUrl: key });
    }

    const searchCapacity = Math.max(0, Math.min(input.budget.searchesRemaining, requests.length));
    type SearchedRequest = { request: EvidenceRequest; candidates: SearchResult[]; failure?: EvidenceRequestFailure };
    const searched = new Array<SearchedRequest>(requests.length);
    let nextSearch = 0;
    const searchWorker = async (): Promise<void> => {
      while (true) {
        const index = nextSearch++;
        if (index >= requests.length) return;
        const request = requests[index];
        if (index >= searchCapacity) {
          searched[index] = { request, candidates: [], failure: { code: "search_unavailable", retryable: true } };
          continue;
        }
        try {
          const options: SearchOptions = { maxResults: maxCandidates };
          const raw = this.dependencies.search
            ? await this.dependencies.search.search(request.query, options)
            : this.dependencies.fixture
              ? [fixtureSource(request)]
              : (() => { throw new Error("search_unavailable"); })();
          searched[index] = { request, candidates: canonicalizeSearchResults(raw, maxCandidates, knownByUrl) };
        } catch (error) {
          searched[index] = { request, candidates: [], failure: failureFor(error) };
        }
      }
    };
    const searchWorkers = Math.max(1, Math.min(3, input.limits.maxConcurrentSearches ?? 3, requests.length || 1));
    if (searchCapacity > 0) await input.onStage?.("searching");
    await Promise.all(Array.from({ length: searchWorkers }, () => searchWorker()));

    const available = new Set(input.availableEvidenceSourceIds);
    const searchedById = new Map<string, SearchResult>();
    for (const result of searched) for (const candidate of result.candidates) searchedById.set(String(candidate.sourceId), candidate);
    const selectedByKey = new Map<string, SearchResult>();
    const selectedForRequest = new Map<string, SearchResult[]>();
    const associatedForRequest = new Map<string, Set<string>>();
    const cursors = new Map<string, number>();
    const ownedCounts = new Map<string, number>();
    const maxPerRequest = maxSources;
    const sourceCapacity = Math.max(0, input.budget.sourcesRemaining);

    for (const result of searched) {
      selectedForRequest.set(result.request.problemId, []);
      associatedForRequest.set(result.request.problemId, new Set());
      cursors.set(result.request.problemId, 0);
      ownedCounts.set(result.request.problemId, 0);
    }

    // Available evidence is associated even when no new source budget remains.
    // It is already extracted by an earlier request, so it never enters the
    // extraction pool a second time.
    for (const result of searched) {
      const associated = associatedForRequest.get(result.request.problemId)!;
      for (const candidate of result.candidates) {
        const key = canonicalKey(candidate);
        if (!key) continue;
        const known = knownByUrl.get(key);
        const sourceId = known?.sourceId ?? candidate.sourceId;
        if (available.has(sourceId)) associated.add(key);
      }
    }

    // Walk candidate rank layers in request order. A shared or already viable
    // source is associated without consuming another ownership opportunity.
    let madeProgress = true;
    while (madeProgress && selectedByKey.size < sourceCapacity) {
      madeProgress = false;
      for (const result of searched) {
        const requestKey = result.request.problemId;
        if ((ownedCounts.get(requestKey) ?? 0) >= maxPerRequest) continue;
        const candidates = result.candidates;
        let cursor = cursors.get(requestKey) ?? 0;
        while (cursor < candidates.length) {
          const candidate = candidates[cursor++];
          const key = canonicalKey(candidate);
          if (!key) continue;
          const known = knownByUrl.get(key);
          const source = known ? sourceAsSearchResult(known, candidate.rank) : candidate;
          const sourceId = source.sourceId;
          const associated = associatedForRequest.get(requestKey)!;
          if (available.has(sourceId)) {
            associated.add(key);
            continue;
          }
          const existing = selectedByKey.get(key);
          if (existing) {
            associated.add(key);
            continue;
          }
          if (selectedByKey.size >= sourceCapacity) break;
          selectedByKey.set(key, source);
          selectedForRequest.get(requestKey)!.push(source);
          associated.add(key);
          ownedCounts.set(requestKey, (ownedCounts.get(requestKey) ?? 0) + 1);
          madeProgress = true;
          break;
        }
        cursors.set(requestKey, cursor);
      }
    }

    const selected = [...selectedByKey.values()];
    const extractionByKey = new Map<string, ExtractionOutcome>();
    const extractionOrder = new Map<string, number>(selected.map((source, index) => [canonicalKey(source)!, index]));
    const extractionConcurrency = Math.max(1, Math.min(extractionWorkers, 3, selected.length || 1));
    let next = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const index = next++;
        if (index >= selected.length) return;
        const source = selected[index];
        let outcome: ExtractionOutcome;
        try {
          outcome = this.dependencies.extractor
            ? await this.dependencies.extractor.extract(source, extractionLimits(limits))
            : this.dependencies.fixture
              ? fixtureExtraction(source)
              : { sourceId: source.sourceId, status: "failed", code: "extract_failed", retryable: true };
          if (outcome.sourceId !== source.sourceId) {
            outcome = { sourceId: source.sourceId, status: "failed", code: "extract_failed", retryable: false };
          }
        } catch {
          outcome = { sourceId: source.sourceId, status: "failed", code: "extract_failed", retryable: true };
        }
        extractionByKey.set(canonicalKey(source)!, outcome);
      }
    };
    if (selected.length > 0) await input.onStage?.("extracting");
    await Promise.all(Array.from({ length: extractionConcurrency }, () => worker()));

    const extractions = selected
      .sort((left, right) => (extractionOrder.get(canonicalKey(left)!) ?? 0) - (extractionOrder.get(canonicalKey(right)!) ?? 0))
      .map((source) => extractionByKey.get(canonicalKey(source)!)!)
      .filter((outcome): outcome is ExtractionOutcome => Boolean(outcome));
    const viableByKey = new Map<string, { source: SearchResult; page: NonNullable<ExtractedViablePage> }>();
    for (const source of selected) {
      const outcome = extractionByKey.get(canonicalKey(source)!);
      if (outcome?.status === "viable") viableByKey.set(canonicalKey(source)!, { source, page: outcome.page });
    }

    const results: EvidenceRequestResult[] = searched.map((searchedRequest) => {
      const requestKey = searchedRequest.request.problemId;
      const associated = associatedForRequest.get(requestKey) ?? new Set<string>();
      const owned = selectedForRequest.get(requestKey) ?? [];
      const evidenceSourceIds = [...associated]
        .map((key) => selectedByKey.get(key)?.sourceId
          ?? knownByUrl.get(key)?.sourceId
          ?? searchedRequest.candidates.find((candidate) => canonicalKey(candidate) === key)?.sourceId)
        .filter((sourceId): sourceId is CanonicalSource["sourceId"] => Boolean(sourceId));
      const failedOwned = owned.some((source) => extractionByKey.get(canonicalKey(source)!)?.status === "failed");
      const resultFailure = searchedRequest.failure ?? (failedOwned ? { code: "extraction_failed", retryable: true } : undefined);
      return {
        request: searchedRequest.request,
        candidates: searchedRequest.candidates,
        ownedConsumedSources: owned,
        evidenceSourceIds,
        ...(resultFailure ? { failure: resultFailure } : {}),
      };
    });

    const now = input.limits.now ?? (() => "1970-01-01T00:00:00.000Z" as IsoTimestamp);
    const maxEvidenceCharacters = extractionLimits(input.limits).maxCharacters;
    const evidence: EvidencePack[] = [];
    for (const result of results) {
      const sources = result.evidenceSourceIds.flatMap((sourceId) => {
        const source = [...selectedByKey.values()].find((candidate) => candidate.sourceId === sourceId) ?? searchedById.get(String(sourceId));
        if (!source) return [];
        const viable = viableByKey.get(canonicalKey(source)!);
        if (!viable) return [];
        const normalized = normalizedPageText(viable.page.text, maxEvidenceCharacters);
        if (!normalized.text) return [];
        return [{ sourceId, page: {
          ...normalized,
          extractedAt: viable.page.extractedAt,
        } }];
      });
      if (sources.length) evidence.push({
        problemId: result.request.problemId,
        requestOrder: result.request.createdOrder,
        query: result.request.query,
        sources,
        createdAt: now(),
      });
    }

    const admittedByKey = new Map<string, CanonicalSource>();
    for (const result of results) for (const sourceId of result.evidenceSourceIds) {
      const source = [...selectedByKey.values()].find((candidate) => candidate.sourceId === sourceId) ?? searchedById.get(String(sourceId));
      if (source && (available.has(sourceId) || viableByKey.has(canonicalKey(source)!))) admittedByKey.set(canonicalKey(source)!, source);
    }
    return {
      requests,
      results,
      selectedSources: selected,
      admittedSources: [...admittedByKey.values()],
      extractions,
      evidence,
      budget: {
        ...input.budget,
        searchesRemaining: Math.max(0, input.budget.searchesRemaining - searched.filter((_, index) => index < searchCapacity).length),
        sourcesRemaining: Math.max(0, input.budget.sourcesRemaining - selected.length),
      },
    };
  }
}

type ExtractedViablePage = {
  text: string;
  extractedAt: IsoTimestamp;
  characterCount: number;
};
