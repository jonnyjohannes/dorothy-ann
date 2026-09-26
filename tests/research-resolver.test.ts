// @vitest-environment node

import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IdentityPolicy } from "../src/application/identity-policy.js";
import { EvidenceAcquirer } from "../src/application/evidence-acquirer.js";
import { ResearchAssessor } from "../src/application/research-assessor.js";
import { ResearchResolver } from "../src/application/research-resolver.js";
import { executeResearchTurn } from "../src/application/execute-research-turn.js";
import type { GapLedger, KnowledgeUnit, ResearchProblem, ThreadContext, TurnId } from "../src/domain/types.js";
import type { ResearchAssessmentProposal } from "../src/application/research-assessor.js";
import { WebCryptoIdentityHasher } from "../src/infrastructure/identity/web-crypto-hasher.js";
import { researchResolutionV3Schema, turnV3Schema } from "../src/domain/schemas.js";

const turnId = "00000000-0000-4000-8000-000000000001" as TurnId;
const hasher = new WebCryptoIdentityHasher(webcrypto.subtle as unknown as SubtleCrypto);
const identities = new IdentityPolicy(hasher);

const context: ThreadContext = {
  threadId: "00000000-0000-4000-8000-000000000099" as never,
  turns: [{ turnId, kind: "research", request: "Question?", outcome: "insufficient" }],
  knownSources: [],
  availableEvidence: [],
};

const makeInput = async () => {
  const problemId = await identities.problemId({ turnId, question: "Question?", purpose: "Explain", successCriterion: "Supported answer" });
  const problem: ResearchProblem = { id: problemId, question: "Question?", purpose: "Explain", successCriterion: "Supported answer", context, depth: 0 };
  const knowledge: KnowledgeUnit = { problemId, findings: [], evidence: [], unresolvedGapIds: [] };
  const ledger: GapLedger = { gaps: [], assessmentsUsed: 0, searchesUsed: 0, sourcesConsumed: 0 };
  return { turnId, problem, knowledge, ledger, budget: { searchesRemaining: 3, sourcesRemaining: 9, assessmentsRemaining: 8, depthRemaining: 2 } };
};

describe("ResearchResolver", () => {
  it("searches, reassesses the parent, and returns one sufficient resolution", async () => {
    const input = await makeInput();
    let calls = 0;
    const phases: string[] = [];
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ problem, knowledge }): Promise<ResearchAssessmentProposal> => {
        calls += 1;
        if (knowledge.evidence.length === 0) return { directive: { kind: "search", query: "independent reporting", purpose: "Find evidence", successCriterion: problem.successCriterion, priority: 1 } };
        return { directive: { kind: "resolved", observations: [{ proposition: "The answer", statement: "The available evidence supports the answer.", stance: "supports", support: [{ type: "turn", turnId }] }] } };
      },
      acquirer: new EvidenceAcquirer({ fixture: true }),
    });
    const result = await resolver.resolve({ ...input, onPhase: (phase) => { phases.push(phase); } });
    expect(result.kind).toBe("resolution");
    if (result.kind !== "resolution") return;
    expect(phases.filter((phase, index) => phase !== phases[index - 1])).toEqual([
      "resolving", "searching", "extracting", "resolving", "assessing", "resolving",
    ]);
    expect(result.resolution.status).toBe("sufficient");
    expect(result.resolution.ledger.searchesUsed).toBe(1);
    expect(result.resolution.tasks).toHaveLength(1);
    // The root retrieval uses the exact question before the first assessor
    // call; the assessor is reserved for deciding what to do with evidence.
    expect(calls).toBe(1);
  });

  it.each([
    { label: "agreeing", secondStance: "supports" as const, findingStatus: "supported" },
    { label: "disagreeing", secondStance: "contradicts" as const, findingStatus: "contested" },
  ])("synthesizes once with two $label source accounts, preserving their stance", async ({ secondStance, findingStatus }) => {
    const input = await makeInput();
    const candidates = await Promise.all([1, 2].map(async (rank) => {
      const url = `https://research.example.test/account-${rank}`;
      return { kind: "link" as const, sourceId: await identities.sourceId(url), rank, title: `Account ${rank}`, url, canonicalUrl: url, displayUrl: "research.example.test" };
    }));
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ knowledge }): Promise<ResearchAssessmentProposal> => {
        const ids = knowledge.evidence.flatMap((pack) => pack.sources.map(({ sourceId }) => sourceId));
        return { directive: { kind: "resolved", observations: [
          { proposition: "How accounts describe the release", statement: "One account praised it.", stance: "supports", support: [{ type: "source", sourceId: ids[0] }] },
          { proposition: "How accounts describe the release", statement: "Another account described its own experience.", stance: secondStance, support: [{ type: "source", sourceId: ids[1] }] },
        ] } };
      },
      acquirer: new EvidenceAcquirer({ search: { search: async () => candidates }, fixture: true }),
    });
    const root = await resolver.resolve(input);
    expect(root.kind).toBe("resolution");
    if (root.kind !== "resolution") return;
    expect(root.resolution.status).toBe("sufficient");
    expect(root.resolution.knowledge.findings[0].status).toBe(findingStatus);
    let syntheses = 0;
    const execution = await executeResearchTurn({
      turnId, userMessage: { id: "00000000-0000-4000-8000-000000000002" as never, role: "user", content: "Question?", createdAt: "2026-01-01T00:00:00.000Z" as never },
      createdAt: "2026-01-01T00:00:00.000Z" as never, context, answerPosition: "initial",
      resolver: { resolve: async () => root.resolution },
      synthesizer: { synthesize: async ({ resolution }) => {
        syntheses++;
        expect(resolution.knowledge.findings[0].status).toBe(findingStatus);
        return { parts: [{ type: "text", markdown: "Both accounts are represented." }, ...candidates.map(({ sourceId }) => ({ type: "citation" as const, sourceId }))] };
      } },
      assessmentModelRef: "assessment", synthesisModelRef: "synthesis", searchRef: "search",
    });
    expect(syntheses).toBe(1);
    expect(execution.turn).toMatchObject({ status: "completed", result: { completion: "sufficient" } });
    expect(turnV3Schema.safeParse(execution.turn).success).toBe(true);
  });

  it("lets a one-source child resolve, then gates only the joined root before one synthesis", async () => {
    const input = await makeInput();
    const urls = ["https://research.example.test/root", "https://research.example.test/child"];
    const [rootId, childId] = await Promise.all(urls.map((url) => identities.sourceId(url)));
    let syntheses = 0;
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ problem, knowledge }): Promise<ResearchAssessmentProposal> => {
        const ids = knowledge.evidence.flatMap((pack) => pack.sources.map((source) => source.sourceId));
        if (problem.depth === 0 && ids.length === 1) return { directive: { kind: "decompose", operator: "all", problems: [{ question: "Child perspective", purpose: "Inspect it", successCriterion: "Evidence for the child", priority: 1 }] } };
        if (problem.depth === 1 && ids.length === 1) return { directive: { kind: "search", query: "child perspective", purpose: "Find another account", successCriterion: problem.successCriterion, priority: 1 } };
        return { directive: { kind: "resolved", observations: [{ proposition: "The accounts are available", statement: "The relevant evidence is available.", stance: "supports", support: [{ type: "source", sourceId: problem.depth === 1 ? childId : rootId }] }] } };
      },
      acquirer: new EvidenceAcquirer({
        fixture: true,
        search: { search: async (query) => {
          const child = query === "child perspective";
          const url = urls[child ? 1 : 0];
          return [{ kind: "link", sourceId: child ? childId : rootId, rank: 1, title: "Evidence", url, canonicalUrl: url, displayUrl: "research.example.test" }];
        } },
      }),
    });
    const root = await resolver.resolve(input);
    expect(root.kind).toBe("resolution");
    if (root.kind !== "resolution") return;
    expect(root.resolution).toMatchObject({ status: "sufficient", ledger: { searchesUsed: 2, sourcesConsumed: 2 } });
    expect(root.resolution.ledger.gaps.some((gap) => gap.problem.depth === 1 && gap.status === "resolved")).toBe(true);
    const execution = await executeResearchTurn({
      turnId, userMessage: { id: "00000000-0000-4000-8000-000000000002" as never, role: "user", content: "Question?", createdAt: "2026-01-01T00:00:00.000Z" as never },
      createdAt: "2026-01-01T00:00:00.000Z" as never, context, answerPosition: "initial",
      resolver: { resolve: async () => root.resolution },
      synthesizer: { synthesize: async () => { syntheses++; return { parts: [{ type: "text", markdown: "Both accounts are available." }] }; } },
      assessmentModelRef: "assessment", synthesisModelRef: "synthesis", searchRef: "search",
    });
    expect(syntheses).toBe(1);
    expect(execution.turn).toMatchObject({ status: "completed", result: { completion: "sufficient" } });
    expect(turnV3Schema.safeParse(execution.turn).success).toBe(true);
  });

  it("marks recursing when assessment requests more research after initial evidence", async () => {
    const input = await makeInput();
    const phases: string[] = [];
    let assessments = 0;
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ problem }): Promise<ResearchAssessmentProposal> => {
        assessments += 1;
        if (assessments === 1) return { directive: { kind: "search", query: "follow-up reporting", purpose: "Fill a material gap", successCriterion: problem.successCriterion, priority: 1 } };
        return { directive: { kind: "resolved", observations: [{ proposition: "The answer", statement: "The accumulated evidence supports the answer.", stance: "supports", support: [{ type: "turn", turnId }] }] } };
      },
      acquirer: new EvidenceAcquirer({
        fixture: true,
        search: { search: async (query) => [1, 2].map((rank) => {
          const url = `https://example.com/${query === "Question?" ? "initial" : "followup"}-${rank}`;
          return { kind: "link" as const, sourceId: url as never, rank, title: "Fixture evidence", url, canonicalUrl: url, displayUrl: "example.com" };
        }) },
      }),
    });
    const result = await resolver.resolve({ ...input, onPhase: (phase) => { phases.push(phase); } });
    expect(result.kind).toBe("resolution");
    expect(phases).toContain("recursing");
    expect(phases.indexOf("recursing")).toBeLessThan(phases.lastIndexOf("searching"));
    expect(assessments).toBe(2);
  });

  it("recovers a second usable source from rank four without spending another search", async () => {
    const input = await makeInput();
    const candidates = await Promise.all([1, 2, 3, 4, 5].map(async (rank) => {
      const url = `https://research.example.test/${rank}`;
      return { kind: "link" as const, sourceId: await identities.sourceId(url), rank, title: `Report ${rank}`, url, canonicalUrl: url, displayUrl: "research.example.test" };
    }));
    let searches = 0;
    const extracted: number[] = [];
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async (): Promise<ResearchAssessmentProposal> => ({ directive: { kind: "resolved", observations: [{ proposition: "Two accounts", statement: "Both perspectives are available.", stance: "supports", support: [{ type: "turn", turnId }] }] } }),
      acquirer: new EvidenceAcquirer({
        search: { search: async () => { searches++; return candidates; } },
        extractor: { extract: async (candidate) => {
          extracted.push(candidate.rank);
          return candidate.rank === 1 || candidate.rank === 4
            ? { sourceId: candidate.sourceId, status: "viable" as const, page: { sourceId: candidate.sourceId, canonicalUrl: candidate.canonicalUrl, title: candidate.title, text: "A distinct extracted report.", extractedAt: "2026-01-01T00:00:00.000Z" as never, characterCount: 28 } }
            : { sourceId: candidate.sourceId, status: "skipped" as const, reason: "empty_content" as const };
        } },
      }),
    });
    const result = await resolver.resolve({ ...input, budget: { ...input.budget, sourcesRemaining: 12 } });
    expect(result.kind).toBe("resolution");
    if (result.kind !== "resolution") return;
    expect(searches).toBe(1);
    expect(extracted.slice(3)).toEqual([4]);
    expect(result.resolution).toMatchObject({ status: "sufficient", ledger: { searchesUsed: 1, sourcesConsumed: 4 } });
    expect(result.resolution.tasks[0].evidence.map(({ sourceId }) => sourceId)).toEqual([candidates[0].sourceId, candidates[3].sourceId]);
    expect(result.resolution.sources?.map(({ sourceId }) => sourceId)).toEqual([candidates[0].sourceId, candidates[3].sourceId]);
    const { sources, ...streamResolution } = result.resolution;
    expect(sources).toHaveLength(2);
    expect(researchResolutionV3Schema.safeParse(streamResolution).success).toBe(true);
    const executed = await executeResearchTurn({
      turnId, userMessage: { id: "00000000-0000-4000-8000-000000000002" as never, role: "user", content: "Question?", createdAt: "2026-01-01T00:00:00.000Z" as never },
      createdAt: "2026-01-01T00:00:00.000Z" as never, context, answerPosition: "initial",
      resolver: { resolve: async () => result.resolution },
      synthesizer: { synthesize: async () => ({ parts: [{ type: "text", markdown: "Supported answer." }] }) },
      assessmentModelRef: "assessment", synthesisModelRef: "synthesis", searchRef: "search",
    });
    expect(executed.turn.status).toBe("completed");
    expect(turnV3Schema.safeParse(executed.turn).success).toBe(true);
  });

  it("reuses current-turn viable evidence on later searches without paying to extract it twice", async () => {
    const input = await makeInput();
    const urls = ["https://research.example.test/prior", "https://research.example.test/new"];
    const [priorId, newId] = await Promise.all(urls.map((url) => identities.sourceId(url)));
    const candidates = [priorId, newId].map((sourceId, index) => ({ kind: "link" as const, sourceId, rank: index + 1, title: "Report", url: urls[index], canonicalUrl: urls[index], displayUrl: "research.example.test" }));
    const extracted: string[] = [];
    let assessments = 0;
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ problem }): Promise<ResearchAssessmentProposal> => ++assessments === 1
        ? { directive: { kind: "search", query: "new perspective", purpose: "Find another account", successCriterion: problem.successCriterion, priority: 1 } }
        : { directive: { kind: "resolved", observations: [{ proposition: "Answer", statement: "Two accounts are available.", stance: "supports", support: [{ type: "turn", turnId }] }] } },
      acquirer: new EvidenceAcquirer({
        search: { search: async (query) => query === "Question?" ? [candidates[0]] : candidates },
        extractor: { extract: async (candidate) => {
          extracted.push(candidate.sourceId);
          return { sourceId: candidate.sourceId, status: "viable" as const, page: { sourceId: candidate.sourceId, canonicalUrl: candidate.canonicalUrl, title: candidate.title, text: "Viable source text.", extractedAt: "2026-01-01T00:00:00.000Z" as never, characterCount: 19 } };
        } },
      }),
    });
    const result = await resolver.resolve({ ...input, budget: { ...input.budget, sourcesRemaining: 12 } });
    expect(result.kind).toBe("resolution");
    if (result.kind !== "resolution") return;
    expect(extracted).toEqual([priorId, newId]);
    expect(result.resolution).toMatchObject({ status: "sufficient", ledger: { searchesUsed: 2, sourcesConsumed: 2 } });
    expect(result.resolution.knowledge.evidence.flatMap((pack) => pack.sources.map((source) => source.sourceId)).sort()).toEqual([priorId, newId].sort());
  });

  it("keeps failed extraction attempts out of task evidence and terminal source closure", async () => {
    const input = await makeInput();
    const failedUrl = "https://failed.example.test/report";
    const viableUrl = "https://viable.example.test/report";
    const failedSourceId = await identities.sourceId(failedUrl);
    const viableSourceId = await identities.sourceId(viableUrl);
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ problem, knowledge }): Promise<ResearchAssessmentProposal> => knowledge.evidence.length === 0
        ? { directive: { kind: "search", query: "independent reporting", purpose: "Find evidence", successCriterion: problem.successCriterion, priority: 1 } }
        : { directive: { kind: "resolved", observations: [{ proposition: "The answer", statement: "The viable evidence supports the answer.", stance: "supports", support: [{ type: "source", sourceId: viableSourceId }] }] } },
      acquirer: new EvidenceAcquirer({
        search: { search: async () => [
          { sourceId: failedSourceId, rank: 1, title: "Failed", url: failedUrl, canonicalUrl: failedUrl, displayUrl: "failed.example.test" },
          { sourceId: viableSourceId, rank: 2, title: "Viable", url: viableUrl, canonicalUrl: viableUrl, displayUrl: "viable.example.test" },
        ] },
        extractor: { extract: async (source) => source.sourceId === failedSourceId
          ? { sourceId: source.sourceId, status: "failed", code: "fetch_failed", retryable: true }
          : { sourceId: source.sourceId, status: "viable", page: { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, title: source.title, text: "Viable evidence.", extractedAt: "2026-01-01T00:00:00.000Z" as never, characterCount: 16 } },
        },
      }),
    });

    const result = await resolver.resolve(input);
    expect(result.kind).toBe("resolution");
    if (result.kind !== "resolution") return;
    expect(result.resolution.tasks[0].evidence).toEqual([{ sourceId: viableSourceId, rank: 2 }]);
    expect(result.resolution.sources?.map(({ sourceId }) => sourceId)).toEqual([viableSourceId]);
    expect(result.resolution).toMatchObject({ status: "insufficient", stopReason: "no_new_knowledge" });

    const execution = await executeResearchTurn({
      turnId,
      userMessage: { id: "00000000-0000-4000-8000-000000000002" as never, role: "user", content: "Question?", createdAt: "2026-01-01T00:00:00.000Z" as never },
      createdAt: "2026-01-01T00:00:00.000Z" as never,
      context,
      answerPosition: "initial",
      resolver: { resolve: async () => result.resolution },
      synthesizer: { synthesize: async () => { throw new Error("must not synthesize one source"); } },
      assessmentModelRef: "assessment",
      synthesisModelRef: "synthesis",
      searchRef: "search",
    });
    expect(execution.turn).toMatchObject({ status: "failed", failure: { kind: "insufficient_evidence", retryable: true } });
    expect(execution.sources.map(({ sourceId }) => sourceId)).toEqual([viableSourceId]);
  });

  it("stops after a distinct follow-up search yields no new usable evidence, retaining one source", async () => {
    const input = await makeInput();
    const firstUrl = "https://research.example.test/first";
    const secondUrl = "https://research.example.test/second";
    const firstId = await identities.sourceId(firstUrl);
    const secondId = await identities.sourceId(secondUrl);
    const searches: string[] = [];
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ problem }): Promise<ResearchAssessmentProposal> => ({ directive: { kind: "search", query: "different query", purpose: "Find another source", successCriterion: problem.successCriterion, priority: 1 } }),
      acquirer: new EvidenceAcquirer({
        search: { search: async (query) => {
          searches.push(query);
          const first = query === "Question?";
          const canonicalUrl = first ? firstUrl : secondUrl;
          return [{ sourceId: first ? firstId : secondId, rank: 1, title: "Source", url: canonicalUrl, canonicalUrl, displayUrl: "research.example.test" }];
        } },
        extractor: { extract: async (candidate) => candidate.sourceId === firstId
          ? { sourceId: firstId, status: "viable", page: { sourceId: firstId, canonicalUrl: firstUrl, title: "Source", text: "Extracted source text.", extractedAt: "2026-01-01T00:00:00.000Z" as never, characterCount: 22 } }
          : { sourceId: secondId, status: "skipped", reason: "empty_content" },
        },
      }),
    });
    const result = await resolver.resolve(input);
    expect(result.kind).toBe("resolution");
    if (result.kind !== "resolution") return;
    expect(searches).toEqual(["Question?", "different query"]);
    expect(result.resolution).toMatchObject({ status: "insufficient", stopReason: "no_new_knowledge", ledger: { searchesUsed: 2, sourcesConsumed: 2 } });
    expect(result.resolution.knowledge.evidence.flatMap((pack) => pack.sources.map((item) => item.sourceId))).toEqual([firstId]);
    expect(result.resolution.sources?.map((item) => item.sourceId)).toEqual([firstId]);
  });

  it("returns useful searched evidence as best effort when assessment output is invalid", async () => {
    const input = await makeInput();
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async () => { throw new Error("assessment_invalid_response"); },
      acquirer: new EvidenceAcquirer({ fixture: true }),
    });
    const result = await resolver.resolve(input);
    expect(result.kind).toBe("resolution");
    if (result.kind !== "resolution") return;
    expect(result.resolution).toMatchObject({ status: "best_effort", stopReason: "provider_unavailable", ledger: { searchesUsed: 1, assessmentsUsed: 0 } });
    expect(result.resolution.knowledge.evidence).toHaveLength(1);
    expect(result.resolution.knowledge.evidence[0].sources).toHaveLength(2);
    let syntheses = 0;
    const execution = await executeResearchTurn({
      turnId, userMessage: { id: "00000000-0000-4000-8000-000000000002" as never, role: "user", content: "Question?", createdAt: "2026-01-01T00:00:00.000Z" as never },
      createdAt: "2026-01-01T00:00:00.000Z" as never, context, answerPosition: "initial",
      resolver: { resolve: async () => result.resolution },
      synthesizer: { synthesize: async () => { syntheses++; return { parts: [{ type: "text", markdown: "Qualified best effort." }] }; } },
      assessmentModelRef: "assessment", synthesisModelRef: "synthesis", searchRef: "search",
    });
    expect(syntheses).toBe(1);
    expect(execution.turn).toMatchObject({ status: "completed", result: { completion: "best_effort" } });
  });

  it("keeps prior evidence usable when follow-up assessment is unavailable", async () => {
    const input = await makeInput();
    const sourceId = await identities.sourceId("https://context.example.test/source");
    const otherId = await identities.sourceId("https://context.example.test/other");
    input.problem.context = {
      ...input.problem.context,
      knownSources: [
        { sourceId, title: "Prior source", url: "https://context.example.test/source", canonicalUrl: "https://context.example.test/source", displayUrl: "context.example.test/source" },
        { sourceId: otherId, title: "Other source", url: "https://context.example.test/other", canonicalUrl: "https://context.example.test/other", displayUrl: "context.example.test/other" },
      ],
      availableEvidence: [{ problemId: input.problem.id, requestOrder: 0, query: "prior question", createdAt: "2026-01-01T00:00:00.000Z" as never, sources: [
        { sourceId, page: { sourceId, canonicalUrl: "https://context.example.test/source", title: "Prior source", text: "Prior supported evidence.", extractedAt: "2026-01-01T00:00:00.000Z" as never, characterCount: 24 } },
        { sourceId: otherId, page: { sourceId: otherId, canonicalUrl: "https://context.example.test/other", title: "Other source", text: "Prior contrary evidence.", extractedAt: "2026-01-01T00:00:00.000Z" as never, characterCount: 23 } },
      ] }],
    };
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async () => { throw new Error("provider_unavailable"); },
      acquirer: new EvidenceAcquirer({ fixture: true }),
    });
    const result = await resolver.resolve(input);
    expect(result.kind).toBe("resolution");
    if (result.kind === "resolution") expect(result.resolution).toMatchObject({ status: "best_effort", stopReason: "provider_unavailable" });
  });

  it("leaves an unavailable assessment visibly in the assessing phase", async () => {
    const input = await makeInput();
    input.problem.depth = 1;
    const phases: string[] = [];
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async () => { throw new Error("provider_unavailable"); },
      acquirer: new EvidenceAcquirer({ fixture: true }),
    });
    const result = await resolver.resolve({ ...input, onPhase: (phase) => { phases.push(phase); } });
    expect(result.kind).toBe("resolution");
    if (result.kind === "resolution") expect(result.resolution.stopReason).toBe("provider_unavailable");
    expect(phases.at(-1)).toBe("assessing");
  });

  it("forwards cancellation to assessment without starting another operation", async () => {
    const input = await makeInput();
    input.problem.depth = 1;
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ signal }) => {
        received = signal;
        controller.abort();
        signal?.throwIfAborted();
        throw new Error("unreachable");
      },
      acquirer: new EvidenceAcquirer({ fixture: true }),
    });
    await expect(resolver.resolve({ ...input, signal: controller.signal })).rejects.toThrow();
    expect(received).toBe(controller.signal);
  });

  it("preserves a two-source best-effort answer when further searching is budget-exhausted", async () => {
    const input = await makeInput();
    input.budget.searchesRemaining = 0;
    const sources = await Promise.all([1, 2].map(async (rank) => {
      const url = `https://context.example.test/account-${rank}`;
      return { sourceId: await identities.sourceId(url), title: `Account ${rank}`, url, canonicalUrl: url, displayUrl: "context.example.test" };
    }));
    input.problem.context = { ...context, knownSources: sources, availableEvidence: [{
      problemId: input.problem.id, requestOrder: 0, query: "previous question", createdAt: "2026-01-01T00:00:00.000Z" as never,
      sources: sources.map(({ sourceId }) => ({ sourceId, page: { text: "Distinct earlier evidence.", extractedAt: "2026-01-01T00:00:00.000Z" as never, characterCount: 26 } })),
    }] };
    const resolver = new ResearchResolver({
      identities, assessor: new ResearchAssessor(identities),
      assess: async ({ problem }): Promise<ResearchAssessmentProposal> => ({ directive: { kind: "search", query: "new evidence", purpose: "Fill a gap", successCriterion: problem.successCriterion, priority: 1 } }),
      acquirer: new EvidenceAcquirer({ fixture: true }),
    });
    const root = await resolver.resolve(input);
    expect(root.kind).toBe("resolution");
    if (root.kind !== "resolution") return;
    expect(root.resolution).toMatchObject({ status: "best_effort", stopReason: "search_budget_exhausted", ledger: { searchesUsed: 0 } });
    let syntheses = 0;
    const execution = await executeResearchTurn({
      turnId, userMessage: { id: "00000000-0000-4000-8000-000000000002" as never, role: "user", content: "Question?", createdAt: "2026-01-01T00:00:00.000Z" as never },
      createdAt: "2026-01-01T00:00:00.000Z" as never, context: input.problem.context, answerPosition: "follow_up",
      resolver: { resolve: async () => root.resolution },
      synthesizer: { synthesize: async () => { syntheses++; return { parts: [{ type: "text", markdown: "Here is what the available accounts establish." }] }; } },
      assessmentModelRef: "assessment", synthesisModelRef: "synthesis", searchRef: "search",
    });
    expect(syntheses).toBe(1);
    expect(execution.turn).toMatchObject({ status: "completed", result: { completion: "best_effort" } });
    expect(turnV3Schema.safeParse(execution.turn).success).toBe(true);
  });

  it("returns insufficient evidence when the explicit search budget is exhausted", async () => {
    const input = await makeInput();
    input.budget.searchesRemaining = 0;
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ problem }): Promise<ResearchAssessmentProposal> => ({ directive: { kind: "search", query: "other reporting", purpose: "Find evidence", successCriterion: problem.successCriterion, priority: 1 } }),
      acquirer: new EvidenceAcquirer({ fixture: true }),
    });
    const result = await resolver.resolve(input);
    expect(result.kind).toBe("resolution");
    if (result.kind !== "resolution") return;
    expect(result.resolution.status).toBe("insufficient");
    expect(result.resolution.stopReason).toBe("search_budget_exhausted");
  });

  it("never recurses beyond the configured depth", async () => {
    const input = await makeInput();
    input.problem.depth = 2;
    const resolver = new ResearchResolver({
      identities,
      assessor: new ResearchAssessor(identities),
      assess: async ({ problem }): Promise<ResearchAssessmentProposal> => ({ directive: { kind: "decompose", operator: "all", problems: [{ question: "Child", purpose: "Narrow", successCriterion: problem.successCriterion, priority: 1 }] } }),
      acquirer: new EvidenceAcquirer({ fixture: true }),
    });
    const result = await resolver.resolve(input);
    expect(result.kind).toBe("resolution");
    if (result.kind !== "resolution") return;
    expect(result.resolution.stopReason).toBe("depth_limit_reached");
    expect(result.resolution.ledger.gaps.every((gap) => gap.problem.depth <= 2)).toBe(true);
  });
});
