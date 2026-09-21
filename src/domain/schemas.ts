import { z } from "zod";
import type {
  BestEffortResearchResolution,
  CanonicalSource,
  ContextEvidence,
  EvidencePack,
  FailedResearchTurn,
  GapLedger,
  InsufficientResearchResolution,
  IsoTimestamp,
  KnowledgeUnit,
  LegacyArchiveEntry,
  LegacyArchiveEntryId,
  MessageId,
  ObservationId,
  PropositionKey,
  ResearchCheckpoint,
  ResearchGapId,
  ResearchProblemId,
  ResearchResolution,
  ResearchTaskRecord,
  ResearchTurn,
  SearchTurn,
  SourceId,
  SufficientResearchResolution,
  Thread,
  ThreadId,
  ThreadSourceRecord,
  SourceRecord,
  Turn,
  TurnId,
  UserMessage,
} from "./types.js";

const codePoints = (value: string) => [...value].length;
const bounded = (minimum: number, maximum: number) => z.string().refine(
  (value) => codePoints(value) >= minimum && codePoints(value) <= maximum,
  `must contain ${minimum}..${maximum} Unicode code points`,
);
const noControlRef = bounded(1, 200).refine(
  (value) => value === value.trim() && ![...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  }),
  "invalid recorded reference",
);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
const hashId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`));
const isoTimestampSchema = z.string().datetime().transform((value) => value as IsoTimestamp);
export const threadIdSchema = uuid.transform((value) => value as ThreadId);
export const turnIdSchema = uuid.transform((value) => value as TurnId);
export const messageIdSchema = uuid.transform((value) => value as MessageId);
export const sourceIdSchema = hashId("src").transform((value) => value as SourceId);
export const legacyArchiveEntryIdSchema = hashId("legacy").transform((value) => value as LegacyArchiveEntryId);
export const researchProblemIdSchema = hashId("problem").transform((value) => value as ResearchProblemId);
export const researchGapIdSchema = hashId("gap").transform((value) => value as ResearchGapId);
export const propositionKeySchema = hashId("prop").transform((value) => value as PropositionKey);
export const observationIdSchema = hashId("obs").transform((value) => value as ObservationId);

const httpUrl = bounded(1, 2_048).url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "must be an HTTP(S) URL");
const nonNegativeInt = z.number().int().nonnegative();
const positiveInt = z.number().int().positive();
const priority = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const userMessageV3Schema: z.ZodType<UserMessage> = z.strictObject({
  id: messageIdSchema,
  role: z.literal("user"),
  content: bounded(1, 2_000),
  createdAt: isoTimestampSchema,
});
const assistantContentPartSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), markdown: bounded(1, 64_000) }),
  z.strictObject({ type: z.literal("citation"), sourceId: sourceIdSchema }),
]);
export const assistantContentV3Schema = z.strictObject({ parts: z.array(assistantContentPartSchema).min(1).max(256) });
const usageSchema = z.strictObject({
  inputTokens: nonNegativeInt.optional(),
  outputTokens: nonNegativeInt.optional(),
  searches: nonNegativeInt.max(3).optional(),
  extractedPages: nonNegativeInt.max(9).optional(),
  estimatedCostUsd: z.number().finite().nonnegative().optional(),
});

const canonicalSourceShape = {
  sourceId: sourceIdSchema,
  title: bounded(1, 500),
  url: httpUrl,
  canonicalUrl: httpUrl,
  displayUrl: bounded(1, 512),
  snippet: bounded(0, 1_000).optional(),
  publishedAt: isoTimestampSchema.optional(),
};
export const canonicalSourceV3Schema: z.ZodType<CanonicalSource> = z.strictObject(canonicalSourceShape);
const linkSourceRecordSchema = z.strictObject({ ...canonicalSourceShape, kind: z.literal("link").default("link"), ordinal: positiveInt });
const imageSourceRecordBase = z.strictObject({
  kind: z.literal("image"), sourceId: sourceIdSchema, ordinal: positiveInt, title: bounded(1, 500),
  url: httpUrl, canonicalUrl: httpUrl, displayUrl: bounded(1, 512), imageUrl: httpUrl,
  sourcePageUrl: httpUrl.optional(), thumbnailUrl: httpUrl.optional(), snippet: bounded(0, 1_000).optional(), creator: bounded(0, 500).optional(),
  width: positiveInt.max(100_000).optional(), height: positiveInt.max(100_000).optional(), publishedAt: isoTimestampSchema.optional(),
});
const imageIdentity = (value: { url: string; canonicalUrl: string; imageUrl: string }, context: z.RefinementCtx) => {
  if (value.url !== value.canonicalUrl || value.url !== value.imageUrl) context.addIssue({ code: "custom", message: "media identity must use imageUrl" });
};
const imageSourceRecordSchema = imageSourceRecordBase.superRefine(imageIdentity);
const videoSourceRecordBase = z.strictObject({
  kind: z.literal("video"), sourceId: sourceIdSchema, ordinal: positiveInt, title: bounded(1, 500),
  url: httpUrl, canonicalUrl: httpUrl, displayUrl: bounded(1, 512), videoUrl: httpUrl,
  sourcePageUrl: httpUrl.optional(), thumbnailUrl: httpUrl.optional(), snippet: bounded(0, 1_000).optional(), creator: bounded(0, 500).optional(),
  durationSeconds: positiveInt.max(86_400).optional(), publishedAt: isoTimestampSchema.optional(),
});
const videoIdentity = (value: { url: string; canonicalUrl: string; videoUrl: string }, context: z.RefinementCtx) => {
  if (value.url !== value.canonicalUrl || value.url !== value.videoUrl) context.addIssue({ code: "custom", message: "media identity must use videoUrl" });
};
const videoSourceRecordSchema = videoSourceRecordBase.superRefine(videoIdentity);
export const sourceRecordV3Schema: z.ZodType<SourceRecord> = z.union([
  linkSourceRecordSchema.omit({ ordinal: true }),
  imageSourceRecordBase.omit({ ordinal: true }).superRefine(imageIdentity),
  videoSourceRecordBase.omit({ ordinal: true }).superRefine(videoIdentity),
]);
export const threadSourceRecordV3Schema: z.ZodType<ThreadSourceRecord> = z.union([linkSourceRecordSchema, imageSourceRecordSchema, videoSourceRecordSchema]);
const pageSnapshotSchema = z.strictObject({
  text: bounded(1, 20_000),
  extractedAt: isoTimestampSchema,
  characterCount: nonNegativeInt,
}).superRefine((page, context) => {
  if (page.characterCount !== codePoints(page.text)) context.addIssue({ code: "custom", message: "characterCount mismatch" });
});
const contextEvidenceSchema: z.ZodType<ContextEvidence> = z.strictObject({ sourceId: sourceIdSchema, page: pageSnapshotSchema });
export const evidencePackV3Schema: z.ZodType<EvidencePack> = z.strictObject({
  problemId: researchProblemIdSchema,
  requestOrder: nonNegativeInt,
  query: bounded(1, 500),
  sources: z.array(contextEvidenceSchema).min(1).max(3),
  createdAt: isoTimestampSchema,
}).superRefine((pack, context) => {
  if (new Set(pack.sources.map((source) => source.sourceId)).size !== pack.sources.length) context.addIssue({ code: "custom", message: "duplicate evidence source" });
});

const supportRefSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("turn"), turnId: turnIdSchema }),
  z.strictObject({ type: z.literal("source"), sourceId: sourceIdSchema }),
]);
const observationSchema = z.strictObject({
  id: observationIdSchema,
  propositionKey: propositionKeySchema,
  statement: bounded(1, 2_000),
  stance: z.enum(["supports", "contradicts", "qualifies"]),
  support: z.array(supportRefSchema).min(1).max(24),
});
const findingSchema = z.strictObject({
  propositionKey: propositionKeySchema,
  proposition: bounded(1, 1_000),
  observations: z.array(observationSchema).max(24),
  status: z.enum(["supported", "contested", "insufficient"]),
});
export const knowledgeUnitV3Schema: z.ZodType<KnowledgeUnit> = z.strictObject({
  problemId: researchProblemIdSchema,
  findings: z.array(findingSchema).max(24),
  evidence: z.array(evidencePackV3Schema).max(3),
  unresolvedGapIds: z.array(researchGapIdSchema).max(24),
});

const contextualAssistantContentSchema = z.strictObject({ parts: z.array(assistantContentPartSchema).max(256) });
const threadContextTurnSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ turnId: turnIdSchema, kind: z.literal("research"), request: bounded(1, 2_000), outcome: z.enum(["sufficient", "best_effort"]), answer: contextualAssistantContentSchema, answerTruncated: z.boolean() }),
  z.strictObject({ turnId: turnIdSchema, kind: z.literal("search"), request: bounded(1, 2_000), outcome: z.literal("search") }),
  z.strictObject({ turnId: turnIdSchema, kind: z.literal("research"), request: bounded(1, 2_000), outcome: z.literal("insufficient") }),
  z.strictObject({ turnId: turnIdSchema, kind: z.enum(["search", "research"]), request: bounded(1, 2_000), outcome: z.enum(["failed", "interrupted"]) }),
]);
export const threadContextV3Schema = z.strictObject({
  threadId: threadIdSchema,
  turns: z.array(threadContextTurnSchema).max(8),
  knownSources: z.array(canonicalSourceV3Schema).max(24),
  availableEvidence: z.array(evidencePackV3Schema).max(24),
});
const researchProblemSchema = z.strictObject({
  id: researchProblemIdSchema,
  parentId: researchProblemIdSchema.optional(),
  question: bounded(1, 2_000),
  purpose: bounded(1, 500),
  successCriterion: bounded(1, 500),
  context: threadContextV3Schema,
  depth: nonNegativeInt.max(2),
});
const researchGapSchema = z.strictObject({
  id: researchGapIdSchema,
  problem: researchProblemSchema,
  operatorFromParent: z.enum(["all", "any"]).optional(),
  status: z.enum(["open", "decomposed", "resolved", "blocked"]),
  support: z.array(supportRefSchema).max(24),
  fingerprint: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  createdOrder: nonNegativeInt,
});
export const gapLedgerV3Schema: z.ZodType<GapLedger> = z.strictObject({
  gaps: z.array(researchGapSchema).max(24),
  assessmentsUsed: nonNegativeInt.max(8),
  searchesUsed: nonNegativeInt.max(3),
  sourcesConsumed: nonNegativeInt.max(9),
});
const taskSchema: z.ZodType<ResearchTaskRecord> = z.strictObject({
  problemId: researchProblemIdSchema,
  query: bounded(1, 500),
  purpose: bounded(1, 500),
  priority,
  status: z.enum(["completed", "partial", "failed"]),
  evidence: z.array(z.strictObject({ sourceId: sourceIdSchema, rank: positiveInt.max(10) })).max(3),
});
const resolutionBase = {
  knowledge: knowledgeUnitV3Schema,
  ledger: gapLedgerV3Schema,
  tasks: z.array(taskSchema).max(3),
  sources: z.array(canonicalSourceV3Schema).max(24).optional(),
};
const boundedStop = z.enum(["search_budget_exhausted", "source_budget_exhausted", "assessment_budget_exhausted", "depth_limit_reached", "no_new_knowledge", "duplicate_problem", "provider_unavailable"]);
const sufficientResolutionSchema: z.ZodType<SufficientResearchResolution> = z.strictObject({ ...resolutionBase, status: z.literal("sufficient"), stopReason: z.literal("sufficient") });
const bestEffortResolutionSchema: z.ZodType<BestEffortResearchResolution> = z.strictObject({ ...resolutionBase, status: z.literal("best_effort"), stopReason: boundedStop });
const insufficientResolutionSchema: z.ZodType<InsufficientResearchResolution> = z.strictObject({ ...resolutionBase, status: z.literal("insufficient"), stopReason: boundedStop });
export const researchResolutionV3Schema: z.ZodType<ResearchResolution> = z.union([sufficientResolutionSchema, bestEffortResolutionSchema, insufficientResolutionSchema]);
const checkpointSchema: z.ZodType<ResearchCheckpoint> = z.strictObject({
  reason: z.enum(["interrupted", "execution_failure"]),
  knowledge: knowledgeUnitV3Schema,
  ledger: gapLedgerV3Schema,
  tasks: z.array(taskSchema).max(3),
  sources: z.array(canonicalSourceV3Schema).max(24).optional(),
});

const recordedSearchExecution = z.strictObject({ kind: z.literal("recorded"), searchRef: noControlRef });
const recordedResearchExecution = z.strictObject({ kind: z.literal("recorded"), assessmentModelRef: noControlRef, synthesisModelRef: noControlRef, searchRef: noControlRef });
const unavailableExecution = z.strictObject({ kind: z.literal("unavailable") });
const terminalBase = {
  id: turnIdSchema,
  retryOfTurnId: turnIdSchema.optional(),
  createdAt: isoTimestampSchema,
  finishedAt: isoTimestampSchema,
  userMessage: userMessageV3Schema,
};
const interruptionSchema = z.strictObject({ reason: z.enum(["user_cancelled", "navigation", "connection_lost"]), message: bounded(1, 500) });
const searchFailureSchema = z.union([
  z.strictObject({ code: z.enum(["provider_unavailable", "invalid_response", "search_failed"]), message: bounded(1, 500), retryable: z.boolean() }),
  z.strictObject({ code: z.literal("rate_limited"), message: bounded(1, 500), retryable: z.literal(true), retryAfterSeconds: positiveInt.optional() }),
]);
const destinationSchema = z.strictObject({ sourceId: sourceIdSchema, rank: positiveInt.max(10) });
const searchResultSchema = z.discriminatedUnion("completion", [
  z.strictObject({ completion: z.literal("results"), resultKind: z.enum(["link", "image", "video"]).default("link"), destinations: z.tuple([destinationSchema], destinationSchema) }).superRefine((result, context) => {
    if (new Set(result.destinations.map((item) => item.sourceId)).size !== result.destinations.length) context.addIssue({ code: "custom", message: "duplicate search destination" });
    if (new Set(result.destinations.map((item) => item.rank)).size !== result.destinations.length) context.addIssue({ code: "custom", message: "duplicate search rank" });
  }),
  z.strictObject({ completion: z.literal("empty"), resultKind: z.enum(["link", "image", "video"]).default("link"), destinations: z.tuple([]) }),
]);
export const searchTurnV3Schema: z.ZodType<SearchTurn> = z.discriminatedUnion("status", [
  z.strictObject({ ...terminalBase, kind: z.literal("search"), execution: recordedSearchExecution, status: z.literal("completed"), result: searchResultSchema }),
  z.strictObject({ ...terminalBase, kind: z.literal("search"), execution: recordedSearchExecution, status: z.literal("failed"), failure: searchFailureSchema }),
  z.strictObject({ ...terminalBase, kind: z.literal("search"), execution: z.union([recordedSearchExecution, unavailableExecution]), status: z.literal("interrupted"), interruption: interruptionSchema }),
]);
const researchResultSchema = z.discriminatedUnion("completion", [
  z.strictObject({ completion: z.literal("sufficient"), answer: assistantContentV3Schema, resolution: sufficientResolutionSchema, usage: usageSchema.optional() }),
  z.strictObject({ completion: z.literal("best_effort"), answer: assistantContentV3Schema, resolution: bestEffortResolutionSchema, usage: usageSchema.optional() }),
]);
const insufficientFailure = z.strictObject({ kind: z.literal("insufficient_evidence"), message: bounded(1, 500), retryable: z.literal(true) });
const synthesisFailure = z.discriminatedUnion("code", [
  z.strictObject({ kind: z.literal("synthesis_failure"), code: z.enum(["unavailable", "invalid_output"]), message: bounded(1, 500), retryable: z.literal(true) }),
  z.strictObject({ kind: z.literal("synthesis_failure"), code: z.literal("rate_limited"), message: bounded(1, 500), retryable: z.literal(true), retryAfterSeconds: positiveInt.optional() }),
  z.strictObject({ kind: z.literal("synthesis_failure"), code: z.literal("refused"), message: bounded(1, 500), retryable: z.literal(false) }),
]);
const executionFailure = z.discriminatedUnion("stage", [
  z.strictObject({ kind: z.literal("execution_failure"), stage: z.literal("assessment"), code: z.literal("assessment_failed"), message: bounded(1, 500), retryable: z.literal(true) }),
  z.strictObject({ kind: z.literal("execution_failure"), stage: z.literal("acquisition"), code: z.literal("acquisition_failed"), message: bounded(1, 500), retryable: z.literal(true) }),
  z.strictObject({ kind: z.literal("execution_failure"), stage: z.literal("resolution"), code: z.literal("resolution_invalid"), message: bounded(1, 500), retryable: z.literal(false) }),
  z.strictObject({ kind: z.literal("execution_failure"), stage: z.literal("transport"), code: z.literal("transport_failed"), message: bounded(1, 500), retryable: z.literal(true) }),
]);
const checkpointState = z.strictObject({ kind: z.literal("checkpoint"), checkpoint: checkpointSchema });
const unavailableState = z.strictObject({ kind: z.literal("unavailable") });
const insufficientState = z.strictObject({ kind: z.literal("resolution"), resolution: insufficientResolutionSchema });
const synthesisState = z.strictObject({ kind: z.literal("resolution"), resolution: z.union([sufficientResolutionSchema, bestEffortResolutionSchema]) });
const failedResearchTurnSchema: z.ZodType<FailedResearchTurn> = z.union([
  z.strictObject({ ...terminalBase, kind: z.literal("research"), execution: recordedResearchExecution, status: z.literal("failed"), failure: insufficientFailure, researchState: insufficientState }),
  z.strictObject({ ...terminalBase, kind: z.literal("research"), execution: recordedResearchExecution, status: z.literal("failed"), failure: synthesisFailure, researchState: synthesisState }),
  z.strictObject({ ...terminalBase, kind: z.literal("research"), execution: recordedResearchExecution, status: z.literal("failed"), failure: executionFailure, researchState: z.union([checkpointState, unavailableState]) }),
]);
export const researchTurnV3Schema: z.ZodType<ResearchTurn> = z.union([
  z.strictObject({ ...terminalBase, kind: z.literal("research"), execution: recordedResearchExecution, status: z.literal("completed"), result: researchResultSchema }),
  failedResearchTurnSchema,
  z.strictObject({ ...terminalBase, kind: z.literal("research"), execution: z.union([recordedResearchExecution, unavailableExecution]), status: z.literal("interrupted"), interruption: interruptionSchema, researchState: z.union([synthesisState, checkpointState, unavailableState]) }),
]);
export const turnV3Schema: z.ZodType<Turn> = z.union([searchTurnV3Schema, researchTurnV3Schema]);

const archiveDestinationSchema = z.strictObject({ sourceId: sourceIdSchema, rank: positiveInt.max(10), legacyCitationId: bounded(1, 256).optional() });
export const legacyArchiveEntryV3Schema: z.ZodType<LegacyArchiveEntry> = z.strictObject({
  id: legacyArchiveEntryIdSchema,
  originalIndex: nonNegativeInt.max(1_000_000),
  legacyKind: z.enum(["chat", "research"]),
  legacyStatus: z.enum(["completed", "failed", "interrupted"]),
  createdAt: isoTimestampSchema,
  finishedAt: isoTimestampSchema,
  request: bounded(1, 2_000),
  answerMarkdown: bounded(1, 64_000).optional(),
  statusMessage: bounded(1, 500).optional(),
  destinations: z.array(archiveDestinationSchema).max(10),
}).superRefine((entry, context) => {
  if (!entry.answerMarkdown && !entry.statusMessage) context.addIssue({ code: "custom", message: "archive entry requires answer or status" });
  if (entry.finishedAt < entry.createdAt) context.addIssue({ code: "custom", message: "archive timestamps out of order" });
  if (new Set(entry.destinations.map((item) => item.sourceId)).size !== entry.destinations.length) context.addIssue({ code: "custom", message: "duplicate archive destination" });
  if (new Set(entry.destinations.map((item) => item.rank)).size !== entry.destinations.length) context.addIssue({ code: "custom", message: "duplicate archive rank" });
});

interface DurableReferences {
  sources: Set<string>;
  turns: Set<string>;
}
function collectSupport(support: Array<{ type: "turn"; turnId: TurnId } | { type: "source"; sourceId: SourceId }>, target: DurableReferences) {
  for (const reference of support) {
    if (reference.type === "source") target.sources.add(reference.sourceId);
    else target.turns.add(reference.turnId);
  }
}
function collectContext(contextValue: z.infer<typeof threadContextV3Schema>, target: DurableReferences) {
  for (const source of contextValue.knownSources) target.sources.add(source.sourceId);
  for (const pack of contextValue.availableEvidence) for (const evidence of pack.sources) target.sources.add(evidence.sourceId);
  for (const turn of contextValue.turns) if ("answer" in turn) for (const part of turn.answer.parts) if (part.type === "citation") target.sources.add(part.sourceId);
}
function collectKnowledge(knowledge: KnowledgeUnit, target: DurableReferences) {
  for (const pack of knowledge.evidence) for (const evidence of pack.sources) target.sources.add(evidence.sourceId);
  for (const finding of knowledge.findings) for (const observation of finding.observations) collectSupport(observation.support, target);
}
function collectLedger(ledger: GapLedger, target: DurableReferences) {
  for (const gap of ledger.gaps) {
    collectSupport(gap.support, target);
    collectContext(gap.problem.context, target);
  }
}
function collectTasks(tasks: ResearchTaskRecord[], target: DurableReferences) {
  for (const task of tasks) for (const evidence of task.evidence) target.sources.add(evidence.sourceId);
}
function collectResolution(resolution: ResearchResolution, target: DurableReferences) {
  collectKnowledge(resolution.knowledge, target);
  collectLedger(resolution.ledger, target);
  collectTasks(resolution.tasks, target);
}
function collectCheckpoint(checkpoint: ResearchCheckpoint, target: DurableReferences) {
  collectKnowledge(checkpoint.knowledge, target);
  collectLedger(checkpoint.ledger, target);
  collectTasks(checkpoint.tasks, target);
}
function collectResearchReferences(turn: ResearchTurn, target: DurableReferences) {
  if (turn.status === "completed") {
    collectResolution(turn.result.resolution, target);
    for (const part of turn.result.answer.parts) if (part.type === "citation") target.sources.add(part.sourceId);
    return;
  }
  const state = turn.researchState;
  if (state.kind === "resolution") collectResolution(state.resolution, target);
  else if (state.kind === "checkpoint") collectCheckpoint(state.checkpoint, target);
}
const threadShape = z.strictObject({
  schemaVersion: z.literal(3),
  id: threadIdSchema,
  title: bounded(1, 120),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  sources: z.array(threadSourceRecordV3Schema),
  turns: z.array(turnV3Schema),
  legacyArchive: z.array(legacyArchiveEntryV3Schema).max(256),
});
export const threadV3Schema: z.ZodType<Thread> = threadShape.superRefine((thread, context) => {
  if (thread.turns.length === 0 && thread.legacyArchive.length === 0) context.addIssue({ code: "custom", message: "thread must contain durable history" });
  if (thread.updatedAt < thread.createdAt) context.addIssue({ code: "custom", message: "thread timestamps out of order" });
  thread.sources.forEach((source, index) => {
    if (source.ordinal !== index + 1) context.addIssue({ code: "custom", path: ["sources", index, "ordinal"], message: "source ordinals must be contiguous" });
  });
  const sourceIds = new Set<string>(thread.sources.map((source) => source.sourceId));
  if (sourceIds.size !== thread.sources.length) context.addIssue({ code: "custom", message: "duplicate source ID" });
  const references: DurableReferences = { sources: new Set<string>(), turns: new Set<string>() };
  const turnIds = new Set<string>();
  for (let index = 0; index < thread.turns.length; index += 1) {
    const turn = thread.turns[index];
    if (turnIds.has(turn.id)) context.addIssue({ code: "custom", path: ["turns", index, "id"], message: "duplicate turn ID" });
    turnIds.add(turn.id);
    if (index > 0 && `${turn.createdAt}:${turn.id}` < `${thread.turns[index - 1].createdAt}:${thread.turns[index - 1].id}`) context.addIssue({ code: "custom", path: ["turns", index], message: "turns out of order" });
    if (turn.finishedAt < turn.createdAt) context.addIssue({ code: "custom", path: ["turns", index, "finishedAt"], message: "turn timestamps out of order" });
    if (turn.retryOfTurnId) {
      const prior = thread.turns.slice(0, index).find((candidate) => candidate.id === turn.retryOfTurnId);
      if (!prior || prior.userMessage.content !== turn.userMessage.content) context.addIssue({ code: "custom", path: ["turns", index, "retryOfTurnId"], message: "invalid retry ancestry" });
    }
    if (turn.kind === "search" && turn.status === "completed") for (const destination of turn.result.destinations) references.sources.add(destination.sourceId);
    if (turn.kind === "research") {
      collectResearchReferences(turn, references);
      if (turn.status === "completed") {
        const allowedAnswerSources: DurableReferences = { sources: new Set<string>(), turns: new Set<string>() };
        collectKnowledge(turn.result.resolution.knowledge, allowedAnswerSources);
        for (const part of turn.result.answer.parts) if (part.type === "citation" && !allowedAnswerSources.sources.has(part.sourceId)) context.addIssue({ code: "custom", path: ["turns", index, "result", "answer"], message: "answer citation is not reachable through final knowledge" });
      }
    }
  }
  const archiveIds = new Set<string>();
  const originalIndexes = new Set<number>();
  for (let index = 0; index < thread.legacyArchive.length; index += 1) {
    const entry = thread.legacyArchive[index];
    if (archiveIds.has(entry.id) || originalIndexes.has(entry.originalIndex)) context.addIssue({ code: "custom", path: ["legacyArchive", index], message: "duplicate archive identity" });
    archiveIds.add(entry.id); originalIndexes.add(entry.originalIndex);
    if (index > 0 && `${entry.createdAt}:${entry.id}` < `${thread.legacyArchive[index - 1].createdAt}:${thread.legacyArchive[index - 1].id}`) context.addIssue({ code: "custom", path: ["legacyArchive", index], message: "archive out of order" });
    for (const destination of entry.destinations) references.sources.add(destination.sourceId);
  }
  for (const sourceId of references.sources) if (!sourceIds.has(sourceId)) context.addIssue({ code: "custom", message: `missing source reference: ${sourceId}` });
  for (const sourceId of sourceIds) if (!references.sources.has(sourceId)) context.addIssue({ code: "custom", message: `orphan source: ${sourceId}` });
  for (const referencedTurnId of references.turns) if (!turnIds.has(referencedTurnId)) context.addIssue({ code: "custom", message: `missing turn support: ${referencedTurnId}` });
  const latestActivity = [...thread.turns.map((turn) => turn.finishedAt), ...thread.legacyArchive.map((entry) => entry.finishedAt)].sort().at(-1);
  if (latestActivity && thread.updatedAt < latestActivity) context.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt precedes durable activity" });
});
