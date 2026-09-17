// @vitest-environment node

import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IdentityPolicy } from "../src/application/identity-policy.js";
import { EvidenceAcquirer } from "../src/application/evidence-acquirer.js";
import { ResearchAssessor } from "../src/application/research-assessor.js";
import { ResearchResolver } from "../src/application/research-resolver.js";
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
    const result = await resolver.resolve(input);
    expect(result.kind).toBe("resolution");
    if (result.kind !== "resolution") return;
    expect(result.resolution.status).toBe("sufficient");
    expect(result.resolution.ledger.searchesUsed).toBe(1);
    expect(result.resolution.tasks).toHaveLength(1);
    expect(calls).toBe(2);
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
