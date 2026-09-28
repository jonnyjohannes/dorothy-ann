// @vitest-environment node
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { IdentityPolicy } from "../src/application/identity-policy";
import type { CanonicalSource, SearchTurn, ThreadId } from "../src/domain/types";
import { IndexedDbThreadStore, openDorothyAnnV3Db } from "../src/infrastructure/browser/indexeddb-thread-store";
import { BrowserRemoteThreadStore } from "../src/infrastructure/browser/remote-thread-store";
import { WebCryptoIdentityHasher } from "../src/infrastructure/identity/web-crypto-hasher";
import { REDIS_MIGRATE_RECORD, REDIS_WRITE_RECORD, REDIS_WRITE_TOMBSTONE, RedisThreadStore, type V3Redis } from "../src/infrastructure/storage/redis-thread-store";
import { createThreadStorageRoutes } from "../src/server/thread-storage-routes";
import { createThreadListTimingSink } from "../server/runtime/thread-list-timing";
import { createLogger, type LogRecord } from "../server/runtime/logger";
import type { ThreadRevision, ThreadStore } from "../src/ports/storage-v3";

const identity = () => new IdentityPolicy(new WebCryptoIdentityHasher(webcrypto.subtle as unknown as SubtleCrypto));
const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const at = (day: number) => `2026-02-${String(day).padStart(2, "0")}T00:00:00.000Z`;
let serial = 0;
const revisions = () => `revision-test-${++serial}` as ThreadRevision;

class FakeRedis implements V3Redis {
  values = new Map<string, unknown>();
  scores = new Map<string, Map<string, number>>();
  async get<T>(key: string) { return (this.values.get(key) as T | undefined) ?? null; }
  async zrange<T extends unknown[]>(key: string) { return [...(this.scores.get(key)?.keys() ?? [])] as T; }
  async zrem(key: string, ...members: string[]) { let count = 0; for (const member of members) if (this.scores.get(key)?.delete(member)) count += 1; return count; }
  async del(...keys: string[]) { let count = 0; for (const key of keys) if (this.values.delete(key)) count += 1; return count; }
  async eval<T>(script: string, keys: string[], args: string[]) {
    if (script === "return 1") return 1 as T;
    if (script === REDIS_WRITE_RECORD) {
      const current = this.values.get(keys[0]) as { revision?: string } | undefined;
      const tombstone = this.values.get(keys[1]);
      if ((current?.revision ?? "") !== args[0] || (tombstone && args[3] !== "1")) return 0 as T;
      this.values.set(keys[0], JSON.parse(args[1]));
      if (args[3] === "1") this.values.delete(keys[1]);
      const index = this.scores.get(keys[2]) ?? new Map(); index.set(args[5], Number(args[4])); this.scores.set(keys[2], index);
      return 1 as T;
    }
    if (script === REDIS_MIGRATE_RECORD) {
      const legacy = this.values.get(keys[2]) as { revision?: number } | undefined;
      if (this.values.has(keys[0]) || this.values.has(keys[1]) || String(legacy?.revision ?? "") !== args[0]) return 0 as T;
      this.values.set(keys[0], JSON.parse(args[1])); this.values.delete(keys[2]); this.scores.get(keys[3])?.delete(args[4]);
      const index = this.scores.get(keys[4]) ?? new Map(); index.set(args[4], Number(args[3])); this.scores.set(keys[4], index);
      return 1 as T;
    }
    if (script === REDIS_WRITE_TOMBSTONE) {
      const current = this.values.get(keys[0]) as { revision?: string } | undefined;
      if (current?.revision !== args[0]) return 0 as T;
      this.values.delete(keys[0]); this.values.set(keys[1], JSON.parse(args[1]));
      const index = this.scores.get(keys[2]) ?? new Map(); index.set(args[4], Number(args[3])); this.scores.set(keys[2], index);
      return 1 as T;
    }
    throw new Error("unknown_script");
  }
}

async function canonical(identities: IdentityPolicy): Promise<CanonicalSource> {
  const canonicalUrl = "https://example.com/evidence";
  return { sourceId: await identities.sourceId(canonicalUrl), title: "Evidence", url: canonicalUrl, canonicalUrl, displayUrl: "example.com" };
}
function turn(value: number, source?: CanonicalSource, day = 1): SearchTurn {
  return { id: uuid(value) as never, kind: "search", status: "completed", createdAt: at(day) as never, finishedAt: at(day + 1) as never, userMessage: { id: uuid(value + 100) as never, role: "user", content: "find it", createdAt: at(day) as never }, execution: { kind: "recorded", searchRef: "fixture/search" }, result: source ? { completion: "results", destinations: [{ sourceId: source.sourceId, rank: 1 }] } : { completion: "empty", destinations: [] } };
}
function legacyRecord(threadId: ThreadId) {
  return { schemaVersion: 2, revision: 4, lastMeaningfulActivityAt: at(2), expiresAt: at(9), thread: { schemaVersion: 2, id: threadId, title: "Legacy", createdAt: at(1), updatedAt: at(2), modelRef: "legacy/model", searchRef: "legacy/search", turns: [{ id: uuid(20), mode: "chat", status: "completed", createdAt: at(1), updatedAt: at(2), userMessage: { id: uuid(120), role: "user", content: "hello", createdAt: at(1) }, assistantMessage: { id: uuid(220), role: "assistant", createdAt: at(2), content: { parts: [{ type: "text", markdown: "legacy answer" }] } } }] } };
}

interface AdapterFixture { store: ThreadStore; identities: IdentityPolicy }
const factories: Array<[string, () => Promise<AdapterFixture>]> = [
  ["IndexedDB", async () => { const identities = identity(); const db = openDorothyAnnV3Db(`dorothy-test-${crypto.randomUUID()}`); return { identities, store: new IndexedDbThreadStore(db, () => new Date(at(3)), identities, revisions) }; }],
  ["Redis", async () => { const identities = identity(); return { identities, store: new RedisThreadStore(new FakeRedis(), identities, `test-${crypto.randomUUID()}`, () => new Date(at(3)), revisions) }; }],
  ["browser remote", async () => {
    const identities = identity();
    const backing = new RedisThreadStore(new FakeRedis(), identities, `remote-${crypto.randomUUID()}`, () => new Date(at(3)), revisions);
    const app = new Hono().route("/api/storage/threads", createThreadStorageRoutes(backing));
    const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => { const value = typeof input === "string" ? input : input.toString(); return app.request(value.startsWith("/") ? `http://localhost${value}` : value, init); }) as typeof fetch;
    return { identities, store: new BrowserRemoteThreadStore(fetcher) };
  }],
];

for (const [name, factory] of factories) describe(`${name} v3 storage adapter`, () => {
  it("passes create/load/list/idempotency/delete and tombstone races", async () => {
    const { store, identities } = await factory();
    const threadId = uuid(900) as ThreadId;
    const source = await canonical(identities);
    const first = turn(1, source);
    const input = { threadId, expectedRevision: null, create: { id: threadId, title: "Topic", createdAt: at(1) as never }, sourceRecords: [source], turn: first };
    const committed = await store.commitTerminalTurn(input);
    expect(committed.ok && committed.value.disposition).toBe("committed");
    expect((await store.load(threadId)).ok).toBe(true);
    const listed = await store.list();
    expect(listed.ok && listed.value[0].summary).toMatchObject({ id: threadId, turnCount: 1 });
    expect(await store.commitTerminalTurn(input)).toMatchObject({ ok: true, value: { disposition: "already_committed" } });
    const revision = committed.ok ? committed.value.record.revision : null;
    expect(await store.remove({ threadId, expectedRevision: revision ?? undefined })).toEqual({ ok: true, value: "removed" });
    expect(await store.commitTerminalTurn({ ...input, create: undefined, expectedRevision: revision })).toEqual({ ok: false, failure: { code: "thread_deleted", retryable: false } });
    expect(await store.remove({ threadId })).toEqual({ ok: true, value: "already_absent" });
  });

  it("round-trips news turn provenance without changing article source identity", async () => {
    const { store, identities } = await factory();
    const threadId = uuid(950) as ThreadId;
    const source = await canonical(identities);
    const news: SearchTurn = { ...turn(1, source), result: { completion: "results", resultKind: "news", destinations: [{ sourceId: source.sourceId, rank: 1 }] } };
    const committed = await store.commitTerminalTurn({ threadId, expectedRevision: null, create: { id: threadId, title: "News", createdAt: at(1) as never }, sourceRecords: [source], turn: news });
    expect(committed.ok).toBe(true);
    const loaded = await store.load(threadId);
    expect(loaded.ok && loaded.value?.thread.turns[0]).toMatchObject({ result: { resultKind: "news" } });
    expect(loaded.ok && loaded.value?.thread.sources[0]).toMatchObject({ kind: "link", sourceId: source.sourceId });
    const backup = await store.exportData();
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;
    const destination = await factory();
    const inspected = await destination.store.inspectImport(backup.value);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(await destination.store.importData(inspected.value.candidate, { onConflict: "keep_existing" })).toMatchObject({ ok: true });
    const restored = await destination.store.load(threadId);
    expect(restored.ok && restored.value?.thread.turns[0]).toMatchObject({ result: { resultKind: "news" } });
    expect(restored.ok && restored.value?.thread.sources).toHaveLength(1);
  });

  it.each(["web-first", "news-first"])("keeps one canonical card across %s article searches", async (order) => {
    const { store, identities } = await factory();
    const threadId = uuid(order === "web-first" ? 960 : 961) as ThreadId;
    const source = await canonical(identities);
    const first: SearchTurn = { ...turn(1, source), result: { completion: "results", resultKind: order === "web-first" ? "link" : "news", destinations: [{ sourceId: source.sourceId, rank: 1 }] } };
    const second: SearchTurn = { ...turn(2, source, 3), result: { completion: "results", resultKind: order === "web-first" ? "news" : "link", destinations: [{ sourceId: source.sourceId, rank: 1 }] } };
    const created = await store.commitTerminalTurn({ threadId, expectedRevision: null, create: { id: threadId, title: "Same article", createdAt: at(1) as never }, sourceRecords: [source], turn: first });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const committed = await store.commitTerminalTurn({ threadId, expectedRevision: created.value.record.revision, sourceRecords: [], turn: second });
    expect(committed.ok).toBe(true);
    const loaded = await store.load(threadId);
    expect(loaded.ok && loaded.value?.thread.sources).toHaveLength(1);
    expect(loaded.ok && loaded.value?.thread.turns.map((item) => item.kind === "search" && item.status === "completed" ? item.result.resultKind : "other")).toEqual(order === "web-first" ? ["link", "news"] : ["news", "link"]);
  });

  it("passes CAS, deterministic insertion, and source-integrity checks", async () => {
    const { store, identities } = await factory();
    const threadId = uuid(920) as ThreadId;
    const source = await canonical(identities);
    const created = await store.commitTerminalTurn({ threadId, expectedRevision: null, create: { id: threadId, title: "Ordering", createdAt: at(1) as never }, sourceRecords: [source], turn: turn(1, source) });
    if (!created.ok) return;
    expect(await store.commitTerminalTurn({ threadId, expectedRevision: "stale" as ThreadRevision, sourceRecords: [], turn: turn(2, undefined, 5) })).toEqual({ ok: false, failure: { code: "revision_conflict", retryable: true } });
    const later = await store.commitTerminalTurn({ threadId, expectedRevision: created.value.record.revision, sourceRecords: [], turn: turn(2, undefined, 5) });
    if (!later.ok) return;
    const earlier = await store.commitTerminalTurn({ threadId, expectedRevision: later.value.record.revision, sourceRecords: [], turn: turn(3, undefined, 3) });
    expect(earlier.ok && earlier.value.record.thread.turns.map((item) => item.id)).toEqual([uuid(1), uuid(3), uuid(2)]);
    const collision = { ...source, url: "https://example.com/other", canonicalUrl: "https://example.com/other" };
    const revision = earlier.ok ? earlier.value.record.revision : later.value.record.revision;
    expect(await store.commitTerminalTurn({ threadId, expectedRevision: revision, sourceRecords: [collision], turn: turn(4, collision, 7) })).toEqual({ ok: false, failure: { code: "integrity_failure", retryable: false } });
  });
});

describe("Redis thread list timings", () => {
  it("reports one count-only summary and fixed per-phase metrics without changing list results", async () => {
    const logs: LogRecord[] = [];
    const emit = vi.fn((name: string) => { if (name === "threads.list.ids.wall_elapsed_ms") throw new Error("metric unavailable"); });
    const redis = new FakeRedis();
    const identities = identity();
    const store = new RedisThreadStore(redis, identities, "test", () => new Date(at(3)), revisions, "legacy", createThreadListTimingSink(createLogger({ level: "info", sink: (record) => { logs.push(record); } }), emit));
    for (const n of [1, 2]) {
      const id = uuid(n + 700) as ThreadId;
      const committed = await store.commitTerminalTurn({ threadId: id, expectedRevision: null, create: { id, title: "SENTINEL_PRIVATE_TITLE", createdAt: at(1) as never }, sourceRecords: [], turn: turn(n) });
      expect(committed.ok).toBe(true);
    }
    const listed = await store.list();
    expect(listed.ok && listed.value).toHaveLength(2);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: "thread_list_timing", outcome: "ok", ids_count: 2, scanned_count: 2, returned_count: 2 });
    expect(emit.mock.calls.map(([name]) => name)).toEqual([
      "threads.list.total.wall_elapsed_ms", "threads.list.ids.wall_elapsed_ms", "threads.list.records.wall_elapsed_ms", "threads.list.sort.wall_elapsed_ms",
    ]);
    expect(emit.mock.calls.every((call) => call.length === 2 && Number.isInteger(call[1]) && call[1] >= 0)).toBe(true);
    expect(JSON.stringify([logs, emit.mock.calls])).not.toMatch(/SENTINEL_PRIVATE_TITLE|10000000-0000-4000-8000-|SENTINEL_PROVIDER_PAYLOAD/u);
  });

  it("reports an index failure without inventing unentered record or sort timings", async () => {
    const redis = new FakeRedis();
    redis.zrange = async () => { throw new Error("SENTINEL_PROVIDER_PAYLOAD"); };
    const logs: LogRecord[] = [];
    const emit = vi.fn();
    const store = new RedisThreadStore(redis, identity(), "test", () => new Date(at(3)), revisions, "legacy", createThreadListTimingSink(createLogger({ level: "info", sink: (record) => { logs.push(record); } }), emit));
    expect(await store.list()).toEqual({ ok: false, failure: { code: "storage_unavailable", retryable: true } });
    expect(logs[0]).toMatchObject({ event: "thread_list_timing", outcome: "failed", ids_count: 0, scanned_count: 0, returned_count: 0 });
    expect(logs[0]).not.toHaveProperty("records_ms");
    expect(logs[0]).not.toHaveProperty("sort_ms");
    expect(emit.mock.calls.map(([name]) => name)).toEqual(["threads.list.total.wall_elapsed_ms", "threads.list.ids.wall_elapsed_ms"]);
    expect(JSON.stringify(logs)).not.toContain("SENTINEL_PROVIDER_PAYLOAD");
  });

  it("measures a failed record read without pretending sorting happened", async () => {
    const redis = new FakeRedis();
    redis.scores.set("test:threads:index", new Map([[uuid(800), 1]]));
    redis.get = async () => { throw new Error("SENTINEL_PROVIDER_PAYLOAD"); };
    const logs: LogRecord[] = [];
    const emit = vi.fn();
    const store = new RedisThreadStore(redis, identity(), "test", () => new Date(at(3)), revisions, "legacy", createThreadListTimingSink(createLogger({ level: "info", sink: (record) => { logs.push(record); } }), emit));
    expect(await store.list()).toMatchObject({ ok: false, failure: { code: "storage_unavailable" } });
    expect(logs[0]).toMatchObject({ outcome: "failed", ids_count: 1, scanned_count: 1, returned_count: 0, max_record_ms: expect.any(Number) });
    expect(logs[0]).not.toHaveProperty("sort_ms");
    expect(emit.mock.calls.map(([name]) => name)).toEqual([
      "threads.list.total.wall_elapsed_ms", "threads.list.ids.wall_elapsed_ms", "threads.list.records.wall_elapsed_ms",
    ]);
    expect(JSON.stringify(logs)).not.toContain("SENTINEL_PROVIDER_PAYLOAD");
  });

  it("does not let an observer failure alter storage results", async () => {
    const store = new RedisThreadStore(new FakeRedis(), identity(), "test", () => new Date(at(3)), revisions, "legacy", () => { throw new Error("observer failure"); });
    expect(await store.list()).toEqual({ ok: true, value: [] });
  });
});

describe("v3 adapter retention", () => {
  it("lazily purges records after seven days without extending on reads", async () => {
    let now = new Date(at(3));
    const identities = identity();
    const store = new RedisThreadStore(new FakeRedis(), identities, `retention-${crypto.randomUUID()}`, () => now, revisions);
    const threadId = uuid(909) as ThreadId;
    expect((await store.commitTerminalTurn({ threadId, expectedRevision: null, create: { id: threadId, title: "Expire", createdAt: at(1) as never }, sourceRecords: [], turn: turn(9) })).ok).toBe(true);
    expect((await store.load(threadId)).ok).toBe(true);
    now = new Date(at(10));
    expect(await store.load(threadId)).toEqual({ ok: true, value: null });
    expect(await store.list()).toEqual({ ok: true, value: [] });
  });
});

describe("lazy stored-record migration", () => {
  it("replaces a valid IndexedDB v2 record without exposing partial state", async () => {
    const identities = identity();
    const db = await openDorothyAnnV3Db(`legacy-idb-${crypto.randomUUID()}`);
    const threadId = uuid(910) as ThreadId;
    await db.put("threads", legacyRecord(threadId), threadId);
    const store = new IndexedDbThreadStore(Promise.resolve(db), () => new Date(at(3)), identities, revisions);
    const loaded = await store.load(threadId);
    expect(loaded.ok && loaded.value?.thread.legacyArchive).toHaveLength(1);
    expect(await db.get("threads", threadId)).toBeUndefined();
  });

  it("leaves invalid IndexedDB legacy bytes untouched and invisible", async () => {
    const identities = identity();
    const db = await openDorothyAnnV3Db(`invalid-legacy-idb-${crypto.randomUUID()}`);
    const threadId = uuid(912) as ThreadId;
    const invalid = { schemaVersion: 2, thread: { broken: true } };
    await db.put("threads", invalid, threadId);
    const store = new IndexedDbThreadStore(Promise.resolve(db), () => new Date(at(3)), identities, revisions);
    expect(await store.load(threadId)).toEqual({ ok: true, value: null });
    expect(await db.get("threads", threadId)).toEqual(invalid);
  });

  it("replaces a valid Redis v2 record while preserving expiry", async () => {
    const identities = identity();
    const redis = new FakeRedis();
    const threadId = uuid(911) as ThreadId;
    redis.values.set(`legacy:thread:${threadId}`, legacyRecord(threadId));
    redis.scores.set("legacy:threads:index", new Map([[threadId, 1]]));
    const store = new RedisThreadStore(redis, identities, "v3", () => new Date(at(3)), revisions, "legacy");
    const loaded = await store.load(threadId);
    expect(loaded.ok && loaded.value).toMatchObject({ expiresAt: at(9), thread: { legacyArchive: [{ answerMarkdown: "legacy answer" }] } });
    expect(redis.values.has(`legacy:thread:${threadId}`)).toBe(false);
  });
});

for (const [name, factory] of factories) describe(`${name} v3 transfer`, () => {
  it("rejects structurally unsupported input and consumes preview candidates once", async () => {
    const { store } = await factory();
    expect(await store.inspectImport({ backupVersion: 99, exportedAt: at(1), threads: [] })).toEqual({ ok: false, failure: { code: "invalid_record", retryable: false } });
    const inspected = await store.inspectImport({ backupVersion: 3, exportedAt: at(1), threads: [] });
    if (!inspected.ok) return;
    expect((await store.importData(inspected.value.candidate, { onConflict: "keep_existing" })).ok).toBe(true);
    expect(await store.importData(inspected.value.candidate, { onConflict: "keep_existing" })).toEqual({ ok: false, failure: { code: "invalid_record", retryable: false } });
  });

  it("round-trips archive-only v3 backups with fresh revisions", async () => {
    const { store, identities } = await factory();
    const threadId = uuid(901) as ThreadId;
    const archiveId = await identities.legacyArchiveEntryId({ threadId, originalIndex: 0 });
    const backup = { backupVersion: 3, exportedAt: at(1), threads: [{ expiresAt: at(8), thread: { schemaVersion: 3, id: threadId, title: "Archive", createdAt: at(1), updatedAt: at(1), sources: [], turns: [], legacyArchive: [{ id: archiveId, originalIndex: 0, legacyKind: "chat", legacyStatus: "completed", createdAt: at(1), finishedAt: at(1), request: "old question", answerMarkdown: "old answer", destinations: [] }] } }] };
    const inspected = await store.inspectImport(backup);
    expect(inspected.ok && inspected.value.preview).toMatchObject({ add: 1, archivedLegacyEntries: 1, skippedInvalid: 0 });
    if (!inspected.ok) return;
    const imported = await store.importData(inspected.value.candidate, { onConflict: "keep_existing" });
    expect(imported.ok && imported.value.added).toEqual([threadId]);
    const exported = await store.exportData();
    expect(exported.ok && exported.value.threads[0].thread.legacyArchive[0].answerMarkdown).toBe("old answer");
    expect(exported.ok && "revision" in exported.value.threads[0]).toBe(false);
  });

  it("keeps deletion tombstones by default and clears them only on explicit replacement", async () => {
    const { store, identities } = await factory();
    const threadId = uuid(903) as ThreadId;
    const archiveId = await identities.legacyArchiveEntryId({ threadId, originalIndex: 0 });
    const backup = { backupVersion: 3, exportedAt: at(1), threads: [{ expiresAt: at(8), thread: { schemaVersion: 3, id: threadId, title: "Restore", createdAt: at(1), updatedAt: at(1), sources: [], turns: [], legacyArchive: [{ id: archiveId, originalIndex: 0, legacyKind: "chat", legacyStatus: "completed", createdAt: at(1), finishedAt: at(1), request: "restore", answerMarkdown: "restored", destinations: [] }] } }] };
    const initial = await store.inspectImport(backup);
    if (!initial.ok) return;
    await store.importData(initial.value.candidate, { onConflict: "keep_existing" });
    const loaded = await store.load(threadId);
    if (!loaded.ok || !loaded.value) return;
    await store.remove({ threadId, expectedRevision: loaded.value.revision });
    const keep = await store.inspectImport(backup);
    if (!keep.ok) return;
    expect((await store.importData(keep.value.candidate, { onConflict: "keep_existing" })).ok).toBe(true);
    const stillDeleted = await store.load(threadId);
    expect(stillDeleted.ok && stillDeleted.value).toBeNull();
    const replace = await store.inspectImport(backup);
    if (!replace.ok) return;
    expect((await store.importData(replace.value.candidate, { onConflict: "replace_existing" })).ok).toBe(true);
    const restored = await store.load(threadId);
    expect(restored.ok && restored.value?.thread.title).toBe("Restore");
  });

  it("migrates unsupported legacy chat into the read-only archive", async () => {
    const { store } = await factory();
    const threadId = uuid(902) as ThreadId;
    const backup = { backupVersion: 1, exportedAt: at(1), threads: [{ schemaVersion: 1, thread: { schemaVersion: 1, id: threadId, title: "Legacy", createdAt: at(1), updatedAt: at(2), modelRef: "legacy/model", searchRef: "legacy/search", turns: [{ id: uuid(10), mode: "chat", status: "completed", createdAt: at(1), updatedAt: at(2), userMessage: { id: uuid(110), role: "user", content: "hello", createdAt: at(1) }, assistantMessage: { id: uuid(210), role: "assistant", createdAt: at(2), content: { parts: [{ type: "text", markdown: "legacy answer" }] } } }] } }] };
    const inspected = await store.inspectImport(backup);
    expect(inspected.ok && inspected.value.preview).toMatchObject({ archivedLegacyEntries: 1, droppedLegacyEntries: 0 });
    if (!inspected.ok) return;
    expect((await store.importData(inspected.value.candidate, { onConflict: "replace_existing" })).ok).toBe(true);
    const loaded = await store.load(threadId);
    expect(loaded.ok && loaded.value?.thread).toMatchObject({ turns: [], legacyArchive: [{ answerMarkdown: "legacy answer" }] });
  });
});
