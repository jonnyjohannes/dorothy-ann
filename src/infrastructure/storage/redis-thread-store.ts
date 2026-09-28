import { Redis, errors } from "@upstash/redis";
import type { ThreadId } from "../../domain/types.js";
import type { LegacyMigrationIdentities } from "../../domain/migrations.js";
import type { StoredThreadRecord, ThreadRevision } from "../../ports/storage-v3.js";
import { ThreadStoreBase, type PersistedThreadState, type ThreadTombstone, type ThreadListTimingSink } from "./thread-store-base.js";
import type { TerminalCommitIdentity } from "../../application/commit-terminal-turn.js";

export interface V3Redis {
  get<T>(key: string): Promise<T | null>;
  mget<T extends unknown[]>(...keys: string[]): Promise<T>;
  zrange<T extends unknown[]>(key: string, min: number, max: number): Promise<T>;
  zrem(key: string, ...members: string[]): Promise<number>;
  del(...keys: string[]): Promise<number>;
  eval<T>(script: string, keys: string[], args: string[]): Promise<T>;
}

export const REDIS_WRITE_RECORD = `-- dorothy-ann:v3:write-record
local current = redis.call("GET", KEYS[1])
local tombstone = redis.call("GET", KEYS[2])
local expected = ARGV[1]
if current then
  local decoded = cjson.decode(current)
  if tostring(decoded.revision) ~= expected then return 0 end
elseif expected ~= "" then return 0 end
if tombstone and ARGV[4] ~= "1" then return 0 end
redis.call("SET", KEYS[1], ARGV[2], "PXAT", ARGV[3])
if ARGV[4] == "1" then redis.call("DEL", KEYS[2]) end
redis.call("ZADD", KEYS[3], ARGV[5], ARGV[6])
return 1`;
export const REDIS_MIGRATE_RECORD = `-- dorothy-ann:v3:migrate-record
if redis.call("GET", KEYS[1]) or redis.call("GET", KEYS[2]) then return 0 end
local legacy = redis.call("GET", KEYS[3])
if not legacy then return 0 end
local decoded = cjson.decode(legacy)
if tostring(decoded.revision or "") ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[1], ARGV[2], "PXAT", ARGV[3])
redis.call("DEL", KEYS[3])
redis.call("ZREM", KEYS[4], ARGV[5])
redis.call("ZADD", KEYS[5], ARGV[4], ARGV[5])
return 1`;
export const REDIS_WRITE_TOMBSTONE = `-- dorothy-ann:v3:write-tombstone
local current = redis.call("GET", KEYS[1])
if not current then return 0 end
local decoded = cjson.decode(current)
if tostring(decoded.revision) ~= ARGV[1] then return 0 end
redis.call("DEL", KEYS[1])
redis.call("SET", KEYS[2], ARGV[2], "PXAT", ARGV[3])
redis.call("ZADD", KEYS[3], ARGV[4], ARGV[5])
return 1`;

const LIST_BATCH_SIZE = 8;
const isSizeError = (error: unknown) => error instanceof errors.UpstashError && error.message.startsWith("ERR max request size exceeded");

export class RedisThreadStore extends ThreadStoreBase {
  private readonly prefix: string;
  constructor(
    private readonly redis: V3Redis,
    identities: TerminalCommitIdentity & LegacyMigrationIdentities,
    prefix = "dorothy-ann:v3:owner",
    clock: () => Date = () => new Date(),
    revisions?: () => ThreadRevision,
    private readonly legacyPrefix = "dorothy-ann:v1:owner",
    onListTiming?: ThreadListTimingSink,
  ) { super(identities, clock, revisions, onListTiming); this.prefix = prefix; }

  static fromUpstash(url: string, token: string, identities: TerminalCommitIdentity & LegacyMigrationIdentities, prefix?: string, onListTiming?: ThreadListTimingSink) {
    return new RedisThreadStore(new Redis({ url, token }) as unknown as V3Redis, identities, prefix, undefined, undefined, undefined, onListTiming);
  }
  private recordKey(id: ThreadId) { return `${this.prefix}:thread:${id}`; }
  private tombstoneKey(id: ThreadId) { return `${this.prefix}:deleted:${id}`; }
  private indexKey() { return `${this.prefix}:threads:index`; }
  private legacyRecordKey(id: ThreadId) { return `${this.legacyPrefix}:thread:${id}`; }
  private legacyIndexKey() { return `${this.legacyPrefix}:threads:index`; }

  async health(): Promise<boolean> { try { return await this.redis.eval<number>("return 1", [], []) === 1; } catch { return false; } }

  protected async readState(threadId: ThreadId): Promise<PersistedThreadState> {
    let [record, tombstone] = await Promise.all([
      this.redis.get<StoredThreadRecord>(this.recordKey(threadId)),
      this.redis.get<ThreadTombstone>(this.tombstoneKey(threadId)),
    ]);
    if (!record && !tombstone && await this.migrateLegacy(threadId)) [record, tombstone] = await Promise.all([
      this.redis.get<StoredThreadRecord>(this.recordKey(threadId)),
      this.redis.get<ThreadTombstone>(this.tombstoneKey(threadId)),
    ]);
    return { record, tombstone };
  }
  protected async listIds(): Promise<ThreadId[]> {
    for (const id of await this.redis.zrange<ThreadId[]>(this.legacyIndexKey(), 0, -1)) await this.migrateLegacy(id);
    return await this.redis.zrange<ThreadId[]>(this.indexKey(), 0, -1);
  }
  private async readGroups(groups: string[][]): Promise<unknown[][]> {
    if (!groups.length) return [];
    const keys = groups.flat();
    try {
      const values = await this.redis.mget<unknown[]>(...keys);
      if (!Array.isArray(values) || values.length !== keys.length || values.some((value) => value === undefined)) throw new Error("invalid_mget_response");
      let offset = 0;
      return groups.map((group) => { const slice = values.slice(offset, offset + group.length); offset += group.length; return slice; });
    } catch (error) {
      if (!isSizeError(error)) throw error;
      if (groups.length === 1) return [await Promise.all(groups[0].map((key) => this.redis.get<unknown>(key)))];
      const middle = Math.floor(groups.length / 2);
      return [...await this.readGroups(groups.slice(0, middle)), ...await this.readGroups(groups.slice(middle))];
    }
  }
  protected async *listStates(ids: ThreadId[]): AsyncGenerator<{ id: ThreadId; state: PersistedThreadState; readMs: number; batched: boolean }> {
    for (let offset = 0; offset < ids.length; offset += LIST_BATCH_SIZE) {
      const chunk = ids.slice(offset, offset + LIST_BATCH_SIZE);
      const started = performance.now();
      const pairs = await this.readGroups(chunk.map((id) => [this.recordKey(id), this.tombstoneKey(id)]));
      const missing = chunk.flatMap((id, index) => pairs[index][0] === null && pairs[index][1] === null ? [id] : []);
      const legacy = await this.readGroups(missing.map((id) => [this.legacyRecordKey(id)]));
      const legacyById = new Map(missing.map((id, index) => [id, legacy[index][0]]));
      const fetchMs = performance.now() - started;
      for (const [index, id] of chunk.entries()) {
        const itemStarted = performance.now();
        let [record, tombstone] = pairs[index] as [StoredThreadRecord | null, ThreadTombstone | null];
        const raw = legacyById.get(id);
        if (raw && await this.migrateLegacy(id, raw)) {
          const [reread] = await this.readGroups([[this.recordKey(id), this.tombstoneKey(id)]]);
          [record, tombstone] = reread as [StoredThreadRecord | null, ThreadTombstone | null];
        }
        yield { id, state: { record, tombstone }, readMs: fetchMs + performance.now() - itemStarted, batched: true };
      }
    }
  }
  private async migrateLegacy(threadId: ThreadId, prefetched?: unknown): Promise<boolean> {
    const raw = prefetched === undefined ? await this.redis.get<unknown>(this.legacyRecordKey(threadId)) : prefetched;
    if (!raw) return false;
    const converted = await this.convertLegacyStoredRecord(raw);
    if (!converted) return false;
    const legacyRevision = raw && typeof raw === "object" && "revision" in raw ? String(raw.revision) : "";
    return await this.redis.eval<number>(REDIS_MIGRATE_RECORD, [this.recordKey(threadId), this.tombstoneKey(threadId), this.legacyRecordKey(threadId), this.legacyIndexKey(), this.indexKey()], [
      legacyRevision, JSON.stringify(converted), String(Date.parse(converted.expiresAt)), String(Date.parse(converted.thread.updatedAt)), threadId,
    ]) === 1;
  }
  protected async writeRecord(threadId: ThreadId, expectedRevision: ThreadRevision | null, record: StoredThreadRecord, clearTombstone: boolean): Promise<boolean> {
    const value = await this.redis.eval<number>(REDIS_WRITE_RECORD, [this.recordKey(threadId), this.tombstoneKey(threadId), this.indexKey()], [
      expectedRevision ?? "", JSON.stringify(record), String(Date.parse(record.expiresAt)), clearTombstone ? "1" : "0", String(Date.parse(record.thread.updatedAt)), threadId,
    ]);
    return value === 1;
  }
  protected async writeTombstone(threadId: ThreadId, expectedRevision: ThreadRevision, tombstone: ThreadTombstone): Promise<boolean> {
    const value = await this.redis.eval<number>(REDIS_WRITE_TOMBSTONE, [this.recordKey(threadId), this.tombstoneKey(threadId), this.indexKey()], [
      expectedRevision, JSON.stringify(tombstone), String(Date.parse(tombstone.expiresAt)), String(Date.parse(tombstone.deletedAt)), threadId,
    ]);
    return value === 1;
  }
  protected async purge(threadId: ThreadId): Promise<void> {
    await this.redis.del(this.recordKey(threadId), this.tombstoneKey(threadId));
    await this.redis.zrem(this.indexKey(), threadId);
  }
}
