import { describe, expect, it } from "vitest";
import type { AssistantContent, CanonicalSource, IsoTimestamp, ResearchResolutionResult, SufficientResearchResolution, ThreadContext, UserMessage } from "../src/domain/types.js";
import { AnswerSynthesizer } from "../src/application/answer-synthesizer.js";
import { executeSearchTurn } from "../src/application/execute-search-turn.js";
import { executeResearchTurn } from "../src/application/execute-research-turn.js";
import type { LLMProvider } from "../src/ports/llm.js";

const id = (value: string) => value as never;
const source: CanonicalSource = {
  sourceId: id("src_reachable"),
  title: "A source",
  url: "https://example.com/a",
  canonicalUrl: "https://example.com/a",
  displayUrl: "example.com/a",
};
const userMessage: UserMessage = { id: id("message"), role: "user", content: "What happened?", createdAt: id("2026-01-01T00:00:00.000Z") };
const extraSource: CanonicalSource = { ...source, sourceId: id("src_extra") };
const context: ThreadContext = { threadId: id("thread"), turns: [], knownSources: [source, extraSource], availableEvidence: [] };
const resolution: SufficientResearchResolution = {
  status: "sufficient",
  stopReason: "sufficient",
  knowledge: {
    problemId: id("problem"),
    findings: [],
    evidence: [{ problemId: id("problem"), requestOrder: 0, query: "What happened?", sources: [{ sourceId: source.sourceId, page: { text: "Evidence.", extractedAt: id("2026-01-01T00:00:00.000Z"), characterCount: 8 } }], createdAt: id("2026-01-01T00:00:00.000Z") }],
    unresolvedGapIds: [],
  },
  ledger: { gaps: [], assessmentsUsed: 1, searchesUsed: 1, sourcesConsumed: 1 },
  tasks: [],
};

const executionRefs = { assessmentModelRef: "high", synthesisModelRef: "balanced", searchRef: "brave" };

function provider(parts: AssistantContent["parts"]): LLMProvider {
  return {
    assessResearch: async () => { throw new Error("not used"); },
    synthesizeResearch: async function* () { yield* parts; },
  };
}

function fixedClock() { return "2026-01-01T00:00:01.000Z" as IsoTimestamp; }

describe("v3 answer and turn executors", () => {
  it("demotes only a violating opening heading and drops unreachable citations", async () => {
    const answer = await new AnswerSynthesizer(provider([
      { type: "text", markdown: "# Opening\n\nInternal ## heading" },
      { type: "citation", sourceId: id("src_reachable") },
      { type: "citation", sourceId: id("src_unreachable") },
    ]), "SYNTHESIZER EXACT").synthesize({ question: "What happened?", context, resolution });
    expect(answer.parts).toEqual([
      { type: "text", markdown: "Opening\n\nInternal ## heading" },
      { type: "citation", sourceId: source.sourceId },
    ]);
  });

  it("searches exactly once and does not invoke research capabilities", async () => {
    let calls = 0;
    const result = await executeSearchTurn({
      turnId: id("turn-search"),
      userMessage,
      createdAt: userMessage.createdAt,
      searchRef: "brave",
      provider: { search: async (_query, options) => { calls += 1; expect(options.maxResults).toBe(5); return [{ ...source, rank: 1 }]; } },
      finishedAt: fixedClock,
    });
    expect(calls).toBe(1);
    expect(result.turn.status).toBe("completed");
    if (result.turn.status === "completed") expect(result.turn.result).toEqual({ completion: "results", destinations: [{ sourceId: source.sourceId, rank: 1 }] });
    expect(result.sources).toEqual([source]);
  });

  it("synthesizes one root answer and preserves recorded provenance", async () => {
    let synthesisCalls = 0;
    const resolver = { resolve: async (): Promise<ResearchResolutionResult> => resolution };
    const synthesizer = { synthesize: async (): Promise<AssistantContent> => { synthesisCalls += 1; return { parts: [{ type: "text", markdown: "Answer." }, { type: "citation", sourceId: source.sourceId }] }; } };
    const result = await executeResearchTurn({
      turnId: id("turn-research"), userMessage, createdAt: userMessage.createdAt, context, resolver, synthesizer, ...executionRefs, finishedAt: fixedClock,
    });
    expect(synthesisCalls).toBe(1);
    expect(result.sources).toEqual([source]);
    expect(result.turn.status).toBe("completed");
    if (result.turn.status === "completed") {
      expect(result.turn.result.completion).toBe("sufficient");
      expect(result.turn.execution).toEqual({ kind: "recorded", ...executionRefs });
    }
  });

  it("includes source metadata referenced only by ledger-gap support", async () => {
    const gapSupported: SufficientResearchResolution = {
      ...resolution,
      ledger: {
        ...resolution.ledger,
        gaps: [{
          id: id("gap_supported"),
          problem: { id: resolution.knowledge.problemId, question: "What happened?", purpose: "answer", successCriterion: "supported", context: { ...context, knownSources: [] }, depth: 0 },
          status: "resolved",
          support: [{ type: "source", sourceId: extraSource.sourceId }],
          fingerprint: "supported-gap",
          createdOrder: 0,
        }],
      },
    };
    const result = await executeResearchTurn({
      turnId: id("turn-gap-support"),
      userMessage,
      createdAt: userMessage.createdAt,
      context,
      resolver: { resolve: async () => gapSupported },
      synthesizer: { synthesize: async () => ({ parts: [{ type: "text", markdown: "Answer." }] }) },
      ...executionRefs,
      finishedAt: fixedClock,
    });
    expect(result.turn.status).toBe("completed");
    expect(result.sources).toEqual([extraSource, source]);
  });

  it("closes checkpoint evidence with checkpoint-admitted source metadata", async () => {
    const checkpoint = {
      reason: "execution_failure" as const,
      knowledge: resolution.knowledge,
      ledger: resolution.ledger,
      tasks: resolution.tasks,
      sources: [source],
    };
    const result = await executeResearchTurn({
      turnId: id("turn-checkpoint"),
      userMessage,
      createdAt: userMessage.createdAt,
      context: { ...context, knownSources: [] },
      resolver: { resolve: async () => ({ checkpoint }) },
      synthesizer: { synthesize: async () => { throw new Error("must not synthesize"); } },
      ...executionRefs,
      finishedAt: fixedClock,
    });
    expect(result.turn.status).toBe("failed");
    expect(result.sources).toEqual([source]);
  });

  it("persists bounded synthesis failure without provider details", async () => {
    const resolver = { resolve: async (): Promise<ResearchResolutionResult> => resolution };
    const synthesizer = { synthesize: async (): Promise<AssistantContent> => { throw Object.assign(new Error("secret payload"), { code: "refused" }); } };
    const result = await executeResearchTurn({
      turnId: id("turn-failure"), userMessage, createdAt: userMessage.createdAt, context, resolver, synthesizer, ...executionRefs, finishedAt: fixedClock,
    });
    expect(result.turn.status).toBe("failed");
    if (result.turn.status === "failed") {
      expect(result.turn.failure).toEqual({ kind: "synthesis_failure", code: "refused", message: "The answer was refused.", retryable: false });
      expect(JSON.stringify(result.turn)).not.toContain("secret payload");
    }
  });
});
