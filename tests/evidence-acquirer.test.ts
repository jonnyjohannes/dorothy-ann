import { describe, expect, it } from "vitest";
import { EvidenceAcquirer, type EvidenceRequest, type EvidenceYieldRequest } from "../src/application/evidence-acquirer.js";
import type { ResearchBudget } from "../src/domain/types.js";
import type { SearchResult } from "../src/domain/types.js";
import { evidencePackV3Schema } from "../src/domain/schemas.js";

const request = (problemId: string, priority: 1 | 2 | 3, createdOrder: number): EvidenceRequest => ({
  problemId: problemId as EvidenceRequest["problemId"],
  query: problemId,
  purpose: "verify",
  successCriterion: "supported",
  priority,
  problemDepth: 0,
  createdOrder,
});

const source = (id: string, rank: number): SearchResult => ({
  kind: "link",
  sourceId: id as SearchResult["sourceId"],
  rank,
  title: id,
  url: `https://${id}.example.test/page`,
  canonicalUrl: `https://${id}.example.test/page`,
  displayUrl: `${id}.example.test`,
});

const budget = (overrides: Partial<ResearchBudget> = {}): ResearchBudget => ({
  searchesRemaining: 3,
  sourcesRemaining: 9,
  assessmentsRemaining: 8,
  depthRemaining: 2,
  ...overrides,
});

const extractor = async (candidate: SearchResult) => ({
  sourceId: candidate.sourceId,
  status: "viable" as const,
  page: {
    sourceId: candidate.sourceId,
    canonicalUrl: candidate.canonicalUrl,
    title: candidate.title,
    text: `evidence:${candidate.sourceId}`,
    extractedAt: "2026-01-01T00:00:00.000Z" as never,
    characterCount: 20,
  },
});

describe("EvidenceAcquirer", () => {
  it("reports bounded candidate, charged backfill, and actual extraction yield", async () => {
    const reports: EvidenceYieldRequest[][] = [];
    const candidates = [source("failed", 1), source("empty", 2), source("viable", 3), source("spare", 4), source("spare2", 5)];
    const acquirer = new EvidenceAcquirer({
      search: { search: async (query) => query === "zero" ? [] : query === "mixed" ? candidates : [null, candidates[0], candidates[0], { ...candidates[1], url: "javascript:bad", canonicalUrl: "javascript:bad" }] as SearchResult[] },
      extractor: { extract: async (candidate) => candidate.sourceId === "failed"
        ? { sourceId: candidate.sourceId, status: "failed", code: "timeout", retryable: true }
        : candidate.sourceId === "empty"
          ? { sourceId: candidate.sourceId, status: "skipped", reason: "empty_content" }
          : extractor(candidate) },
    });
    const run = (query: string) => acquirer.acquire({
      requests: [request(query, 1, 0)], knownSources: [], availableEvidenceSourceIds: [],
      budget: budget(), limits: {}, onYield: (report) => { reports.push(report); },
    });
    await run("zero");
    await run("invalid");
    const mixed = await run("mixed");
    expect(reports).toEqual([
      [{ requested: 5, returned: 0, normalized_unique: 0, invalid_discarded: 0, duplicate_discarded: 0, selected: 0, reused: 0, unselected: 0, viable: 0, empty: 0, failed: 0, fetch_failed: 0, timeout: 0, extract_failed: 0, skipped_other: 0 }],
      [{ requested: 5, returned: 4, normalized_unique: 1, invalid_discarded: 2, duplicate_discarded: 1, selected: 1, reused: 0, unselected: 0, viable: 0, empty: 0, failed: 1, fetch_failed: 0, timeout: 1, extract_failed: 0, skipped_other: 0 }],
      [{ requested: 5, returned: 5, normalized_unique: 5, invalid_discarded: 0, duplicate_discarded: 0, selected: 4, reused: 0, unselected: 1, viable: 2, empty: 1, failed: 1, fetch_failed: 0, timeout: 1, extract_failed: 0, skipped_other: 0 }],
    ]);
    expect(mixed.evidence.flatMap((pack) => pack.sources.map((item) => item.sourceId))).toEqual(["viable", "spare"]);
    await expect(new EvidenceAcquirer({ search: { search: async () => [source("safe", 1)] }, extractor: { extract: extractor } }).acquire({
      requests: [request("safe", 1, 0)], knownSources: [], availableEvidenceSourceIds: [], budget: budget(), limits: {},
      onYield: () => { throw new Error("diagnostic failure"); },
    })).resolves.toMatchObject({ selectedSources: [source("safe", 1)] });
  });

  it.each([
    { name: "selected source", searchesRemaining: 1, results: [source("selected", 1)], extractionFails: false, expected: ["searching", "extracting"] },
    { name: "empty search", searchesRemaining: 1, results: [], extractionFails: false, expected: ["searching"] },
    { name: "exhausted search budget", searchesRemaining: 0, results: [source("unused", 1)], extractionFails: false, expected: [] },
    { name: "failed extraction", searchesRemaining: 1, results: [source("failed", 1)], extractionFails: true, expected: ["searching", "extracting"] },
  ])("emits real acquisition stages for $name", async ({ searchesRemaining, results, extractionFails, expected }) => {
    const stages: string[] = [];
    await new EvidenceAcquirer({
      search: { search: async () => results },
      extractor: { extract: async (candidate) => extractionFails
        ? { sourceId: candidate.sourceId, status: "failed", code: "extract_failed", retryable: true }
        : extractor(candidate) },
    }).acquire({
      requests: [request("phase", 1, 0)],
      knownSources: [],
      availableEvidenceSourceIds: [],
      budget: budget({ searchesRemaining }),
      limits: {},
      onStage: (stage) => { stages.push(stage); },
    });
    expect(stages).toEqual(expected);
  });

  it("counts known viable context as reuse, not another selected extraction", async () => {
    const existing = source("context", 1);
    const reports: EvidenceYieldRequest[][] = [];
    let extractions = 0;
    await new EvidenceAcquirer({ search: { search: async () => [existing, source("fresh", 2)] }, extractor: { extract: async (candidate) => { extractions++; return extractor(candidate); } } }).acquire({
      requests: [request("follow-up", 1, 0)], knownSources: [existing], availableEvidenceSourceIds: [existing.sourceId],
      budget: budget({ sourcesRemaining: 1 }), limits: {}, onYield: (report) => { reports.push(report); },
    });
    expect(extractions).toBe(1);
    expect(reports[0][0]).toMatchObject({ normalized_unique: 2, selected: 1, reused: 1, unselected: 0, viable: 1 });
  });

  it("allocates rank layers fairly and performs one search per request", async () => {
    const calls: string[] = [];
    const result = await new EvidenceAcquirer({
      search: { search: async (query) => { calls.push(query); return [1, 2, 3, 4, 5].map((rank) => source(`${query}-${rank}`, rank)); } },
      extractor: { extract: extractor },
    }).acquire({
      requests: [request("a", 1, 0), request("b", 1, 1), request("c", 1, 2)],
      knownSources: [],
      availableEvidenceSourceIds: [],
      budget: budget(),
      limits: { now: () => "2026-01-01T00:00:00.000Z" as never },
    });

    expect(calls).toEqual(["a", "b", "c"]);
    expect(result.selectedSources.map((candidate) => candidate.sourceId)).toEqual([
      "a-1", "b-1", "c-1", "a-2", "b-2", "c-2", "a-3", "b-3", "c-3",
    ]);
    expect(result.results.map(({ ownedConsumedSources }) => ownedConsumedSources.map(({ sourceId }) => sourceId))).toEqual([
      ["a-1", "a-2", "a-3"], ["b-1", "b-2", "b-3"], ["c-1", "c-2", "c-3"],
    ]);
    expect(result.budget.sourcesRemaining).toBe(0);
  });

  it("deduplicates shared sources and reuses viable evidence without consuming budget", async () => {
    let extractionCalls = 0;
    const shared = source("shared", 1);
    const result = await new EvidenceAcquirer({
      search: { search: async () => [shared, source("unique", 2)] },
      extractor: { extract: async (candidate) => { extractionCalls += 1; return extractor(candidate); } },
    }).acquire({
      requests: [request("a", 1, 0), request("b", 1, 1)],
      knownSources: [],
      availableEvidenceSourceIds: ["available" as never],
      budget: budget({ sourcesRemaining: 2 }),
      limits: { now: () => "2026-01-01T00:00:00.000Z" as never },
    });

    expect(extractionCalls).toBe(2);
    expect(result.selectedSources.map(({ sourceId }) => sourceId)).toEqual(["shared", "unique"]);
    expect(result.results[0].evidenceSourceIds).toContain("shared");
    expect(result.results[1].evidenceSourceIds).toContain("shared");
    expect(result.budget.sourcesRemaining).toBe(0);
  });

  it("normalizes extracted evidence to bounded Unicode code points", async () => {
    const validProblemId = `problem_${"A".repeat(43)}`;
    const unicodeSource = { ...source("unicode", 1), sourceId: `src_${"B".repeat(43)}` as SearchResult["sourceId"] };
    const result = await new EvidenceAcquirer({
      search: { search: async () => [unicodeSource] },
      extractor: { extract: async (candidate) => ({
        sourceId: candidate.sourceId,
        status: "viable" as const,
        page: {
          sourceId: candidate.sourceId,
          canonicalUrl: candidate.canonicalUrl,
          title: candidate.title,
          text: "A😀B",
          extractedAt: "2026-01-01T00:00:00.000Z" as never,
          characterCount: 4,
        },
      }) },
    }).acquire({
      requests: [request(validProblemId, 1, 0)],
      knownSources: [],
      availableEvidenceSourceIds: [],
      budget: budget(),
      limits: { extractionMaxCharacters: 2, now: () => "2026-01-01T00:00:00.000Z" as never },
    });

    expect(result.evidence[0].sources[0].page).toMatchObject({ text: "A😀", characterCount: 2 });
    expect(evidencePackV3Schema.safeParse(result.evidence[0]).success).toBe(true);
  });

  it("retains metadata for already-available search matches", async () => {
    const result = await new EvidenceAcquirer({
      search: { search: async () => [source("available", 1)] },
      extractor: { extract: extractor },
    }).acquire({
      requests: [request("a", 1, 0)],
      knownSources: [],
      availableEvidenceSourceIds: ["available" as never],
      budget: budget({ sourcesRemaining: 0 }),
      limits: { now: () => "2026-01-01T00:00:00.000Z" as never },
    });

    expect(result.results[0].evidenceSourceIds).toEqual(["available"]);
    expect(result.admittedSources.map(({ sourceId }) => sourceId)).toEqual(["available"]);
  });

  it("cannot backfill a failed extraction when the turn source budget is exhausted, and caps extraction concurrency at three", async () => {
    let active = 0;
    let peak = 0;
    const result = await new EvidenceAcquirer({
      search: { search: async () => [1, 2, 3, 4, 5].map((rank) => source(`s${rank}`, rank)) },
      extractor: { extract: async (candidate) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        if (candidate.sourceId === "s1") return { sourceId: candidate.sourceId, status: "skipped" as const, reason: "empty_content" as const };
        return extractor(candidate);
      } },
    }).acquire({
      requests: [request("a", 1, 0)],
      knownSources: [],
      availableEvidenceSourceIds: [],
      budget: budget({ sourcesRemaining: 3 }),
      limits: { extractionConcurrency: 3, now: () => "2026-01-01T00:00:00.000Z" as never },
    });

    expect(peak).toBeLessThanOrEqual(3);
    expect(result.selectedSources.map(({ sourceId }) => sourceId)).toEqual(["s1", "s2", "s3"]);
    expect(result.results[0].failure).toBeUndefined();
    expect(result.admittedSources.map(({ sourceId }) => sourceId)).toEqual(["s2", "s3"]);
  });

  it("tries both ranked spares when needed, charging empty attempts and stopping after a second viable page", async () => {
    const attempted: string[] = [];
    const yields: EvidenceYieldRequest[][] = [];
    const sourceForRank = (rank: number) => ({ ...source(`s${rank}`, rank), sourceId: `src_${String(rank).repeat(43)}` as SearchResult["sourceId"] });
    const result = await new EvidenceAcquirer({
      search: { search: async () => [1, 2, 3, 4, 5].map(sourceForRank) },
      extractor: { extract: async (candidate) => {
        attempted.push(candidate.sourceId);
        return candidate.rank === 1 || candidate.rank === 5
          ? extractor(candidate)
          : { sourceId: candidate.sourceId, status: "skipped" as const, reason: "empty_content" as const };
      } },
    }).acquire({
      requests: [request(`problem_${"A".repeat(43)}`, 1, 0)], knownSources: [], availableEvidenceSourceIds: [],
      budget: budget({ sourcesRemaining: 12 }), limits: { now: () => "2026-01-01T00:00:00.000Z" as never },
      onYield: (report) => { yields.push(report); },
    });
    expect(attempted.slice(3)).toEqual([sourceForRank(4).sourceId, sourceForRank(5).sourceId]);
    expect(result.selectedSources.map(({ sourceId }) => sourceId)).toEqual([1, 2, 3, 4, 5].map((rank) => sourceForRank(rank).sourceId));
    expect(result.budget.sourcesRemaining).toBe(7);
    expect(result.evidence[0].sources.map(({ sourceId }) => sourceId)).toEqual([sourceForRank(1).sourceId, sourceForRank(5).sourceId]);
    expect(evidencePackV3Schema.safeParse(result.evidence[0]).success).toBe(true);
    expect(yields[0][0]).toMatchObject({ selected: 5, viable: 2, empty: 3, unselected: 0 });
  });

  it("does not backfill when admitted evidence plus new extraction already meets the root floor", async () => {
    const attempted: string[] = [];
    const existing = source("context", 1);
    const result = await new EvidenceAcquirer({
      search: { search: async () => [1, 2, 3, 4, 5].map((rank) => source(`s${rank}`, rank)) },
      extractor: { extract: async (candidate) => {
        attempted.push(candidate.sourceId);
        return candidate.sourceId === "s1" ? extractor(candidate) : { sourceId: candidate.sourceId, status: "skipped" as const, reason: "empty_content" as const };
      } },
    }).acquire({
      requests: [request("follow-up", 1, 0)], knownSources: [existing], availableEvidenceSourceIds: [existing.sourceId],
      budget: budget({ sourcesRemaining: 12 }), limits: {},
    });
    expect(attempted).toHaveLength(3);
    expect(result.selectedSources.map(({ sourceId }) => sourceId)).toEqual(["s1", "s2", "s3"]);
    expect(result.budget.sourcesRemaining).toBe(9);
  });

  it("keeps rank-layer fairness and the twelve-attempt global ceiling across three sparse requests", async () => {
    const result = await new EvidenceAcquirer({
      search: { search: async (query) => [1, 2, 3, 4, 5].map((rank) => source(`${query}-${rank}`, rank)) },
      extractor: { extract: async (candidate) => ({ sourceId: candidate.sourceId, status: "skipped" as const, reason: "empty_content" as const }) },
    }).acquire({
      requests: [request("a", 1, 0), request("b", 2, 1), request("c", 3, 2)],
      knownSources: [], availableEvidenceSourceIds: [], budget: budget({ sourcesRemaining: 12 }), limits: {},
    });
    expect(result.selectedSources.map(({ sourceId }) => sourceId)).toEqual([
      "a-1", "b-1", "c-1", "a-2", "b-2", "c-2", "a-3", "b-3", "c-3", "a-4", "b-4", "c-4",
    ]);
    expect(result.budget.sourcesRemaining).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it("never exceeds five charged attempts per request when all candidates are empty", async () => {
    const result = await new EvidenceAcquirer({
      search: { search: async (query) => [1, 2, 3, 4, 5].map((rank) => source(`${query}-${rank}`, rank)) },
      extractor: { extract: async (candidate) => ({ sourceId: candidate.sourceId, status: "skipped" as const, reason: "empty_content" as const }) },
    }).acquire({
      requests: [request("a", 1, 0), request("b", 2, 1)], knownSources: [], availableEvidenceSourceIds: [],
      budget: budget({ sourcesRemaining: 12 }), limits: {},
    });
    expect(result.results.map(({ ownedConsumedSources }) => ownedConsumedSources.length)).toEqual([5, 5]);
    expect(result.selectedSources.map(({ sourceId }) => sourceId)).toEqual([
      "a-1", "b-1", "a-2", "b-2", "a-3", "b-3", "a-4", "b-4", "a-5", "b-5",
    ]);
    expect(result.budget.sourcesRemaining).toBe(2);
  });

  it("keeps allocation and evidence order stable when extraction completes out of order", async () => {
    const run = async (delays: number[]) => new EvidenceAcquirer({
      search: { search: async () => [1, 2, 3].map((rank) => source(`s${rank}`, rank)) },
      extractor: { extract: async (candidate) => {
        await new Promise((resolve) => setTimeout(resolve, delays[Number(String(candidate.sourceId).slice(1)) - 1]));
        return extractor(candidate);
      } },
    }).acquire({
      requests: [request("a", 1, 0)],
      knownSources: [],
      availableEvidenceSourceIds: [],
      budget: budget({ sourcesRemaining: 3 }),
      limits: { extractionConcurrency: 3, now: () => "2026-01-01T00:00:00.000Z" as never },
    });

    const first = await run([8, 1, 4]);
    const second = await run([1, 8, 4]);
    expect(first.selectedSources).toEqual(second.selectedSources);
    expect(first.extractions).toEqual(second.extractions);
    expect(first.evidence).toEqual(second.evidence);
  });

  it("strips provider-only fields and bounds canonical metadata before admission", async () => {
    const candidate = { ...source("bounded", 1), title: "t".repeat(600), snippet: "s".repeat(1_100), providerPayload: "must not escape" } as SearchResult;
    const result = await new EvidenceAcquirer({ search: { search: async () => [candidate] }, extractor: { extract: extractor } }).acquire({
      requests: [request("bounded", 1, 0)],
      knownSources: [],
      availableEvidenceSourceIds: [],
      budget: budget({ searchesRemaining: 1, sourcesRemaining: 1 }),
      limits: {},
    });
    expect(result.admittedSources).toHaveLength(1);
    expect([...result.admittedSources[0].title]).toHaveLength(500);
    expect([...(result.admittedSources[0].snippet ?? "")]).toHaveLength(1_000);
    expect(result.admittedSources[0]).not.toHaveProperty("providerPayload");
  });

  it("returns typed partial failures while preserving viable sibling evidence", async () => {
    const result = await new EvidenceAcquirer({
      search: { search: async (query) => query === "broken" ? Promise.reject(new Error("provider_unavailable")) : [source("ok", 1)] },
      extractor: { extract: extractor },
    }).acquire({
      requests: [request("ok", 1, 0), request("broken", 2, 1)],
      knownSources: [],
      availableEvidenceSourceIds: [],
      budget: budget(),
      limits: { now: () => "2026-01-01T00:00:00.000Z" as never },
    });

    expect(result.results[1].failure).toEqual({ code: "search_unavailable", retryable: true });
    expect(result.admittedSources.map(({ sourceId }) => sourceId)).toEqual(["ok"]);
    expect(result.evidence).toHaveLength(1);
  });
});

