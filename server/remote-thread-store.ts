import { Redis } from "@upstash/redis";
import { expiryFor, isDurableThread, isExpired, isValidEnvelope } from "../src/domain/thread-state.js";
import type { IsoTimestamp, StoredThreadEnvelopeV2, Thread, ThreadCommit, ThreadSummary } from "../src/domain/types.js";
import type { ImportPreview, ImportReport, ThreadBackup, ThreadStore } from "../src/ports/storage.js";
import { threadBackupSchema } from "../src/domain/schemas.js";

export interface RemoteThreadRecord extends StoredThreadEnvelopeV2 {
  revision: number;
}

export interface RemoteRedis {
  get<T>(key: string): Promise<T | null>;
  zrange<T extends unknown[]>(key: string, min: number, max: number, options?: { rev?: boolean }): Promise<T>;
  zrem(key: string, ...members: string[]): Promise<number>;
  del(...keys: string[]): Promise<number>;
  eval<T>(script: string, keys: string[], args: string[]): Promise<T>;
}

const COMMIT_SCRIPT = `
local current = redis.call("GET", KEYS[1])
local expected = tonumber(ARGV[1])
if current then
  local decoded = cjson.decode(current)
  if expected == 0 or tonumber(decoded.revision) ~= expected then
    return { 0, tonumber(decoded.revision) or 0 }
  end
elseif expected ~= 0 then
  return { 0, 0 }
end
local record = cjson.decode(ARGV[2])
local revision = expected + 1
record.revision = revision
redis.call("SET", KEYS[1], cjson.encode(record), "PXAT", ARGV[3])
redis.call("ZADD", KEYS[2], ARGV[4], ARGV[5])
return { 1, revision, cjson.encode(record) }
`;

function summary(thread: Thread): ThreadSummary {
  const last = thread.turns[thread.turns.length - 1];
  return { id: thread.id, title: thread.title, createdAt: thread.createdAt, updatedAt: thread.updatedAt, lastTurnPreview: last?.userMessage.content.slice(0, 120) };
}

function parseRecord(value: unknown): RemoteThreadRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<RemoteThreadRecord>;
  const revision = record.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1 || !isValidEnvelope(record)) return null;
  return record as RemoteThreadRecord;
}

export class RemoteThreadStore implements ThreadStore {
  private readonly prefix: string;
  constructor(private readonly redis: RemoteRedis, prefix = "dorothy-ann:v1:owner", private readonly clock: () => Date = () => new Date()) { this.prefix = prefix; }

  static fromUpstash(url: string, token: string, prefix?: string): RemoteThreadStore {
    return new RemoteThreadStore(new Redis({ url, token }) as unknown as RemoteRedis, prefix);
  }

  private recordKey(threadId: string): string { return `${this.prefix}:thread:${threadId}`; }
  private indexKey(): string { return `${this.prefix}:threads:index`; }
  private validateId(threadId: string): void { if (!/^[A-Za-z0-9_-]{1,128}$/.test(threadId)) throw new Error("invalid_thread_id"); }
  private async read(threadId: string): Promise<RemoteThreadRecord | null> {
    this.validateId(threadId);
    const record = parseRecord(await this.redis.get<unknown>(this.recordKey(threadId)));
    if (!record) return null;
    if (isExpired(record, this.clock())) { await this.deleteRecord(threadId); return null; }
    return record;
  }
  private async deleteRecord(threadId: string): Promise<void> { await this.redis.del(this.recordKey(threadId)); await this.redis.zrem(this.indexKey(), threadId); }

  async health(): Promise<boolean> { try { return (await this.redis.eval<number>("return 1", [], [])) === 1; } catch { return false; } }

  async list(): Promise<ThreadSummary[]> {
    const ids = await this.redis.zrange<string[]>(this.indexKey(), 0, -1, { rev: true });
    const summaries: ThreadSummary[] = [];
    for (const id of ids) {
      try {
        const record = await this.read(id);
        if (record) summaries.push(summary(record.thread));
        else await this.redis.zrem(this.indexKey(), id);
      } catch { await this.redis.zrem(this.indexKey(), id); }
    }
    return summaries;
  }

  async load(threadId: string): Promise<Thread | null> { return (await this.read(threadId))?.thread ?? null; }
  async loadRecord(threadId: string): Promise<RemoteThreadRecord | null> { return this.read(threadId); }

  async save(thread: Thread, activityAt = this.clock().toISOString()): Promise<void> {
    const previous = await this.read(thread.id);
    await this.commit({ thread, reason: "created", committedAt: activityAt as IsoTimestamp, expectedRevision: previous?.revision });
  }

  async commit(input: ThreadCommit & { expectedRevision?: number; activityAt?: IsoTimestamp; expiresAt?: IsoTimestamp }): Promise<Thread> {
    if (!isDurableThread(input.thread)) throw new Error("invalid_completed_thread");
    this.validateId(input.thread.id);
    const expected = input.expectedRevision ?? 0;
    const activityAt = input.activityAt ?? input.committedAt;
    const expiry = input.expiresAt ?? expiryFor(activityAt);
    const record: RemoteThreadRecord = { schemaVersion: 2, thread: { ...input.thread, schemaVersion: 2 }, lastMeaningfulActivityAt: activityAt, expiresAt: expiry, revision: expected + 1 };
    const result = await this.redis.eval<[number, number, string?]>(COMMIT_SCRIPT, [this.recordKey(input.thread.id), this.indexKey()], [String(expected), JSON.stringify(record), String(new Date(expiry).getTime()), String(new Date(input.thread.updatedAt).getTime()), input.thread.id]);
    if (!Array.isArray(result) || result[0] !== 1) throw new Error("storage_conflict");
    const rawRecord = result[2];
    const committed = parseRecord(typeof rawRecord === "string" ? JSON.parse(rawRecord) : rawRecord);
    if (!committed) throw new Error("invalid_remote_thread");
    return committed.thread;
  }

  async remove(threadId: string): Promise<void> { this.validateId(threadId); await this.deleteRecord(threadId); }
  async exportData(threadIds?: string[]): Promise<ThreadBackup> {
    const ids = threadIds ? new Set(threadIds) : null;
    const records = await Promise.all((await this.redis.zrange<string[]>(this.indexKey(), 0, -1)).map((id) => this.read(id)));
    return { backupVersion: 2, exportedAt: this.clock().toISOString(), threads: records.flatMap((record) => record && (!ids || ids.has(record.thread.id)) ? [{ schemaVersion: 2 as const, thread: record.thread, lastMeaningfulActivityAt: record.lastMeaningfulActivityAt, expiresAt: record.expiresAt }] : []) };
  }
  async inspectImport(backup: ThreadBackup): Promise<ImportPreview> { const issues = backupIssues(backup); const existing = new Set((await this.list()).map((item) => item.id)); const valid = validBackupThreads(backup); return { add: valid.filter((item) => !existing.has(item.thread.id)).length, conflicts: valid.filter((item) => existing.has(item.thread.id)).length, skippedInvalid: issues.length, issues }; }
  async importData(backup: ThreadBackup, options: { onConflict: "skip" | "replace" }): Promise<ImportReport> {
    const preview = await this.inspectImport(backup); const added: string[] = []; const replaced: string[] = []; const skipped: string[] = [];
    for (const item of validBackupThreads(backup)) { const existing = await this.read(item.thread.id); if (existing && options.onConflict === "skip") { skipped.push(item.thread.id); continue; } const activityAt = (item.lastMeaningfulActivityAt ?? this.clock().toISOString()) as IsoTimestamp; const expiresAt = item.expiresAt as IsoTimestamp | undefined; if (expiresAt && new Date(expiresAt).getTime() <= this.clock().getTime()) { skipped.push(item.thread.id); continue; } const value = await this.commit({ thread: item.thread, reason: "created", committedAt: activityAt, activityAt, expiresAt, expectedRevision: existing?.revision }); (existing ? replaced : added).push(value.id); }
    return { ...preview, added, replaced, skipped };
  }
}

function validBackupThreads(backup: ThreadBackup): Array<{ thread: Thread; lastMeaningfulActivityAt?: string; expiresAt?: string }> { if (!backup || !Array.isArray(backup.threads)) return []; return backup.threads.flatMap((item) => { const thread = item?.thread; return isDurableThread(thread) ? [{ thread: { ...thread, schemaVersion: 2 }, lastMeaningfulActivityAt: item.lastMeaningfulActivityAt, expiresAt: item.expiresAt }] : []; }); }
function backupIssues(backup: ThreadBackup) { const parsed = threadBackupSchema.safeParse(backup); if (!parsed.success) return [{ code: "invalid_backup" as const, message: "unsupported or malformed backup" }]; return parsed.data.threads.flatMap((item) => isDurableThread(item.thread) ? [] : [{ code: "invalid_thread" as const, message: "thread record failed completed-thread validation" }]); }
