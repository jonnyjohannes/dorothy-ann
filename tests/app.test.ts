import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { loadConfig } from "../server/config";
import { RemoteThreadStore, type RemoteRedis } from "../server/remote-thread-store";
import type { Thread } from "../src/domain/types";

class ApiFakeRedis implements RemoteRedis {
  values = new Map<string, unknown>();
  scores = new Map<string, Map<string, number>>();
  async get<T>(key: string) { return (this.values.get(key) as T | undefined) ?? null; }
  async zrange<T extends unknown[]>(key: string, min: number, max: number) { void min; void max; return [...(this.scores.get(key)?.keys() ?? [])] as T; }
  async zrem(key: string, ...members: string[]) { const index = this.scores.get(key); let removed = 0; for (const member of members) if (index?.delete(member)) removed += 1; return removed; }
  async del(...keys: string[]) { for (const key of keys) this.values.delete(key); return keys.length; }
  async eval<T>(_script: string, keys: string[], args: string[]) { const current = this.values.get(keys[0]) as { revision?: number } | undefined; const expected = Number(args[0]); if ((current && (expected === 0 || current.revision !== expected)) || (!current && expected !== 0)) return [0, current?.revision ?? 0] as T; const record = { ...JSON.parse(args[1]), revision: expected + 1 }; this.values.set(keys[0], record); const index = this.scores.get(keys[1]) ?? new Map<string, number>(); index.set(args[4], Number(args[3])); this.scores.set(keys[1], index); return [1, record.revision, JSON.stringify(record)] as T; }
}

const completedThread = (id: string): Thread => ({ schemaVersion: 2, id: id as Thread["id"], title: "Topic", createdAt: "2026-01-01T00:00:00.000Z" as never, updatedAt: "2026-01-01T00:00:00.000Z" as never, modelRef: "fixture", searchRef: "fixture", turns: [{ id: "turn-1" as never, mode: "chat", status: "completed", createdAt: "2026-01-01T00:00:00.000Z" as never, updatedAt: "2026-01-01T00:00:00.000Z" as never, userMessage: { id: "message-1" as never, role: "user", content: "hello", createdAt: "2026-01-01T00:00:00.000Z" as never } }] });

const app = createApp({ config: loadConfig({ DOROTHY_FIXTURE_MODE: "true" }) });
const liveApp = createApp({
  config: loadConfig({ DOROTHY_FIXTURE_MODE: "false" }),
});
const storageApp = createApp({ config: loadConfig({ DOROTHY_FIXTURE_MODE: "true" }), remoteThreads: new RemoteThreadStore(new ApiFakeRedis(), "test", () => new Date("2026-01-02T00:00:00.000Z")) });
describe("portable Hono API", () => {
  it("reports provider readiness without exposing secrets", async () => {
    const response = await app.request("http://localhost/api/providers/status");
    expect(await response.json()).toEqual({
      fixtureMode: true,
      search: true,
      chat: true,
      extraction: true,
    });
  });
  it("commits completed threads and rejects stale revisions", async () => {
    const thread = completedThread("thread-api");
    const create = await storageApp.request("http://localhost/api/threads/thread-api", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ thread, reason: "turn_completed", committedAt: thread.updatedAt, expectedRevision: 0 }) });
    expect(create.status).toBe(200);
    expect((await create.json()).revision).toBe(1);
    const stale = await storageApp.request("http://localhost/api/threads/thread-api", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ thread, reason: "turn_completed", committedAt: thread.updatedAt, expectedRevision: 0 }) });
    expect(stale.status).toBe(409);
    const loaded = await storageApp.request("http://localhost/api/threads/thread-api");
    expect(loaded.status).toBe(200);
    expect((await loaded.json()).thread.id).toBe("thread-api");
  });
  it("rejects non-completed thread commits", async () => {
    const thread = { ...completedThread("running"), turns: [{ ...completedThread("running").turns[0], status: "running" }] };
    const response = await storageApp.request("http://localhost/api/threads/running", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ thread, reason: "turn_completed", committedAt: thread.updatedAt, expectedRevision: 0 }) });
    expect(response.status).toBe(400);
  });
  it("streams a fixture research turn with one terminal event", async () => {
    const response = await app.request("http://localhost/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "why is the sky blue?", mode: "research" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain("event: turn.started");
    expect(body).toContain("event: research.sources");
    expect(body).toContain("event: answer.delta");
    expect(body.match(/event: turn\.completed/g)).toHaveLength(1);
  });
  it("streams staged fixture research with extraction", async () => {
    const response = await app.request("http://localhost/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "why is the sky blue?" }),
    });
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("event: research.extraction");
    expect(body).toContain("event: research.planning");
    expect(body).toContain("event: research.plan");
    expect(body).toContain("event: turn.completed");
  });
  it("requires an owner session outside fixture mode", async () => {
    const storageResponse = await liveApp.request("http://localhost/api/threads");
    expect(storageResponse.status).toBe(401);
    const response = await liveApp.request("http://localhost/api/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "hello" }),
    });
    expect(response.status).toBe(401);
    const fixtureStorage = await app.request("http://localhost/api/threads");
    expect(fixtureStorage.status).toBe(503);
  });
  it("rejects cross-origin and oversized mutations", async () => {
    const crossOrigin = await app.request("http://localhost/api/lookup", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "hello" }),
    });
    expect(crossOrigin.status).toBe(403);
    const forwardedOrigin = await app.request("http://internal/api/lookup", {
      method: "POST",
      headers: { origin: "https://dorothy-ann.vercel.app", "x-forwarded-host": "dorothy-ann.vercel.app", "x-forwarded-proto": "https", "content-type": "application/json" },
      body: JSON.stringify({ query: "hello" }),
    });
    expect(forwardedOrigin.status).toBe(200);
    const oversized = await app.request("http://localhost/api/lookup", {
      method: "POST",
      headers: { "content-length": "999999" },
      body: "{}",
    });
    expect(oversized.status).toBe(413);
  });
  it("rejects malformed turns", async () => {
    const response = await app.request("http://localhost/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "", mode: "research" }),
    });
    expect(response.status).toBe(400);
  });
  it("renders a deterministic answer report", async () => {
    const response = await app.request("http://localhost/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "A topic",
        objective: "Decide something",
        answer: "The conclusion.",
      }),
    });
    expect(response.status).toBe(200);
    const report = (await response.json()) as {
      markdown: string;
      mimeType: string;
    };
    expect(report.mimeType).toBe("text/markdown");
    expect(report.markdown).toContain("# Dorothy Ann report: A topic");
    expect(report.markdown).toContain("The conclusion.");
  });
});
