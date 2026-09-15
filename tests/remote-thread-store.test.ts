import { describe, expect, it } from "vitest";
import { RemoteThreadStore, type RemoteRedis } from "../server/remote-thread-store.js";
import type { Thread } from "../src/domain/types.js";

class FakeRedis implements RemoteRedis {
  readonly values = new Map<string, unknown>();
  readonly scores = new Map<string, Map<string, number>>();
  async get<T>(key: string) { return (this.values.get(key) as T | undefined) ?? null; }
  async zrange<T extends unknown[]>(key: string, _min: number, _max: number, options?: { rev?: boolean }) { const entries = [...(this.scores.get(key)?.entries() ?? [])].sort((a, b) => options?.rev ? b[1] - a[1] : a[1] - b[1]); return entries.map(([member]) => member) as T; }
  async zrem(key: string, ...members: string[]) { const index = this.scores.get(key); let removed = 0; for (const member of members) if (index?.delete(member)) removed += 1; return removed; }
  async del(...keys: string[]) { let removed = 0; for (const key of keys) if (this.values.delete(key)) removed += 1; return removed; }
  async eval<T>(script: string, keys: string[], args: string[]) {
    if (script === "return 1") return 1 as T;
    const current = this.values.get(keys[0]) as { revision?: number } | undefined;
    const expected = Number(args[0]);
    if ((current && (expected === 0 || current.revision !== expected)) || (!current && expected !== 0)) return [0, current?.revision ?? 0] as T;
    const record = { ...JSON.parse(args[1]), revision: expected + 1 };
    this.values.set(keys[0], record);
    const index = this.scores.get(keys[1]) ?? new Map<string, number>();
    index.set(args[4], Number(args[3]));
    this.scores.set(keys[1], index);
    return [1, record.revision, record] as T;
  }
}

const completedThread = (id: string): Thread => ({
  schemaVersion: 2,
  id: id as Thread["id"],
  title: `Topic ${id}`,
  createdAt: "2026-01-01T00:00:00.000Z" as Thread["createdAt"],
  updatedAt: "2026-01-01T00:00:00.000Z" as Thread["updatedAt"],
  modelRef: "fixture/model",
  searchRef: "fixture/search",
  turns: [{
    id: "turn-1" as never,
    mode: "chat",
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z" as never,
    updatedAt: "2026-01-01T00:00:00.000Z" as never,
    userMessage: { id: "message-1" as never, role: "user", content: "hello", createdAt: "2026-01-01T00:00:00.000Z" as never },
  }],
});

describe("RemoteThreadStore", () => {
  it("reports Redis script availability", async () => {
    expect(await new RemoteThreadStore(new FakeRedis()).health()).toBe(true);
  });

  it("commits, lists, loads, and rejects stale revisions", async () => {
    const redis = new FakeRedis();
    const store = new RemoteThreadStore(redis, "test", () => new Date("2026-01-02T00:00:00.000Z"));
    const thread = completedThread("one");
    await store.commit({ thread, reason: "turn_completed", committedAt: thread.updatedAt });
    expect(await store.load("one")).toMatchObject({ id: "one" });
    expect((await store.list())[0]).toMatchObject({ id: "one", title: "Topic one" });
    await expect(store.commit({ thread: { ...thread, title: "stale" }, reason: "turn_completed", committedAt: thread.updatedAt, expectedRevision: 0 })).rejects.toThrow("storage_conflict");
  });

  it("removes expired records and malformed index members", async () => {
    const redis = new FakeRedis();
    const store = new RemoteThreadStore(redis, "test", () => new Date("2026-01-10T00:00:00.000Z"));
    await store.commit({ thread: completedThread("expired"), reason: "turn_completed", committedAt: "2026-01-01T00:00:00.000Z" as never });
    redis.scores.get("test:threads:index")?.set("missing", 1);
    expect(await store.list()).toEqual([]);
    expect(await store.load("expired")).toBeNull();
  });
});
