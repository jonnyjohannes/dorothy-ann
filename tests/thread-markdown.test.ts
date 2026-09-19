import { describe, expect, it } from "vitest";
import { threadMarkdown } from "../src/ui/policies/thread-markdown";
import type { Thread } from "../src/domain/types";

const sourceA = { sourceId: "src_a" as never, title: "Alpha [source]", url: "https://example.com/a", canonicalUrl: "https://example.com/a", displayUrl: "example.com/a", ordinal: 1 };
const sourceB = { sourceId: "src_b" as never, title: "Beta source", url: "https://example.com/b", canonicalUrl: "https://example.com/b", displayUrl: "example.com/b", ordinal: 2 };
const userMessage = (content: string) => ({ id: crypto.randomUUID() as never, role: "user" as const, content, createdAt: "2026-01-01T00:00:00.000Z" as never });

const thread = {
  schemaVersion: 3,
  id: "thread_1",
  title: "Topic",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sources: [sourceA, sourceB],
  legacyArchive: [],
  turns: [
    { id: "turn_1", kind: "research", status: "completed", createdAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:00.000Z", userMessage: userMessage("What happened?"), execution: { kind: "recorded", assessmentModelRef: "a", synthesisModelRef: "s", searchRef: "search" }, result: { completion: "sufficient", answer: { parts: [{ type: "text", markdown: "It happened" }, { type: "citation", sourceId: sourceB.sourceId }] }, resolution: {} } },
  ]
} as unknown as Thread;

describe("thread markdown export", () => {
  it("links numbered inline citations and appends matching sources", () => {
    expect(threadMarkdown(thread)).toContain("It happened[1](https://example.com/b)");
    expect(threadMarkdown(thread)).toContain("## Sources\n\n1. [Beta source](https://example.com/b)");
    expect(threadMarkdown(thread)).not.toContain("Alpha");
  });
});
