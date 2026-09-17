import { commitTerminalTurn, type TerminalCommitIdentity } from "../../application/commit-terminal-turn.js";
import { legacyStoredThreadInputSchema } from "../../domain/legacy-input-schemas.js";
import { migrateLegacyThread, type LegacyMigrationIdentities } from "../../domain/migrations.js";
import type { IsoTimestamp, Thread, ThreadId, ThreadSummary } from "../../domain/types.js";
import { threadV3Schema } from "../../domain/schemas.js";
import type { CommitTerminalTurnInput, CommitTerminalTurnValue, ImportIssueSummary, ImportReport, InspectedThreadImport, RemoveThreadInput, StoredThreadRecord, StoredThreadSummary, ThreadBackup, ThreadRevision, ThreadStore, ThreadStoreFailure, ThreadStoreResult, ValidatedImportCandidate } from "../../ports/storage-v3.js";

const RETENTION_MS = 7 * 86_400_000;
const MAX_ISSUES = 20;
export interface ThreadTombstone { deletedAt: IsoTimestamp; expiresAt: IsoTimestamp }
export interface PersistedThreadState { record: StoredThreadRecord | null; tombstone: ThreadTombstone | null }
export interface ImportEntry { thread: Thread; expiresAt: IsoTimestamp }
interface CandidateData { entries: ImportEntry[]; preview: InspectedThreadImport["preview"] }

const unavailable = <T>(code: "storage_unavailable" | "quota_exceeded" = "storage_unavailable"): ThreadStoreResult<T> => ({ ok: false, failure: { code, retryable: true } });
const terminalFailure = <T>(code: "revision_conflict" | "thread_not_found" | "thread_deleted" | "invalid_record" | "integrity_failure"): ThreadStoreResult<T> => ({ ok: false, failure: { code, retryable: code === "revision_conflict" } as ThreadStoreFailure });
const timestamp = (date: Date) => date.toISOString() as IsoTimestamp;
const expiryAt = (activity: string) => timestamp(new Date(Date.parse(activity) + RETENTION_MS));
const summary = (thread: Thread): ThreadSummary => {
  const last = thread.turns.at(-1);
  return { id: thread.id, title: thread.title, createdAt: thread.createdAt, updatedAt: thread.updatedAt, lastRequestPreview: last?.userMessage.content.slice(0, 120), turnCount: thread.turns.length, legacyArchiveCount: thread.legacyArchive.length };
};
class StoredStateIntegrityError extends Error {}
function resultFailure<T>(error: unknown): ThreadStoreResult<T> {
  if (error instanceof StoredStateIntegrityError) return terminalFailure("integrity_failure");
  return unavailable(error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED") ? "quota_exceeded" : "storage_unavailable");
}
function isExpired(value: { expiresAt: string }, clock: Date) { return Date.parse(value.expiresAt) <= clock.getTime(); }

export abstract class ThreadStoreBase implements ThreadStore {
  private readonly candidates = new Map<ValidatedImportCandidate, CandidateData>();
  protected constructor(
    protected readonly identities: TerminalCommitIdentity & LegacyMigrationIdentities,
    protected readonly clock: () => Date = () => new Date(),
    private readonly revisions: () => ThreadRevision = () => `revision_${crypto.randomUUID()}` as ThreadRevision,
  ) {}

  protected abstract readState(threadId: ThreadId): Promise<PersistedThreadState>;
  protected abstract listIds(): Promise<ThreadId[]>;
  protected abstract writeRecord(threadId: ThreadId, expectedRevision: ThreadRevision | null, record: StoredThreadRecord, clearTombstone: boolean): Promise<boolean>;
  protected abstract writeTombstone(threadId: ThreadId, expectedRevision: ThreadRevision, tombstone: ThreadTombstone): Promise<boolean>;
  protected abstract purge(threadId: ThreadId): Promise<void>;

  protected async convertLegacyStoredRecord(value: unknown): Promise<StoredThreadRecord | null> {
    const candidate = value && typeof value === "object" && "schemaVersion" in value && "thread" in value
      ? { schemaVersion: value.schemaVersion, thread: value.thread, ...(value.schemaVersion === 2 && "lastMeaningfulActivityAt" in value && "expiresAt" in value ? { lastMeaningfulActivityAt: value.lastMeaningfulActivityAt, expiresAt: value.expiresAt } : {}) }
      : value;
    const parsed = legacyStoredThreadInputSchema.safeParse(candidate);
    if (!parsed.success) return null;
    const migrated = await migrateLegacyThread(parsed.data.thread, this.identities);
    if (!migrated.thread) return null;
    const sourceExpiry = "expiresAt" in parsed.data ? parsed.data.expiresAt : expiryAt(migrated.thread.updatedAt);
    if (!Number.isFinite(Date.parse(sourceExpiry))) return null;
    return { recordVersion: 1, revision: this.revisions(), expiresAt: sourceExpiry as IsoTimestamp, thread: migrated.thread };
  }

  private async liveState(threadId: ThreadId): Promise<PersistedThreadState> {
    const state = await this.readState(threadId);
    if (state.record && state.tombstone) throw new StoredStateIntegrityError();
    if (state.record && (state.record.recordVersion !== 1 || !state.record.revision || !Number.isFinite(Date.parse(state.record.expiresAt)) || !threadV3Schema.safeParse(state.record.thread).success || !await this.validSourceIdentities(state.record.thread))) throw new StoredStateIntegrityError();
    if (state.tombstone && (!Number.isFinite(Date.parse(state.tombstone.deletedAt)) || !Number.isFinite(Date.parse(state.tombstone.expiresAt)) || state.tombstone.expiresAt < state.tombstone.deletedAt)) throw new StoredStateIntegrityError();
    const now = this.clock();
    if (state.record && isExpired(state.record, now)) { await this.purge(threadId); return { record: null, tombstone: state.tombstone }; }
    if (state.tombstone && isExpired(state.tombstone, now)) { if (!state.record) await this.purge(threadId); return { record: state.record, tombstone: null }; }
    return state;
  }

  async list(): Promise<ThreadStoreResult<StoredThreadSummary[]>> {
    try {
      const values: StoredThreadSummary[] = [];
      for (const id of await this.listIds()) {
        const state = await this.liveState(id);
        if (state.record) values.push({ summary: summary(state.record.thread), revision: state.record.revision });
      }
      values.sort((left, right) => right.summary.updatedAt.localeCompare(left.summary.updatedAt) || left.summary.id.localeCompare(right.summary.id));
      return { ok: true, value: values };
    } catch (error) { return resultFailure(error); }
  }

  async load(threadId: ThreadId): Promise<ThreadStoreResult<StoredThreadRecord | null>> {
    try { return { ok: true, value: (await this.liveState(threadId)).record }; }
    catch (error) { return resultFailure(error); }
  }

  async commitTerminalTurn(input: CommitTerminalTurnInput): Promise<ThreadStoreResult<CommitTerminalTurnValue>> {
    try {
      let state = await this.liveState(input.threadId);
      let evaluated = await commitTerminalTurn({ record: state.record, deleted: Boolean(state.tombstone) }, input, { identities: this.identities, nextRevision: this.revisions });
      if (!evaluated.ok || evaluated.value.disposition === "already_committed") return evaluated;
      if (await this.writeRecord(input.threadId, state.record?.revision ?? null, evaluated.value.record, false)) return evaluated;
      state = await this.liveState(input.threadId);
      evaluated = await commitTerminalTurn({ record: state.record, deleted: Boolean(state.tombstone) }, input, { identities: this.identities, nextRevision: this.revisions });
      return evaluated.ok && evaluated.value.disposition === "already_committed" ? evaluated : terminalFailure("revision_conflict");
    } catch (error) { return resultFailure(error); }
  }

  async remove(input: RemoveThreadInput): Promise<ThreadStoreResult<"removed" | "already_absent">> {
    try {
      const state = await this.liveState(input.threadId);
      if (!state.record) return { ok: true, value: "already_absent" };
      if (input.expectedRevision && input.expectedRevision !== state.record.revision) return terminalFailure("revision_conflict");
      const deletedAt = timestamp(this.clock());
      const tombstone = { deletedAt, expiresAt: expiryAt(deletedAt) };
      return await this.writeTombstone(input.threadId, state.record.revision, tombstone)
        ? { ok: true, value: "removed" }
        : terminalFailure("revision_conflict");
    } catch (error) { return resultFailure(error); }
  }

  async exportData(threadIds?: ThreadId[]): Promise<ThreadStoreResult<ThreadBackup>> {
    try {
      const allowed = threadIds ? new Set(threadIds) : null;
      const threads: ThreadBackup["threads"] = [];
      for (const id of await this.listIds()) {
        if (allowed && !allowed.has(id)) continue;
        const record = (await this.liveState(id)).record;
        if (record) threads.push({ thread: record.thread, expiresAt: record.expiresAt });
      }
      threads.sort((left, right) => left.thread.id.localeCompare(right.thread.id));
      return { ok: true, value: { backupVersion: 3, exportedAt: timestamp(this.clock()), threads } };
    } catch (error) { return resultFailure(error); }
  }

  async inspectImport(value: unknown): Promise<ThreadStoreResult<InspectedThreadImport>> {
    let inspected: Awaited<ReturnType<ThreadStoreBase["inspect"]>>;
    try { inspected = await this.inspect(value); }
    catch { return terminalFailure("invalid_record"); }
    if (!inspected) return terminalFailure("invalid_record");
    try {
      const existing = new Set<ThreadId>();
      for (const id of await this.listIds()) { const state = await this.liveState(id); if (state.record || state.tombstone) existing.add(id); }
      const candidate = `import_${crypto.randomUUID()}` as ValidatedImportCandidate;
      const preview = {
        add: inspected.entries.filter((entry) => !existing.has(entry.thread.id)).length,
        conflicts: inspected.entries.filter((entry) => existing.has(entry.thread.id)).length,
        skippedInvalid: inspected.skippedInvalid,
        archivedLegacyEntries: inspected.archivedLegacyEntries,
        droppedLegacyEntries: inspected.droppedLegacyEntries,
        issues: inspected.issues.slice(0, MAX_ISSUES),
      };
      if (this.candidates.size >= 32) this.candidates.delete(this.candidates.keys().next().value as ValidatedImportCandidate);
      this.candidates.set(candidate, { entries: inspected.entries, preview });
      return { ok: true, value: { preview, candidate } };
    } catch (error) { return resultFailure(error); }
  }

  async importData(candidate: ValidatedImportCandidate, options: { onConflict: "keep_existing" | "replace_existing" }): Promise<ThreadStoreResult<ImportReport>> {
    const data = this.candidates.get(candidate);
    this.candidates.delete(candidate);
    if (!data) return terminalFailure("invalid_record");
    const added: ThreadId[] = [], replaced: ThreadId[] = [], skipped: ThreadId[] = [];
    try {
      for (const entry of data.entries) {
        const state = await this.liveState(entry.thread.id);
        if ((state.record || state.tombstone) && options.onConflict === "keep_existing") { skipped.push(entry.thread.id); continue; }
        const now = timestamp(this.clock());
        const candidateThread = { ...entry.thread, updatedAt: now };
        const parsed = threadV3Schema.safeParse(candidateThread);
        if (!parsed.success) { skipped.push(entry.thread.id); continue; }
        const record: StoredThreadRecord = { recordVersion: 1, revision: this.revisions(), expiresAt: expiryAt(now), thread: parsed.data };
        if (!await this.writeRecord(entry.thread.id, state.record?.revision ?? null, record, options.onConflict === "replace_existing")) { skipped.push(entry.thread.id); continue; }
        (state.record || state.tombstone ? replaced : added).push(entry.thread.id);
      }
      return { ok: true, value: { added, replaced, skipped, skippedInvalid: data.preview.skippedInvalid, archivedLegacyEntries: data.preview.archivedLegacyEntries, droppedLegacyEntries: data.preview.droppedLegacyEntries } };
    } catch (error) { return resultFailure(error); }
  }

  private async inspect(value: unknown): Promise<{ entries: ImportEntry[]; skippedInvalid: number; archivedLegacyEntries: number; droppedLegacyEntries: number; issues: ImportIssueSummary[] } | null> {
    if (!value || typeof value !== "object" || Object.keys(value).some((key) => key !== "backupVersion" && key !== "exportedAt" && key !== "threads") || !("backupVersion" in value) || !("exportedAt" in value) || typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt)) || !("threads" in value) || !Array.isArray(value.threads) || value.threads.length > 1_024) return null;
    const version = value.backupVersion;
    if (version !== 1 && version !== 2 && version !== 3) return null;
    const entries: ImportEntry[] = [];
    const seenThreadIds = new Set<string>();
    const issues: ImportIssueSummary[] = [];
    let skippedInvalid = 0, archivedLegacyEntries = 0, droppedLegacyEntries = 0;
    for (const raw of value.threads) {
      if (version === 3) {
        if (!raw || typeof raw !== "object" || Object.keys(raw).some((key) => key !== "thread" && key !== "expiresAt")) { skippedInvalid += 1; issues.push({ code: "invalid_thread", message: "Thread record failed validation." }); continue; }
        const parsed = threadV3Schema.safeParse((raw as { thread?: unknown }).thread);
        const expiresAt = (raw as { expiresAt?: unknown }).expiresAt;
        if (!parsed.success || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)) || !await this.validSourceIdentities(parsed.success ? parsed.data : null)) { skippedInvalid += 1; issues.push({ threadId: parsed.success ? parsed.data.id : undefined, code: parsed.success ? "invalid_source" : "invalid_thread", message: "Thread record failed validation." }); continue; }
        if (seenThreadIds.has(parsed.data.id)) { skippedInvalid += 1; issues.push({ threadId: parsed.data.id, code: "invalid_thread", message: "Duplicate thread record was skipped." }); continue; }
        seenThreadIds.add(parsed.data.id);
        entries.push({ thread: parsed.data, expiresAt: expiresAt as IsoTimestamp });
        archivedLegacyEntries += parsed.data.legacyArchive.length;
        continue;
      }
      const wrapper = legacyStoredThreadInputSchema.safeParse(raw);
      const legacy = wrapper.success ? wrapper.data.thread : null;
      if (!legacy) { skippedInvalid += 1; issues.push({ code: "invalid_thread", message: "Legacy thread record failed validation." }); continue; }
      const migrated = await migrateLegacyThread(legacy, this.identities);
      archivedLegacyEntries += migrated.archivedLegacyEntries;
      droppedLegacyEntries += migrated.droppedLegacyEntries;
      for (const issue of migrated.issues) issues.push({ threadId: migrated.thread?.id, code: issue.code, message: "Legacy record required bounded migration." });
      if (!migrated.thread) { skippedInvalid += 1; continue; }
      if (seenThreadIds.has(migrated.thread.id)) { skippedInvalid += 1; issues.push({ threadId: migrated.thread.id, code: "invalid_thread", message: "Duplicate thread record was skipped." }); continue; }
      seenThreadIds.add(migrated.thread.id);
      const rawExpiry = raw && typeof raw === "object" && "expiresAt" in raw ? (raw as { expiresAt?: unknown }).expiresAt : undefined;
      entries.push({ thread: migrated.thread, expiresAt: typeof rawExpiry === "string" && Number.isFinite(Date.parse(rawExpiry)) ? rawExpiry as IsoTimestamp : expiryAt(migrated.thread.updatedAt) });
    }
    return { entries, skippedInvalid, archivedLegacyEntries, droppedLegacyEntries, issues };
  }

  private async validSourceIdentities(thread: Thread | null): Promise<boolean> {
    if (!thread) return false;
    try { for (const source of thread.sources) if (await this.identities.sourceId(source.canonicalUrl) !== source.sourceId) return false; return true; }
    catch { return false; }
  }
}
