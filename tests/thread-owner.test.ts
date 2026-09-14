import { describe, expect, it, vi } from "vitest";
import { ThreadStateOwner } from "../src/application/thread-owner";
import type { Thread } from "../src/domain/types";

const thread = { schemaVersion: 2, id: "thread-1", title: "topic", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", modelRef: "fixture", searchRef: "fixture", turns: [] } as Thread;

describe("ThreadStateOwner", () => {
  it("ignores commits from a superseded request", async () => {
    const commit = vi.fn(async ({ thread: value }: { thread: Thread }) => value);
    const owner = new ThreadStateOwner({ commit });
    owner.begin("topic:1", "first");
    owner.begin("topic:1", "second");
    const stale = await owner.commit("topic:1", "first", { thread, reason: "research_stage", committedAt: thread.updatedAt });
    const current = await owner.commit("topic:1", "second", { thread, reason: "research_stage", committedAt: thread.updatedAt });
    expect(stale).toBeNull();
    expect(current).toEqual(thread);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
