import { describe, expect, it } from "vitest";
import { EvidenceAcquirer, type EvidenceRequest } from "../src/application/evidence-acquirer.js";
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

  it("does not backfill a failed extraction and caps extraction concurrency at three", async () => {
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

