import { describe, expect, it } from "vitest";
import { legacyThreadInputSchema } from "../src/domain/legacy-input-schemas";
import { threadV3Schema, turnV3Schema } from "../src/domain/schemas";

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const hash = (prefix: string, fill: string) => `${prefix}_${fill.repeat(43)}`;
const at = (second: number) => `2026-01-01T00:00:${String(second).padStart(2, "0")}.000Z`;
const sourceId = hash("src", "s");
const problemId = hash("problem", "p");
const source = { sourceId, ordinal: 1, title: "Source", url: "https://example.com/a", canonicalUrl: "https://example.com/a", displayUrl: "example.com/a" };
const userMessage = { id: uuid(2), role: "user", content: "weather", createdAt: at(0) };
const recordedSearch = { kind: "recorded", searchRef: "fixture" };
const searchTurn = {
  id: uuid(1), kind: "search", status: "completed", createdAt: at(0), finishedAt: at(1), userMessage,
  execution: recordedSearch, result: { completion: "results", destinations: [{ sourceId, rank: 1 }] },
};
const emptyKnowledge = { problemId, findings: [], evidence: [], unresolvedGapIds: [] };
const emptyLedger = { gaps: [], assessmentsUsed: 1, searchesUsed: 0, sourcesConsumed: 0 };
const sufficientResolution = { status: "sufficient", stopReason: "sufficient", knowledge: emptyKnowledge, ledger: emptyLedger, tasks: [] };
const bestEffortResolution = { ...sufficientResolution, status: "best_effort", stopReason: "no_new_knowledge" };
const insufficientResolution = { ...sufficientResolution, status: "insufficient", stopReason: "provider_unavailable" };
const recordedResearch = { kind: "recorded", assessmentModelRef: "assessor", synthesisModelRef: "synthesizer", searchRef: "fixture" };
const researchBase = { id: uuid(3), kind: "research", createdAt: at(0), finishedAt: at(1), userMessage, execution: recordedResearch };
const checkpoint = { reason: "execution_failure", knowledge: emptyKnowledge, ledger: emptyLedger, tasks: [] };
const baseThread = { schemaVersion: 3, id: uuid(10), title: "Topic", createdAt: at(0), updatedAt: at(1), sources: [source], turns: [searchTurn], legacyArchive: [] };

describe("v3 domain schemas", () => {
  it("accepts a source-closed terminal search thread", () => {
    expect(threadV3Schema.safeParse(baseThread).success).toBe(true);
  });

  it("represents pending work outside the durable Turn union", () => {
    expect(turnV3Schema.safeParse({ ...searchTurn, status: "running" }).success).toBe(false);
  });

  it("allows unavailable provenance only on interruption", () => {
    expect(turnV3Schema.safeParse({ ...searchTurn, execution: { kind: "unavailable" } }).success).toBe(false);
    expect(turnV3Schema.safeParse({
      ...searchTurn,
      execution: { kind: "unavailable" },
      status: "interrupted",
      interruption: { reason: "connection_lost", message: "Connection lost." },
      result: undefined,
    }).success).toBe(false); // strict objects reject the lingering undefined result key
    const withoutResult = { ...searchTurn } as Partial<typeof searchTurn>;
    delete withoutResult.result;
    expect(turnV3Schema.safeParse({ ...withoutResult, execution: { kind: "unavailable" }, status: "interrupted", interruption: { reason: "connection_lost", message: "Connection lost." } }).success).toBe(true);
  });

  it.each([
    ["failed search", { ...searchTurn, status: "failed", result: undefined, failure: { code: "search_failed", message: "failed", retryable: true } }],
    ["interrupted search", { ...searchTurn, status: "interrupted", result: undefined, interruption: { reason: "user_cancelled", message: "cancelled" } }],
    ["sufficient research", { ...researchBase, status: "completed", result: { completion: "sufficient", answer: { parts: [{ type: "text", markdown: "answer" }] }, resolution: sufficientResolution } }],
    ["best-effort research", { ...researchBase, status: "completed", result: { completion: "best_effort", answer: { parts: [{ type: "text", markdown: "answer" }] }, resolution: bestEffortResolution } }],
    ["insufficient research", { ...researchBase, status: "failed", failure: { kind: "insufficient_evidence", message: "insufficient", retryable: true }, researchState: { kind: "resolution", resolution: insufficientResolution } }],
    ["synthesis failure", { ...researchBase, status: "failed", failure: { kind: "synthesis_failure", code: "invalid_output", message: "invalid", retryable: true }, researchState: { kind: "resolution", resolution: sufficientResolution } }],
    ["execution failure with checkpoint", { ...researchBase, status: "failed", failure: { kind: "execution_failure", stage: "assessment", code: "assessment_failed", message: "failed", retryable: true }, researchState: { kind: "checkpoint", checkpoint } }],
    ["execution failure unavailable", { ...researchBase, status: "failed", failure: { kind: "execution_failure", stage: "transport", code: "transport_failed", message: "failed", retryable: true }, researchState: { kind: "unavailable" } }],
    ["interrupted resolved research", { ...researchBase, status: "interrupted", interruption: { reason: "navigation", message: "left" }, researchState: { kind: "resolution", resolution: bestEffortResolution } }],
    ["interrupted checkpoint research", { ...researchBase, status: "interrupted", interruption: { reason: "connection_lost", message: "lost" }, researchState: { kind: "checkpoint", checkpoint } }],
    ["interrupted unavailable research", { ...researchBase, execution: { kind: "unavailable" }, status: "interrupted", interruption: { reason: "connection_lost", message: "lost" }, researchState: { kind: "unavailable" } }],
  ])("accepts the terminal %s variant", (_name, value) => {
    const clean = JSON.parse(JSON.stringify(value)) as unknown;
    expect(turnV3Schema.safeParse(clean).success).toBe(true);
  });

  it("rejects mixed research completion and resolution variants", () => {
    const research = { ...researchBase, status: "completed", result: { completion: "best_effort", answer: { parts: [{ type: "text", markdown: "answer" }] }, resolution: sufficientResolution } };
    expect(turnV3Schema.safeParse(research).success).toBe(false);
  });

  it("enforces complete source closure and contiguous ordinals", () => {
    expect(threadV3Schema.safeParse({ ...baseThread, sources: [] }).success).toBe(false);
    expect(threadV3Schema.safeParse({ ...baseThread, sources: [{ ...source, ordinal: 2 }] }).success).toBe(false);
    expect(threadV3Schema.safeParse({ ...baseThread, sources: [source, { ...source, sourceId: hash("src", "t"), ordinal: 2, canonicalUrl: "https://example.com/b" }] }).success).toBe(false);
  });

  it("counts Unicode code points at canonical source bounds", () => {
    expect(threadV3Schema.safeParse({ ...baseThread, sources: [{ ...source, title: "😀".repeat(500) }] }).success).toBe(true);
    expect(threadV3Schema.safeParse({ ...baseThread, sources: [{ ...source, title: "😀".repeat(501) }] }).success).toBe(false);
  });

  it("accepts archive-only threads but isolates archive identity and content rules", () => {
    const archive = {
      id: hash("legacy", "l"), originalIndex: 0, legacyKind: "chat", legacyStatus: "completed",
      createdAt: at(0), finishedAt: at(1), request: "old question", answerMarkdown: "old answer",
      destinations: [{ sourceId, rank: 1, legacyCitationId: "source-1" }],
    };
    const archiveOnly = { ...baseThread, turns: [], legacyArchive: [archive] };
    expect(threadV3Schema.safeParse(archiveOnly).success).toBe(true);
    expect(threadV3Schema.safeParse({ ...archiveOnly, legacyArchive: [{ ...archive, answerMarkdown: undefined }] }).success).toBe(false);
    expect(threadV3Schema.safeParse({ ...archiveOnly, legacyArchive: [archive, { ...archive }] }).success).toBe(false);
  });

  it("enforces the 256-entry archive ceiling", () => {
    const entries = Array.from({ length: 257 }, (_, index) => ({
      id: `legacy_${index.toString(36).padStart(43, "0")}`,
      originalIndex: index,
      legacyKind: "chat",
      legacyStatus: "completed",
      createdAt: at(0),
      finishedAt: at(1),
      request: `request ${index}`,
      answerMarkdown: "answer",
      destinations: [],
    }));
    expect(threadV3Schema.safeParse({ ...baseThread, sources: [], turns: [], legacyArchive: entries }).success).toBe(false);
  });

  it("rejects empty durable threads and invalid retry ancestry", () => {
    expect(threadV3Schema.safeParse({ ...baseThread, sources: [], turns: [] }).success).toBe(false);
    expect(threadV3Schema.safeParse({ ...baseThread, turns: [{ ...searchTurn, retryOfTurnId: uuid(99) }] }).success).toBe(false);
  });
});

describe("bounded legacy input schemas", () => {
  const legacy = {
    schemaVersion: 2,
    id: "thread-old",
    title: "Old topic",
    createdAt: at(0),
    updatedAt: at(1),
    modelRef: "legacy-model",
    searchRef: "legacy-search",
    turns: [{
      id: "turn-old", mode: "chat", status: "completed", createdAt: at(0), updatedAt: at(1),
      userMessage: { id: "message-old", role: "user", content: "hello", createdAt: at(0) },
      lookupResults: [],
    }],
  };

  it("accepts exact v1/v2 records without exposing them as v3", () => {
    expect(legacyThreadInputSchema.safeParse(legacy).success).toBe(true);
    expect(threadV3Schema.safeParse(legacy).success).toBe(false);
  });

  it("rejects unknown fields and unbounded legacy payloads", () => {
    expect(legacyThreadInputSchema.safeParse({ ...legacy, providerPayload: {} }).success).toBe(false);
    expect(legacyThreadInputSchema.safeParse({ ...legacy, title: "x".repeat(2_001) }).success).toBe(false);
    expect(legacyThreadInputSchema.safeParse({ ...legacy, turns: Array.from({ length: 1_025 }, () => legacy.turns[0]) }).success).toBe(false);
  });
});
