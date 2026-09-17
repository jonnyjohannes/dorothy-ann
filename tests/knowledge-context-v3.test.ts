import { describe, expect, it } from "vitest";
import { joinKnowledge, KnowledgeIntegrityError } from "../src/domain/knowledge";
import type { EvidencePack, KnowledgeUnit, ResearchProblemId, SourceId, Thread } from "../src/domain/types";
import { assertTurnRequestBytes, buildThreadContext, TurnRequestTooLargeError } from "../src/domain/thread-context";
import { threadContextV3Schema } from "../src/domain/schemas";

const digest = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`;
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const at = (second: number) => `2026-01-01T00:00:${String(second).padStart(2, "0")}.000Z`;
const problemId = digest("problem", "p") as ResearchProblemId;
const sourceA = digest("src", "a") as SourceId;
const sourceB = digest("src", "b") as SourceId;
const gapA = digest("gap", "g") as never;
const propositionKey = digest("prop", "q") as never;
const observation = (id: string, stance: "supports" | "contradicts", sourceId: SourceId) => ({ id: digest("obs", id) as never, propositionKey, statement: `${stance} statement`, stance, support: [{ type: "source" as const, sourceId }] });
const finding = (observations: ReturnType<typeof observation>[]) => ({ propositionKey, proposition: "proposition", observations, status: "supported" as const });
const pack = (sourceId: SourceId, text: string, requestOrder = 0): EvidencePack => ({ problemId, requestOrder, query: "query", createdAt: at(requestOrder), sources: [{ sourceId, page: { text, extractedAt: at(requestOrder + 1), characterCount: [...text].length } }] });
const unit = (observations: ReturnType<typeof observation>[], evidence: EvidencePack[] = [], gaps: never[] = []): KnowledgeUnit => ({ problemId, findings: [finding(observations)], evidence, unresolvedGapIds: gaps });

describe("joinKnowledge", () => {
  const a = unit([observation("a", "supports", sourceA)], [pack(sourceA, "alpha")], [gapA]);
  const b = unit([observation("b", "contradicts", sourceB)], [pack(sourceB, "beta", 1)]);
  const c = unit([observation("c", "supports", sourceA)]);

  it("is associative, commutative, and idempotent", () => {
    expect(joinKnowledge(problemId, [a, b])).toEqual(joinKnowledge(problemId, [b, a]));
    expect(joinKnowledge(problemId, [joinKnowledge(problemId, [a, b]), c])).toEqual(joinKnowledge(problemId, [a, joinKnowledge(problemId, [b, c])]));
    expect(joinKnowledge(problemId, [a, a])).toEqual(joinKnowledge(problemId, [a]));
  });

  it("preserves supported contradictions as contested", () => {
    expect(joinKnowledge(problemId, [a, b]).findings[0]).toMatchObject({ status: "contested", observations: expect.arrayContaining([expect.objectContaining({ stance: "supports" }), expect.objectContaining({ stance: "contradicts" })]) });
  });

  it("deduplicates snapshots and rejects identity collisions", () => {
    expect(joinKnowledge(problemId, [a, a]).evidence[0].sources).toHaveLength(1);
    const collision = unit([{ ...observation("a", "supports", sourceA), statement: "different" }]);
    expect(() => joinKnowledge(problemId, [a, collision])).toThrow(KnowledgeIntegrityError);
    const evidenceCollision = unit([], [{ ...pack(sourceA, "different"), createdAt: at(9) }]);
    expect(() => joinKnowledge(problemId, [a, evidenceCollision])).toThrow(KnowledgeIntegrityError);
  });
});

function source(sourceId: SourceId, ordinal: number) {
  return { sourceId, ordinal, title: `Source ${ordinal}`, url: `https://example.com/${ordinal}`, canonicalUrl: `https://example.com/${ordinal}`, displayUrl: `example.com/${ordinal}` };
}
function researchTurn(id: number, request: string, answerParts: Array<{ type: "text"; markdown: string } | { type: "citation"; sourceId: SourceId }>, evidence: EvidencePack[] = []) {
  return {
    id: uuid(id), kind: "research" as const, status: "completed" as const, createdAt: at(id), finishedAt: at(id + 1),
    userMessage: { id: uuid(id + 20), role: "user" as const, content: request, createdAt: at(id) },
    execution: { kind: "recorded" as const, assessmentModelRef: "a", synthesisModelRef: "s", searchRef: "search" },
    result: { completion: "sufficient" as const, answer: { parts: answerParts }, resolution: { status: "sufficient" as const, stopReason: "sufficient" as const, knowledge: { problemId, findings: [], evidence, unresolvedGapIds: [] }, ledger: { gaps: [], assessmentsUsed: 1, searchesUsed: evidence.length, sourcesConsumed: evidence.length }, tasks: [] } },
  };
}
const limits = { maxThreadContextTurns: 8, maxThreadContextChars: 24_000, maxEvidenceCharsPerSource: 4_000, maxEvidenceCharsTotal: 48_000, maxTurnRequestBytes: 128_000 };

describe("buildThreadContext", () => {
  it("uses a structured prefix, counts citation tokens, and marks truncation", () => {
    const turn = researchTurn(1, "q?", [{ type: "text", markdown: "hello" }, { type: "citation", sourceId: sourceA }, { type: "text", markdown: "world" }]);
    const citationCost = [...`[[cite:${sourceA}]]`].length;
    const thread = { schemaVersion: 3, id: uuid(99), title: "Topic", createdAt: at(0), updatedAt: at(2), sources: [source(sourceA, 1)], turns: [turn], legacyArchive: [] } as unknown as Thread;
    const context = buildThreadContext(thread, { ...limits, maxThreadContextChars: 2 + 5 + citationCost + 2 });
    expect(context.turns[0]).toMatchObject({ answerTruncated: true, answer: { parts: [{ type: "text", markdown: "hello" }, { type: "citation", sourceId: sourceA }, { type: "text", markdown: "wo" }] } });

    const atomicCitation = buildThreadContext(thread, { ...limits, maxThreadContextChars: 2 + 5 + citationCost - 1 });
    expect(atomicCitation.turns[0]).toMatchObject({ answerTruncated: true, answer: { parts: [{ type: "text", markdown: "hello" }] } });
  });

  it("spends answer budget newest-first and ignores the legacy archive", () => {
    const old = researchTurn(1, "a?", [{ type: "text", markdown: "older" }]);
    const recent = researchTurn(3, "b?", [{ type: "text", markdown: "newer" }]);
    const thread = { schemaVersion: 3, id: uuid(99), title: "Topic", createdAt: at(0), updatedAt: at(4), sources: [], turns: [old, recent], legacyArchive: [{ request: "legacy should never appear" }] } as unknown as Thread;
    const context = buildThreadContext(thread, { ...limits, maxThreadContextChars: 7 });
    expect(context.turns).toHaveLength(2);
    expect(context.turns[0]).toMatchObject({ answerTruncated: true, answer: { parts: [] } });
    expect(context.turns[1]).toMatchObject({ answerTruncated: true, answer: { parts: [{ markdown: "new" }] } });
    expect(JSON.stringify(context)).not.toContain("legacy should never appear");
    expect(threadContextV3Schema.safeParse(context).success).toBe(true);
  });

  it("drops oldest requests until they fit", () => {
    const thread = { schemaVersion: 3, id: uuid(99), title: "Topic", createdAt: at(0), updatedAt: at(4), sources: [], turns: [researchTurn(1, "old?", [{ type: "text", markdown: "old" }]), researchTurn(3, "new?", [{ type: "text", markdown: "new" }])], legacyArchive: [] } as unknown as Thread;
    expect(buildThreadContext(thread, { ...limits, maxThreadContextChars: 4 }).turns.map((turn) => turn.request)).toEqual(["new?"]);
  });

  it("admits deterministic bounded evidence and known sources", () => {
    const oldPack = pack(sourceA, "a".repeat(300), 0);
    const newPack = { ...pack(sourceB, "😀".repeat(300), 1), createdAt: at(4) };
    const turns = [researchTurn(1, "old?", [{ type: "text", markdown: "old" }], [oldPack]), researchTurn(3, "new?", [{ type: "text", markdown: "new" }], [newPack])];
    const thread = { schemaVersion: 3, id: uuid(99), title: "Topic", createdAt: at(0), updatedAt: at(4), sources: [source(sourceA, 1), source(sourceB, 2)], turns, legacyArchive: [] } as unknown as Thread;
    const context = buildThreadContext(thread, { ...limits, maxEvidenceCharsPerSource: 300, maxEvidenceCharsTotal: 400 });
    expect(context.availableEvidence).toHaveLength(1);
    expect(context.availableEvidence[0].sources[0]).toMatchObject({ sourceId: sourceB, page: { characterCount: 300 } });
    expect(context.knownSources.map((item) => item.sourceId)).toEqual([sourceB]);
  });

  it("enforces the complete encoded request byte ceiling", () => {
    expect(() => assertTurnRequestBytes({ question: "😀".repeat(10) }, 20)).toThrow(TurnRequestTooLargeError);
    expect(() => assertTurnRequestBytes({ question: "ok" }, 128)).not.toThrow();
  });
});
