import { describe, expect, it } from "vitest";
import type { AssistantContent, CanonicalSource, IsoTimestamp, ResearchResolutionResult, SufficientResearchResolution, ThreadContext, UserMessage } from "../src/domain/types.js";
import { AnswerSynthesizer } from "../src/application/answer-synthesizer.js";
import { executeSearchTurn } from "../src/application/execute-search-turn.js";
import { executeResearchTurn } from "../src/application/execute-research-turn.js";
import type { LLMProvider } from "../src/ports/llm.js";
import { assistantContentV3Schema } from "../src/domain/schemas.js";

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
    evidence: [{ problemId: id("problem"), requestOrder: 0, query: "What happened?", sources: [
      { sourceId: source.sourceId, page: { text: "Evidence.", extractedAt: id("2026-01-01T00:00:00.000Z"), characterCount: 9 } },
      { sourceId: extraSource.sourceId, page: { text: "A different perspective.", extractedAt: id("2026-01-01T00:00:00.000Z"), characterCount: 24 } },
    ], createdAt: id("2026-01-01T00:00:00.000Z") }],
    unresolvedGapIds: [],
  },
  ledger: { gaps: [], assessmentsUsed: 1, searchesUsed: 1, sourcesConsumed: 2 },
  tasks: [],
};
const oneSourceResolution: SufficientResearchResolution = {
  ...resolution,
  knowledge: { ...resolution.knowledge, evidence: [{ ...resolution.knowledge.evidence[0], sources: [resolution.knowledge.evidence[0].sources[0]] }] },
  ledger: { ...resolution.ledger, sourcesConsumed: 1 },
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
    ]), "SYNTHESIZER EXACT").synthesize({ question: "What happened?", answerPosition: "initial", context, resolution });
    expect(answer.parts).toEqual([
      { type: "text", markdown: "Opening\n\nInternal ## heading" },
      { type: "citation", sourceId: source.sourceId },
    ]);
  });

  it("coalesces long provider streams into bounded durable answer segments", async () => {
    const chunks = Array.from({ length: 300 }, (_, index) => ({ type: "text" as const, markdown: index === 0 ? "According" : " to research" }));
    const answer = await new AnswerSynthesizer(provider(chunks), "SYNTHESIZER EXACT").synthesize({ question: "What happened?", answerPosition: "initial", context, resolution });
    expect(answer.parts).toHaveLength(1);
    expect(answer.parts[0]).toEqual({ type: "text", markdown: `According${" to research".repeat(299)}` });
    expect(assistantContentV3Schema.safeParse(answer).success).toBe(true);
  });

  it("rejects an answer that still exceeds durable part bounds after coalescing", async () => {
    const parts = Array.from({ length: 129 }, () => [{ type: "text" as const, markdown: "claim" }, { type: "citation" as const, sourceId: source.sourceId }]).flat();
    await expect(new AnswerSynthesizer(provider(parts), "SYNTHESIZER EXACT").synthesize({ question: "What happened?", answerPosition: "initial", context, resolution })).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("passes answer position without changing the shared synthesis prompt", async () => {
    let received: string | undefined;
    const llm: LLMProvider = {
      assessResearch: async () => { throw new Error("not used"); },
      synthesizeResearch: async function* (input) { received = input.answerPosition; expect(input.systemPrompt).toBe("SYNTHESIZER EXACT"); yield { type: "text", markdown: "Follow-up answer." }; },
    };
    const answer = await new AnswerSynthesizer(llm, "SYNTHESIZER EXACT").synthesize({ question: "What happened next?", answerPosition: "follow_up", context, resolution });
    expect(received).toBe("follow_up");
    expect(answer.parts).toEqual([{ type: "text", markdown: "Follow-up answer." }]);
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
    if (result.turn.status === "completed") expect(result.turn.result).toEqual({ completion: "results", resultKind: "link", destinations: [{ sourceId: source.sourceId, rank: 1 }] });
    expect(result.sources).toEqual([{ ...source, kind: "link" }]);
  });

  it("preserves image result kind and media metadata without extraction", async () => {
    const media = { kind: "image" as const, sourceId: source.sourceId, rank: 1, title: "Cat", url: "https://cdn.example/cat.jpg", canonicalUrl: "https://cdn.example/cat.jpg", imageUrl: "https://cdn.example/cat.jpg", sourcePageUrl: "https://example.com/cats", thumbnailUrl: "https://cdn.example/thumb.jpg", displayUrl: "example.com", width: 640, height: 480 };
    const result = await executeSearchTurn({ turnId: id("turn-image"), userMessage, createdAt: userMessage.createdAt, resultKind: "image", searchRef: "brave", provider: { search: async (_query, options) => { expect(options.resultKind).toBe("image"); return [media]; } }, finishedAt: fixedClock });
    expect(result.turn).toMatchObject({ kind: "search", status: "completed", result: { resultKind: "image" } });
    expect(result.sources[0]).toMatchObject({ kind: "image", imageUrl: media.imageUrl, sourcePageUrl: media.sourcePageUrl });
  });

  it("never sends one-source or repeated-snapshot resolutions to a synthesis provider", async () => {
    let calls = 0;
    const llm: LLMProvider = {
      assessResearch: async () => { throw new Error("not used"); },
      synthesizeResearch: async function* () { calls += 1; yield { type: "text", markdown: "Should not answer." }; },
    };
    const snapshots: SufficientResearchResolution = {
      ...oneSourceResolution,
      knowledge: { ...oneSourceResolution.knowledge, evidence: [
        oneSourceResolution.knowledge.evidence[0],
        { ...oneSourceResolution.knowledge.evidence[0], requestOrder: 1, sources: [{ ...oneSourceResolution.knowledge.evidence[0].sources[0], page: { text: "New snapshot.", extractedAt: id("2026-01-01T00:00:01.000Z"), characterCount: 13 } }] },
      ] },
    };
    for (const candidate of [oneSourceResolution, snapshots]) {
      await expect(new AnswerSynthesizer(llm, "SYNTHESIZER EXACT").synthesize({ question: "What happened?", answerPosition: "initial", context, resolution: candidate })).rejects.toMatchObject({ message: "insufficient_sources" });
    }
    expect(calls).toBe(0);
  });

  it("turns a one-source sufficient resolution into a retryable insufficient terminal with retained evidence", async () => {
    let calls = 0;
    const result = await executeResearchTurn({
      turnId: id("turn-one-source"), userMessage, createdAt: userMessage.createdAt, context, answerPosition: "initial",
      resolver: { resolve: async () => oneSourceResolution },
      synthesizer: { synthesize: async () => { calls += 1; throw new Error("must not synthesize"); } },
      ...executionRefs, finishedAt: fixedClock,
    });
    expect(calls).toBe(0);
    expect(result.turn).toMatchObject({ status: "failed", failure: { kind: "insufficient_evidence", retryable: true }, researchState: { kind: "resolution", resolution: { status: "insufficient", stopReason: "no_new_knowledge" } } });
    expect(result.sources).toEqual([source]);
  });

  it("preserves a bounded best-effort stop reason without synthesizing one source", async () => {
    const candidate = { ...oneSourceResolution, status: "best_effort" as const, stopReason: "provider_unavailable" as const };
    const result = await executeResearchTurn({
      turnId: id("turn-best-effort-one-source"), userMessage, createdAt: userMessage.createdAt, context, answerPosition: "follow_up",
      resolver: { resolve: async () => candidate },
      synthesizer: { synthesize: async () => { throw new Error("must not synthesize"); } },
      ...executionRefs, finishedAt: fixedClock,
    });
    expect(result.turn).toMatchObject({ status: "failed", failure: { kind: "insufficient_evidence", retryable: true }, researchState: { kind: "resolution", resolution: { status: "insufficient", stopReason: "provider_unavailable" } } });
    expect(result.sources).toEqual([source]);
  });

  it("counts extracted follow-up context plus fresh evidence, but not known-source metadata alone", async () => {
    const candidate = {
      ...oneSourceResolution,
      knowledge: { ...oneSourceResolution.knowledge, evidence: [
        ...oneSourceResolution.knowledge.evidence,
        { ...resolution.knowledge.evidence[0], requestOrder: 1, sources: [resolution.knowledge.evidence[0].sources[1]] },
      ] },
    };
    const result = await executeResearchTurn({
      turnId: id("turn-follow-up-two-source"), userMessage, createdAt: userMessage.createdAt, context, answerPosition: "follow_up",
      resolver: { resolve: async () => candidate },
      synthesizer: { synthesize: async () => ({ parts: [{ type: "text", markdown: "Supported answer." }] }) },
      ...executionRefs, finishedAt: fixedClock,
    });
    expect(result.turn).toMatchObject({ status: "completed", result: { completion: "sufficient" } });
    expect(result.sources).toEqual([extraSource, source]);
  });

  it("synthesizes one root answer and preserves recorded provenance", async () => {
    let synthesisCalls = 0;
    const resolver = { resolve: async (): Promise<ResearchResolutionResult> => resolution };
    const synthesizer = { synthesize: async (): Promise<AssistantContent> => { synthesisCalls += 1; return { parts: [{ type: "text", markdown: "Answer." }, { type: "citation", sourceId: source.sourceId }] }; } };
    const result = await executeResearchTurn({
      turnId: id("turn-research"), userMessage, createdAt: userMessage.createdAt, context, answerPosition: "initial", resolver, synthesizer, ...executionRefs, finishedAt: fixedClock,
    });
    expect(synthesisCalls).toBe(1);
    expect(result.sources).toEqual([extraSource, source]);
    expect(result.turn.status).toBe("completed");
    if (result.turn.status === "completed") {
      expect(result.turn.result.completion).toBe("sufficient");
      expect(result.turn.execution).toEqual({ kind: "recorded", ...executionRefs });
    }
  });

  it("includes source metadata referenced only by ledger-gap support", async () => {
    const ledgerOnly: CanonicalSource = { ...source, sourceId: id("src_ledger_only") };
    const gapSupported: SufficientResearchResolution = {
      ...resolution,
      ledger: {
        ...resolution.ledger,
        gaps: [{
          id: id("gap_supported"),
          problem: { id: resolution.knowledge.problemId, question: "What happened?", purpose: "answer", successCriterion: "supported", context: { ...context, knownSources: [] }, depth: 0 },
          status: "resolved",
          support: [{ type: "source", sourceId: ledgerOnly.sourceId }],
          fingerprint: "supported-gap",
          createdOrder: 0,
        }],
      },
    };
    const result = await executeResearchTurn({
      turnId: id("turn-gap-support"),
      userMessage,
      createdAt: userMessage.createdAt,
      context: { ...context, knownSources: [...context.knownSources, ledgerOnly] },
      answerPosition: "initial",
      resolver: { resolve: async () => gapSupported },
      synthesizer: { synthesize: async () => ({ parts: [{ type: "text", markdown: "Answer." }] }) },
      ...executionRefs,
      finishedAt: fixedClock,
    });
    expect(result.turn.status).toBe("completed");
    expect(result.sources).toEqual([extraSource, ledgerOnly, source]);
  });

  it("closes checkpoint evidence with checkpoint-admitted source metadata", async () => {
    const checkpoint = {
      reason: "execution_failure" as const,
      knowledge: resolution.knowledge,
      ledger: resolution.ledger,
      tasks: resolution.tasks,
      sources: [source, extraSource],
    };
    const result = await executeResearchTurn({
      turnId: id("turn-checkpoint"),
      userMessage,
      createdAt: userMessage.createdAt,
      context: { ...context, knownSources: [] },
      answerPosition: "initial",
      resolver: { resolve: async () => ({ checkpoint }) },
      synthesizer: { synthesize: async () => { throw new Error("must not synthesize"); } },
      ...executionRefs,
      finishedAt: fixedClock,
    });
    expect(result.turn.status).toBe("failed");
    expect(result.sources).toEqual([extraSource, source]);
  });

  it("persists bounded synthesis failure without provider details", async () => {
    const resolver = { resolve: async (): Promise<ResearchResolutionResult> => resolution };
    const synthesizer = { synthesize: async (): Promise<AssistantContent> => { throw Object.assign(new Error("secret payload"), { code: "refused" }); } };
    const result = await executeResearchTurn({
      turnId: id("turn-failure"), userMessage, createdAt: userMessage.createdAt, context, answerPosition: "follow_up", resolver, synthesizer, ...executionRefs, finishedAt: fixedClock,
    });
    expect(result.turn.status).toBe("failed");
    if (result.turn.status === "failed") {
      expect(result.turn.failure).toEqual({ kind: "synthesis_failure", code: "refused", message: "The answer was refused.", retryable: false });
      expect(JSON.stringify(result.turn)).not.toContain("secret payload");
    }
  });
});
