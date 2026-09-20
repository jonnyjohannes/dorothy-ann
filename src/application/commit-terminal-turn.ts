import type { CanonicalSource, KnowledgeUnit, ResearchCheckpoint, ResearchResolution, ResearchTurn, SourceId, Thread, ThreadSourceRecord, Turn } from "../domain/types.js";
import { sourceRecordV3Schema, threadV3Schema, turnV3Schema } from "../domain/schemas.js";
import type { CommitTerminalTurnInput, CommitTerminalTurnValue, StoredThreadRecord, ThreadRevision, ThreadStoreFailure, ThreadStoreResult } from "../ports/storage-v3.js";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export interface TerminalCommitIdentity {
  sourceId(canonicalUrl: string): Promise<SourceId>;
}
export interface CommitTerminalTurnDependencies {
  identities: TerminalCommitIdentity;
  nextRevision(): ThreadRevision;
}
export interface CommitTerminalTurnState {
  record: StoredThreadRecord | null;
  deleted: boolean;
}

const failure = (code: ThreadStoreFailure["code"]): ThreadStoreResult<never> => ({
  ok: false,
  failure: code === "revision_conflict" || code === "storage_unavailable" || code === "quota_exceeded"
    ? { code, retryable: true }
    : { code, retryable: false },
});
const stable = (value: unknown) => JSON.stringify(value);

interface References { sources: Set<string> }
function addKnowledge(knowledge: KnowledgeUnit, references: References) {
  for (const pack of knowledge.evidence) for (const evidence of pack.sources) references.sources.add(evidence.sourceId);
  for (const finding of knowledge.findings) for (const observation of finding.observations) for (const support of observation.support) if (support.type === "source") references.sources.add(support.sourceId);
}
function addLedgerContexts(resolution: ResearchResolution | ResearchCheckpoint, references: References) {
  for (const gap of resolution.ledger.gaps) {
    for (const support of gap.support) if (support.type === "source") references.sources.add(support.sourceId);
    for (const source of gap.problem.context.knownSources) references.sources.add(source.sourceId);
    for (const pack of gap.problem.context.availableEvidence) for (const evidence of pack.sources) references.sources.add(evidence.sourceId);
    for (const contextTurn of gap.problem.context.turns) if ("answer" in contextTurn) for (const part of contextTurn.answer.parts) if (part.type === "citation") references.sources.add(part.sourceId);
  }
}
export function collectResearchStateSourceIds(state: ResearchResolution | ResearchCheckpoint): Set<string> {
  const references: References = { sources: new Set() };
  addKnowledge(state.knowledge, references);
  for (const task of state.tasks) for (const evidence of task.evidence) references.sources.add(evidence.sourceId);
  addLedgerContexts(state, references);
  return references.sources;
}
function addResearchState(state: ResearchResolution | ResearchCheckpoint, references: References) {
  for (const sourceId of collectResearchStateSourceIds(state)) references.sources.add(sourceId);
}
function addResearch(turn: ResearchTurn, references: References) {
  if (turn.status === "completed") {
    addResearchState(turn.result.resolution, references);
    for (const part of turn.result.answer.parts) if (part.type === "citation") references.sources.add(part.sourceId);
    return;
  }
  if (turn.researchState.kind === "resolution") addResearchState(turn.researchState.resolution, references);
  else if (turn.researchState.kind === "checkpoint") addResearchState(turn.researchState.checkpoint, references);
}
export function collectTurnSourceIds(turn: Turn): Set<string> {
  const references: References = { sources: new Set() };
  if (turn.kind === "search" && turn.status === "completed") for (const destination of turn.result.destinations) references.sources.add(destination.sourceId);
  if (turn.kind === "research") addResearch(turn, references);
  return references.sources;
}

async function validateSourceIdentity(source: CanonicalSource, identities: TerminalCommitIdentity): Promise<"valid" | "invalid" | "collision"> {
  const candidate = { ...source } as CanonicalSource & { ordinal?: number };
  delete candidate.ordinal;
  const parsed = sourceRecordV3Schema.safeParse(candidate);
  if (!parsed.success) return "invalid";
  try {
    return await identities.sourceId(source.canonicalUrl) === source.sourceId ? "valid" : "collision";
  } catch {
    return "invalid";
  }
}

export async function commitTerminalTurn(
  state: CommitTerminalTurnState,
  input: CommitTerminalTurnInput,
  dependencies: CommitTerminalTurnDependencies,
): Promise<ThreadStoreResult<CommitTerminalTurnValue>> {
  if (state.deleted) return failure("thread_deleted");
  const parsedTurn = turnV3Schema.safeParse(input.turn);
  if (!parsedTurn.success) return failure("invalid_record");
  const turn = parsedTurn.data;
  const current = state.record;
  if (current && (current.recordVersion !== 1 || !current.revision || !Number.isFinite(Date.parse(current.expiresAt)) || !threadV3Schema.safeParse(current.thread).success)) return failure("integrity_failure");
  if (current && current.thread.id !== input.threadId) return failure("integrity_failure");

  if (current) {
    const existing = current.thread.turns.find((candidate) => candidate.id === turn.id);
    if (existing) return stable(existing) === stable(turn)
      ? { ok: true, value: { disposition: "already_committed", record: current } }
      : failure("integrity_failure");
    if (input.create) return failure("invalid_record");
    if (input.expectedRevision !== current.revision) return failure("revision_conflict");
  } else {
    if (input.expectedRevision !== null || !input.create || input.create.id !== input.threadId) return failure("thread_not_found");
  }

  const referencedSourceIds = collectTurnSourceIds(turn);
  const suppliedById = new Map<string, CanonicalSource>();
  for (const source of input.sourceRecords) {
    if (!referencedSourceIds.has(source.sourceId) || suppliedById.has(source.sourceId)) return failure("invalid_record");
    const identity = await validateSourceIdentity(source, dependencies.identities);
    if (identity === "invalid") return failure("invalid_record");
    if (identity === "collision") return failure("integrity_failure");
    suppliedById.set(source.sourceId, source);
  }

  const existingSources = current?.thread.sources ?? [];
  const existingById = new Map<string, (typeof existingSources)[number]>(existingSources.map((source) => [source.sourceId, source]));
  for (const source of existingSources) {
    const identity = await validateSourceIdentity(source, dependencies.identities);
    if (identity !== "valid") return failure("integrity_failure");
    const supplied = suppliedById.get(source.sourceId);
    if (supplied && supplied.canonicalUrl !== source.canonicalUrl) return failure("integrity_failure");
  }
  for (const sourceId of referencedSourceIds) if (!existingById.has(sourceId) && !suppliedById.has(sourceId)) return failure("invalid_record");

  const newSources = input.sourceRecords.filter((source) => !existingById.has(source.sourceId));
  const sources: ThreadSourceRecord[] = [...existingSources, ...newSources.map((source, index) => ({ ...source, ...( "kind" in source ? {} : { kind: "link" as const }), ordinal: existingSources.length + index + 1 } as ThreadSourceRecord))];
  const turns = [...(current?.thread.turns ?? []), turn].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const updatedAt = current && current.thread.updatedAt > turn.finishedAt ? current.thread.updatedAt : turn.finishedAt;
  const thread: Thread = current ? { ...current.thread, updatedAt, sources, turns } : {
    schemaVersion: 3,
    id: input.create!.id,
    title: input.create!.title,
    createdAt: input.create!.createdAt,
    updatedAt,
    sources,
    turns,
    legacyArchive: [],
  };
  const parsedThread = threadV3Schema.safeParse(thread);
  if (!parsedThread.success) return failure("invalid_record");
  const revision = dependencies.nextRevision();
  if (current && revision === current.revision) return failure("integrity_failure");
  const record: StoredThreadRecord = {
    recordVersion: 1,
    revision,
    expiresAt: new Date(Date.parse(updatedAt) + RETENTION_MS).toISOString() as StoredThreadRecord["expiresAt"],
    thread: parsedThread.data,
  };
  return { ok: true, value: { disposition: "committed", record } };
}
