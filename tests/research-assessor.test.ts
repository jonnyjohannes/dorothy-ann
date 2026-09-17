// @vitest-environment node

import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IdentityPolicy } from "../src/application/identity-policy.js";
import {
  MAX_ASSESSMENTS,
  ResearchAssessor,
  type ResearchAssessorInput,
} from "../src/application/research-assessor.js";
import type { GapLedger, KnowledgeUnit, ResearchProblem, ThreadContext, TurnId } from "../src/domain/types.js";
import { WebCryptoIdentityHasher } from "../src/infrastructure/identity/web-crypto-hasher.js";

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}` as TurnId;
const hasher = new WebCryptoIdentityHasher(webcrypto.subtle as unknown as SubtleCrypto);

const emptyContext = (turnId: TurnId): ThreadContext => ({
  threadId: uuid(99) as never,
  turns: [{ turnId, kind: "research", request: "prior", outcome: "insufficient" }],
  knownSources: [],
  availableEvidence: [],
});

const makeInput = async (overrides: Partial<ResearchAssessorInput> = {}): Promise<ResearchAssessorInput> => {
  const identities = new IdentityPolicy(hasher);
  const turnId = uuid(1);
  const problemId = await identities.problemId({ turnId, question: "What happened?", purpose: "Explain", successCriterion: "A supported explanation" });
  const problem: ResearchProblem = {
    id: problemId,
    question: "What happened?",
    purpose: "Explain",
    successCriterion: "A supported explanation",
    context: emptyContext(turnId),
    depth: 0,
  };
  const knowledge: KnowledgeUnit = { problemId, findings: [], evidence: [], unresolvedGapIds: [] };
  const ledger: GapLedger = { gaps: [], assessmentsUsed: 0, searchesUsed: 0, sourcesConsumed: 0 };
  return { problem, knowledge, ledger, proposal: { directive: { kind: "search", query: "independent timeline", purpose: "Find evidence", successCriterion: "A supported explanation", priority: 1 } }, ...overrides };
};

describe("ResearchAssessor", () => {
  it("normalizes and derives trusted resolved findings, preserving duplicate identity", async () => {
    const identities = new IdentityPolicy(hasher);
    const sourceId = await identities.sourceId("https://example.com/report");
    const input = await makeInput({
      allowedSupportRefs: [{ type: "source", sourceId }],
      proposal: { directive: { kind: "resolved", observations: [
        { proposition: "  Ｗhat happened  ", statement: "  The event occurred. ", stance: "supports", support: [{ type: "source", sourceId }] },
        { proposition: "what happened", statement: "the event occurred.", stance: "supports", support: [{ type: "source", sourceId }, { type: "source", sourceId }] },
      ] } },
    });
    const result = await new ResearchAssessor(identities).assess(input);
    expect(result.problemId).toBe(input.problem.id);
    expect(result.directive.kind).toBe("resolved");
    if (result.directive.kind !== "resolved") return;
    expect(result.directive.knowledge.findings).toHaveLength(1);
    expect(result.directive.knowledge.findings[0].observations).toHaveLength(1);
    expect(result.directive.knowledge.findings[0].proposition).toBe("what happened");
    expect(result.directive.knowledge.unresolvedGapIds).toEqual([]);
  });

  it("rejects unsupported and malformed support references", async () => {
    const input = await makeInput({
      proposal: { directive: { kind: "resolved", observations: [{ proposition: "Fact", statement: "Statement", stance: "supports", support: [{ type: "source", sourceId: "src_invalid" as never }] }] } },
    });
    await expect(new ResearchAssessor(new IdentityPolicy(hasher)).assess(input)).rejects.toMatchObject({ code: "support_invalid" });
  });

  it("constructs bounded search and deduplicated all/any decomposition directives", async () => {
    const assessor = new ResearchAssessor(new IdentityPolicy(hasher));
    const search = await makeInput({ proposal: { directive: { kind: "search", query: "  current reporting ", purpose: "  Find reports ", successCriterion: "  A supported explanation ", priority: 2 } } });
    await expect(assessor.assess(search)).resolves.toMatchObject({ directive: { kind: "search", query: "current reporting", priority: 2 } });

    const decomposition = await makeInput({ proposal: { directive: { kind: "decompose", operator: "all", problems: [
      { question: "First cause", purpose: "Find cause", successCriterion: "Cause supported", priority: 1 },
      { question: " first cause ", purpose: "find cause", successCriterion: "cause supported", priority: 1 },
    ] } } });
    const result = await assessor.assess(decomposition);
    expect(result.directive).toMatchObject({ kind: "decompose", operator: "all", problems: [{ question: "first cause" }] });
  });

  it("enforces child, observation, and assessment limits", async () => {
    const assessor = new ResearchAssessor(new IdentityPolicy(hasher));
    const tooManyChildren = await makeInput({ proposal: { directive: { kind: "decompose", operator: "any", problems: [
      { question: "a", purpose: "a", successCriterion: "a", priority: 1 },
      { question: "b", purpose: "b", successCriterion: "b", priority: 1 },
      { question: "c", purpose: "c", successCriterion: "c", priority: 1 },
      { question: "d", purpose: "d", successCriterion: "d", priority: 1 },
    ] } } });
    await expect(assessor.assess(tooManyChildren)).rejects.toMatchObject({ code: "child_problem_bounds" });

    const exhausted = await makeInput({ ledger: { gaps: [], assessmentsUsed: MAX_ASSESSMENTS, searchesUsed: 0, sourcesConsumed: 0 } });
    await expect(assessor.assess(exhausted)).rejects.toMatchObject({ code: "assessment_budget_exhausted" });
  });

  it("allows the initial search to restate the current problem", async () => {
    const input = await makeInput({ proposal: { directive: { kind: "search", query: " what happened? ", purpose: "Find evidence", successCriterion: "A supported explanation", priority: 1 } } });
    await expect(new ResearchAssessor(new IdentityPolicy(hasher)).assess(input)).resolves.toMatchObject({ directive: { kind: "search", query: "what happened?" } });
  });
});
