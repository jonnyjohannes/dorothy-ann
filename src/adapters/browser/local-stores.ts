import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ArtifactDraft, StoredThreadEnvelopeV2, Thread, ThreadCommit, ThreadSummary } from "../../domain/types";
import { expiryFor, isExpired, isValidEnvelope, isValidThread, migrateThread } from "../../domain/thread-state";
import type { ArtifactDraftStore, ImportPreview, ImportReport, ThreadBackup, ThreadStore } from "../../ports/storage";

interface DorothyAnnDb extends DBSchema {
  threads: { key: string; value: StoredThreadEnvelopeV2 | { schemaVersion: 1; thread: Thread } };
  threadSummaries: { key: string; value: ThreadSummary; indexes: { "by-updated-at": string } };
  artifactDrafts: { key: string; value: ArtifactDraft; indexes: { "by-source-key": string; "by-thread-id": string; "by-updated-at": string } };
}
const DB_NAME = "dorothy-ann";
const DB_VERSION = 3;

export function openDorothyAnnDb(): Promise<IDBPDatabase<DorothyAnnDb>> {
  return openDB<DorothyAnnDb>(DB_NAME, DB_VERSION, { upgrade(db, _oldVersion, _newVersion, transaction) {
    if (!db.objectStoreNames.contains("threads")) db.createObjectStore("threads");
    if (!db.objectStoreNames.contains("threadSummaries")) db.createObjectStore("threadSummaries");
    const summaries = transaction.objectStore("threadSummaries");
    if (!summaries.indexNames.contains("by-updated-at")) summaries.createIndex("by-updated-at", "updatedAt");
    if (!db.objectStoreNames.contains("artifactDrafts")) db.createObjectStore("artifactDrafts", { keyPath: "id" });
    const drafts = transaction.objectStore("artifactDrafts");
    if (!drafts.indexNames.contains("by-source-key")) drafts.createIndex("by-source-key", "sourceKey", { unique: true });
    if (!drafts.indexNames.contains("by-thread-id")) drafts.createIndex("by-thread-id", "threadId");
    if (!drafts.indexNames.contains("by-updated-at")) drafts.createIndex("by-updated-at", "updatedAt");
  } });
}

function summary(thread: Thread): ThreadSummary { const last = thread.turns.at(-1); return { id: thread.id, title: thread.title, createdAt: thread.createdAt, updatedAt: thread.updatedAt, lastTurnPreview: last?.userMessage.content.slice(0, 120) }; }
function envelope(thread: Thread, activityAt: string): StoredThreadEnvelopeV2 { return { schemaVersion: 2, thread: { ...thread, schemaVersion: 2 }, lastMeaningfulActivityAt: activityAt as Thread["updatedAt"], expiresAt: expiryFor(activityAt) }; }

export class LocalThreadStore implements ThreadStore {
  constructor(private readonly dbPromise = openDorothyAnnDb(), private readonly clock: () => Date = () => new Date()) {}
  private async cleanup(): Promise<void> {
    const db = await this.dbPromise; const tx = db.transaction(["threads", "threadSummaries", "artifactDrafts"], "readwrite"); const threads = tx.objectStore("threads");
    for (const key of await threads.getAllKeys()) { const value = await threads.get(key); const migrated = value && "thread" in value && value.schemaVersion === 1 ? envelope(value.thread, value.thread.updatedAt) : value; if (!migrated || !isValidEnvelope(migrated) || isExpired(migrated, this.clock())) { await threads.delete(key); await tx.objectStore("threadSummaries").delete(key); for (const draft of await tx.objectStore("artifactDrafts").index("by-thread-id").getAll(key)) await tx.objectStore("artifactDrafts").delete(draft.id); } else if (value !== migrated) await threads.put(migrated, key); }
    await tx.done;
  }
  async list(): Promise<ThreadSummary[]> { await this.cleanup(); const db = await this.dbPromise; return (await db.getAllFromIndex("threadSummaries", "by-updated-at")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async load(threadId: string): Promise<Thread | null> { await this.cleanup(); try { const record = await (await this.dbPromise).get("threads", threadId); if (!record || !isValidEnvelope(record)) return null; return record.thread; } catch { return null; } }
  async save(thread: Thread, activityAt = this.clock().toISOString()): Promise<void> { if (!isValidThread(thread)) throw new Error("invalid_thread"); const db = await this.dbPromise; const previous = await db.get("threads", thread.id); const active = previous && isValidEnvelope(previous) ? previous.lastMeaningfulActivityAt : activityAt; await this.writeEnvelope(envelope(thread, active)); }
  async commit(input: ThreadCommit): Promise<Thread> { if (!isValidThread(input.thread)) throw new Error("invalid_thread"); await this.writeEnvelope(envelope(input.thread, input.committedAt)); return { ...input.thread, schemaVersion: 2 }; }
  private async writeEnvelope(value: StoredThreadEnvelopeV2): Promise<void> { const db = await this.dbPromise; const tx = db.transaction(["threads", "threadSummaries"], "readwrite"); await tx.objectStore("threads").put(value, value.thread.id); await tx.objectStore("threadSummaries").put(summary(value.thread), value.thread.id); await tx.done; }
  async remove(threadId: string): Promise<void> { const db = await this.dbPromise; const tx = db.transaction(["threads", "threadSummaries", "artifactDrafts"], "readwrite"); await tx.objectStore("threads").delete(threadId); await tx.objectStore("threadSummaries").delete(threadId); for (const draft of await tx.objectStore("artifactDrafts").index("by-thread-id").getAll(threadId)) await tx.objectStore("artifactDrafts").delete(draft.id); await tx.done; }
  async exportData(threadIds?: string[]): Promise<ThreadBackup> { await this.cleanup(); const ids = threadIds ? new Set(threadIds) : null; const records = await (await this.dbPromise).getAll("threads"); return { backupVersion: 2, exportedAt: this.clock().toISOString(), threads: records.filter(isValidEnvelope).filter((record) => !ids || ids.has(record.thread.id)).map((record) => ({ schemaVersion: 2 as const, thread: record.thread, lastMeaningfulActivityAt: record.lastMeaningfulActivityAt, expiresAt: record.expiresAt })) }; }
  async inspectImport(backup: ThreadBackup): Promise<ImportPreview> { const issues = validateBackup(backup); const existing = new Set(await (await this.dbPromise).getAllKeys("threads")); const valid = validBackupThreads(backup); return { add: valid.filter((item) => !existing.has(item.thread.id)).length, conflicts: valid.filter((item) => existing.has(item.thread.id)).length, skippedInvalid: issues.length, issues }; }
  async importData(backup: ThreadBackup, options: { onConflict: "skip" | "replace" }): Promise<ImportReport> { const preview = await this.inspectImport(backup); const added: string[] = [], replaced: string[] = [], skipped: string[] = []; const db = await this.dbPromise; const tx = db.transaction(["threads", "threadSummaries"], "readwrite"); for (const item of validBackupThreads(backup)) { const exists = await tx.objectStore("threads").getKey(item.thread.id); if (exists && options.onConflict === "skip") { skipped.push(item.thread.id); continue; } const expiry = item.expiresAt ?? expiryFor(this.clock().toISOString()); const activity = item.lastMeaningfulActivityAt ?? this.clock().toISOString(); const value = { schemaVersion: 2 as const, thread: { ...item.thread, schemaVersion: 2 as const }, lastMeaningfulActivityAt: activity as Thread["updatedAt"], expiresAt: expiry as Thread["updatedAt"] }; if (isExpired(value, this.clock())) { skipped.push(item.thread.id); continue; } await tx.objectStore("threads").put(value, item.thread.id); await tx.objectStore("threadSummaries").put(summary(value.thread), item.thread.id); (exists ? replaced : added).push(item.thread.id); } await tx.done; return { ...preview, added, replaced, skipped }; }
}
function validBackupThreads(backup: ThreadBackup): Array<{ thread: Thread; lastMeaningfulActivityAt?: string; expiresAt?: string }> { if (!backup || !Array.isArray(backup.threads)) return []; return backup.threads.flatMap((item) => { const thread = migrateThread(item?.thread); return thread ? [{ thread, lastMeaningfulActivityAt: item.lastMeaningfulActivityAt, expiresAt: item.expiresAt }] : []; }); }
function validateBackup(backup: ThreadBackup): Array<{ code: "invalid_backup"; message: string }> { if (!backup || ![1, 2].includes(backup.backupVersion) || !Array.isArray(backup.threads)) return [{ code: "invalid_backup", message: "unsupported or malformed backup" }]; return backup.threads.flatMap((item) => migrateThread(item?.thread) ? [] : [{ code: "invalid_backup", message: "thread record failed validation" }]); }

export class LocalArtifactDraftStore implements ArtifactDraftStore {
  constructor(private readonly dbPromise = openDorothyAnnDb()) {}
  async loadBySourceKey(sourceKey: string): Promise<ArtifactDraft | null> { return (await (await this.dbPromise).getFromIndex("artifactDrafts", "by-source-key", sourceKey)) ?? null; }
  async save(draft: ArtifactDraft): Promise<void> { if (!draft.sourceKey || !draft.markdown) throw new Error("invalid_draft"); await (await this.dbPromise).put("artifactDrafts", draft); }
  async remove(draftId: string): Promise<void> { await (await this.dbPromise).delete("artifactDrafts", draftId); }
}
