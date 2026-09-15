import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteThreadStore, StorageConflictError } from "../src/adapters/browser/remote-stores";
import type { Thread } from "../src/domain/types";

afterEach(() => vi.restoreAllMocks());
const thread = (id = "one"): Thread => ({ schemaVersion: 2, id: id as never, title: "Topic", createdAt: "2026-01-01T00:00:00.000Z" as never, updatedAt: "2026-01-01T00:00:00.000Z" as never, modelRef: "fixture", searchRef: "fixture", turns: [{ id: "turn-1" as never, mode: "chat", status: "completed", createdAt: "2026-01-01T00:00:00.000Z" as never, updatedAt: "2026-01-01T00:00:00.000Z" as never, userMessage: { id: "message-1" as never, role: "user", content: "hello", createdAt: "2026-01-01T00:00:00.000Z" as never } }] });

describe("RemoteThreadStore browser adapter", () => {
  it("loads, tracks revisions, and commits through the authenticated API", async () => {
    const value = thread();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ thread: value, revision: 3 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ thread: value, revision: 4 }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const store = new RemoteThreadStore();
    expect(await store.load("one")).toEqual(value);
    expect(await store.commit({ thread: value, reason: "turn_completed", committedAt: value.updatedAt })).toEqual(value);
    expect(fetcher.mock.calls[1][0]).toBe("/api/threads/one");
    expect(JSON.parse(fetcher.mock.calls[1][1].body).expectedRevision).toBe(3);
    expect(fetcher.mock.calls[1][1].credentials).toBe("same-origin");
  });

  it("surfaces remote conflicts without exposing the response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "conflict" } }), { status: 409 })));
    const store = new RemoteThreadStore();
    await expect(store.commit({ thread: thread(), reason: "turn_completed", committedAt: thread().updatedAt })).rejects.toBeInstanceOf(StorageConflictError);
  });
});
