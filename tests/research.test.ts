import { describe, expect, it } from "vitest";
import { runResearch } from "../server/research";
import type { SearchResult } from "../src/domain/types";

const sources = Array.from({ length: 3 }, (_, index) => ({
  sourceId: `s${index + 1}` as never,
  rank: index + 1,
  title: `Source ${index + 1}`,
  url: `https://example.com/${index + 1}`,
  canonicalUrl: `https://example.com/${index + 1}`,
  displayUrl: `example.com/${index + 1}`,
} satisfies SearchResult));

describe("research orchestration", () => {
  it("bounds sources, extracts concurrently, freezes viable evidence, and completes once", async () => {
    let active = 0;
    let peak = 0;
    const events = [];
    for await (const event of runResearch("query", "turn-1", {
      fixture: true,
      maxResults: 10,
      maxConcurrent: 2,
      search: { search: async () => sources } ,
      extractor: {
        extract: async (source) => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          return {
            sourceId: source.sourceId,
            status: "viable" as const,
            page: { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, title: source.title, text: "evidence", extractedAt: new Date().toISOString() as never, characterCount: 8 },
          };
        },
      },
    })) events.push(event);
    expect(peak).toBe(2);
    expect(events.find((event) => event.type === "research.sources")).toMatchObject({ sources });
    expect(events.find((event) => event.type === "research.evidence")).toMatchObject({ sourceIds: ["s1", "s2", "s3"] });
    expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(1);
  });

  it("reuses seeded lookup sources and carries the original query into synthesis", async () => {
    let synthesisInput = "";
    let searchCalled = false;
    const seeded = sources.slice(0, 1);
    for await (const event of runResearch("what were the highlights", "turn-3", {
      fixture: false,
      maxResults: 10,
      seedSources: seeded,
      context: "wwdc 2026 apple news",
      search: { search: async () => { searchCalled = true; return sources; } },
      extractor: { extract: async (source) => ({ sourceId: source.sourceId, status: "viable" as const, page: { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, title: source.title, text: "evidence", extractedAt: new Date().toISOString() as never, characterCount: 8 } }) },
      chat: { stream: async function* (input) { synthesisInput = input.currentUserContent; yield { type: "completed" as const }; } },
    })) { void event; }
    expect(searchCalled).toBe(false);
    expect(synthesisInput).toContain("wwdc 2026 apple news");
    expect(synthesisInput).toContain("what were the highlights");
  });

  it("does not synthesize without viable evidence", async () => {
    await expect(async () => {
      for await (const event of runResearch("query", "turn-2", {
        fixture: false,
        maxResults: 3,
        search: { search: async () => sources.slice(0, 1) },
        extractor: { extract: async (source) => ({ sourceId: source.sourceId, status: "skipped" as const, reason: "empty_content" as const }) },
      })) { void event; }
    }).rejects.toThrow("insufficient_evidence");
  });
});
