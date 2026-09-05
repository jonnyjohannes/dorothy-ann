import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ArtifactDraft, Thread, ThreadSummary } from "../../domain/types";
import type { ArtifactDraftStore, ImportPreview, ImportReport, ThreadBackup, ThreadStore } from "../../ports/storage";

interface DorothyAnnDb extends DBSchema { threads: { key: string; value: { schemaVersion: 1; thread: Thread } }; threadSummaries: { key: string; value: ThreadSummary; indexes: { "by-updated-at": string } }; artifactDrafts: { key: string; value: ArtifactDraft; indexes: { "by-source-key": string; "by-thread-id": string; "by-updated-at": string } } }
const DB_NAME = "dorothy-ann";
const DB_VERSION = 2;
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
function validThread(value: unknown): value is Thread { if (!value || typeof value !== "object") return false; const candidate = value as Partial<Thread>; return candidate.schemaVersion === 1 && typeof candidate.id === "string" && candidate.id.length > 0 && typeof candidate.title === "string" && typeof candidate.createdAt === "string" && typeof candidate.updatedAt === "string" && typeof candidate.modelRef === "string" && typeof candidate.searchRef === "string" && Array.isArray(candidate.turns); }
export class LocalThreadStore implements ThreadStore {
  constructor(private readonly dbPromise = openDorothyAnnDb()) {}
  async list(): Promise<ThreadSummary[]> { const db = await this.dbPromise; return (await db.getAllFromIndex("threadSummaries", "by-updated-at")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async load(threadId: string): Promise<Thread | null> { try { const record = await (await this.dbPromise).get("threads", threadId); return record && validThread(record.thread) ? record.thread : null; } catch { return null; } }
  async save(thread: Thread): Promise<void> { if (!validThread(thread)) throw new Error("invalid_thread"); const db = await this.dbPromise; const transaction = db.transaction(["threads", "threadSummaries"], "readwrite"); await transaction.objectStore("threads").put({ schemaVersion: 1, thread }, thread.id); await transaction.objectStore("threadSummaries").put(summary(thread), thread.id); await transaction.done; }
  async remove(threadId: string): Promise<void> { const db = await this.dbPromise; const transaction = db.transaction(["threads", "threadSummaries", "artifactDrafts"], "readwrite"); await transaction.objectStore("threads").delete(threadId); await transaction.objectStore("threadSummaries").delete(threadId); const drafts = transaction.objectStore("artifactDrafts"); for (const draft of await drafts.index("by-thread-id").getAll(threadId)) await drafts.delete(draft.id); await transaction.done; }
  async exportData(threadIds?: string[]): Promise<ThreadBackup> { const ids = threadIds ? new Set(threadIds) : null; const db = await this.dbPromise; const records = await db.getAll("threads"); return { backupVersion: 1, exportedAt: new Date().toISOString(), threads: records.filter(({ thread }) => !ids || ids.has(thread.id)).map(({ thread }) => ({ schemaVersion: 1, thread })) }; }
  async inspectImport(backup: ThreadBackup): Promise<ImportPreview> { const issues = validateBackup(backup); const db = await this.dbPromise; const existing = new Set(await db.getAllKeys("threads")); const valid = backup.threads.filter(({ thread }) => validThread(thread)); return { add: valid.filter(({ thread }) => !existing.has(thread.id)).length, conflicts: valid.filter(({ thread }) => existing.has(thread.id)).length, skippedInvalid: issues.length, issues }; }
  async importData(backup: ThreadBackup, options: { onConflict: "skip" | "replace" }): Promise<ImportReport> { const preview = await this.inspectImport(backup); const added: string[] = []; const replaced: string[] = []; const skipped: string[] = []; const db = await this.dbPromise; const tx = db.transaction(["threads", "threadSummaries"], "readwrite"); for (const item of backup.threads) { if (!validThread(item.thread)) continue; const exists = await tx.objectStore("threads").getKey(item.thread.id); if (exists && options.onConflict === "skip") { skipped.push(item.thread.id); continue; } await tx.objectStore("threads").put({ schemaVersion: 1, thread: item.thread }, item.thread.id); await tx.objectStore("threadSummaries").put(summary(item.thread), item.thread.id); (exists ? replaced : added).push(item.thread.id); } await tx.done; return { ...preview, added, replaced, skipped }; }
}
function validateBackup(backup: ThreadBackup): Array<{ code: "invalid_backup"; message: string }> { if (!backup || backup.backupVersion !== 1 || !Array.isArray(backup.threads)) return [{ code: "invalid_backup", message: "unsupported or malformed backup" }]; return backup.threads.flatMap(({ thread }) => validThread(thread) ? [] : [{ code: "invalid_backup", message: "thread record failed validation" }]); }
export class LocalArtifactDraftStore implements ArtifactDraftStore {
  constructor(private readonly dbPromise = openDorothyAnnDb()) {}
  async loadBySourceKey(sourceKey: string): Promise<ArtifactDraft | null> { return (await (await this.dbPromise).getFromIndex("artifactDrafts", "by-source-key", sourceKey)) ?? null; }
  async save(draft: ArtifactDraft): Promise<void> { if (!draft.sourceKey || !draft.markdown) throw new Error("invalid_draft"); await (await this.dbPromise).put("artifactDrafts", draft); }
  async remove(draftId: string): Promise<void> { await (await this.dbPromise).delete("artifactDrafts", draftId); }
}
