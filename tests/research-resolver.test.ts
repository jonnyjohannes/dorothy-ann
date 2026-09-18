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

    const execution = await executeResearchTurn({
      turnId,
      userMessage: { id: "00000000-0000-4000-8000-000000000002" as never, role: "user", content: "Question?", createdAt: "2026-01-01T00:00:00.000Z" as never },
      createdAt: "2026-01-01T00:00:00.000Z" as never,
      context,
      resolver: { resolve: async () => result.resolution },
      synthesizer: { synthesize: async () => ({ parts: [{ type: "text", markdown: "Supported answer." }] }) },
      assessmentModelRef: "assessment",
      synthesisModelRef: "synthesis",
      searchRef: "search",
    });
    expect(execution.turn.status).toBe("completed");
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
