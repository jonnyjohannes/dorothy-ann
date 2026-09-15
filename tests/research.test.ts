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
    let systemInstruction = "";
    let searchCalled = false;
    const seeded = sources.slice(0, 1);
    for await (const event of runResearch("what were the highlights", "turn-3", {
      fixture: false,
      maxResults: 10,
      seedSources: seeded,
      context: "wwdc 2026 apple news",
      search: { search: async () => { searchCalled = true; return sources; } },
      extractor: { extract: async (source) => ({ sourceId: source.sourceId, status: "viable" as const, page: { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, title: source.title, text: "evidence", extractedAt: new Date().toISOString() as never, characterCount: 8 } }) },
      chat: { stream: async function* (input) { synthesisInput = input.currentUserContent; systemInstruction = input.systemInstruction; yield { type: "content" as const, part: { type: "text" as const, markdown: "answer" } }; } },
    })) { void event; }
    expect(searchCalled).toBe(false);
    expect(synthesisInput).toContain("wwdc 2026 apple news");
    expect(synthesisInput).toContain("what were the highlights");
    expect(systemInstruction).toContain('Your response must begin exactly with "According to my research..."');
    expect(systemInstruction).toContain("Be complete but concise");
    expect(systemInstruction).toContain("Keep to supported facts");
    expect(systemInstruction).toContain("Answer directly and carefully");
    expect(systemInstruction).toContain("Use Markdown liberally");
    expect(systemInstruction).toContain("bold and italics");
    expect(systemInstruction).toContain("inline code");
  });

  it("fails instead of completing a turn with empty synthesis", async () => {
    await expect(async () => {
      for await (const event of runResearch("question", "turn-empty-synthesis", {
        fixture: false,
        maxResults: 3,
        seedSources: sources.slice(0, 1),
        extractor: { extract: async (source) => ({ sourceId: source.sourceId, status: "viable" as const, page: { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, title: source.title, text: "evidence", extractedAt: new Date().toISOString() as never, characterCount: 8 } }) },
        chat: { planResearch: async () => ({ status: "ready" as const, queries: [] as [] }), stream: async function* () { yield { type: "completed" as const }; } },
      })) { void event; }
    }).rejects.toThrow("synthesis_empty");
  });

  it("fails visibly instead of silently bypassing fan-out when planning is invalid", async () => {
    const events = [];
    await expect(async () => {
      for await (const event of runResearch("question", "turn-planner-fallback", {
        fixture: false,
        maxResults: 3,
        seedSources: sources.slice(0, 1),
        extractor: { extract: async (source) => ({ sourceId: source.sourceId, status: "viable" as const, page: { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, title: source.title, text: "evidence", extractedAt: new Date().toISOString() as never, characterCount: 8 } }) },
        chat: { planResearch: async () => { throw new Error("planner_invalid_schema"); }, stream: async function* () { yield { type: "completed" as const }; } },
      })) events.push(event);
    }).rejects.toThrow("planner_invalid_schema");
    expect(events).toContainEqual({ type: "research.planner.failed", code: "planner_invalid_schema" });
    expect(events.some((event) => event.type === "answer.delta")).toBe(false);
  });

  it("passes provider synthesis through without adding or rewriting the opening", async () => {
    const answers: string[] = [];
    for await (const event of runResearch("question", "turn-opening-pass-through", {
      fixture: false,
      maxResults: 3,
      seedSources: sources.slice(0, 1),
      extractor: { extract: async (source) => ({ sourceId: source.sourceId, status: "viable" as const, page: { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, title: source.title, text: "evidence", extractedAt: new Date().toISOString() as never, characterCount: 8 } }) },
      chat: { planResearch: async () => ({ status: "ready" as const, queries: [] as [] }), stream: async function* () {
        yield { type: "content" as const, part: { type: "text" as const, markdown: "# According to my research..." } };
        yield { type: "content" as const, part: { type: "text" as const, markdown: "According to my research, sourdough chips are crunchy." } };
      } },
    })) if (event.type === "answer.delta") answers.push(event.markdown);
    expect(answers.join("")).toBe("According to my research...\n\nsourdough chips are crunchy.");
  });

  it("lets the planner request up to three visible searches and synthesizes merged evidence", async () => {
    const planned: SearchResult[] = [{ ...sources[1], sourceId: "extra" as never, rank: 1 }];
    const events = [];
    let searchCalls = 0;
    let synthesisInput = "";
    for await (const event of runResearch("compare these options", "turn-4", {
      fixture: false,
      maxResults: 3,
      search: { search: async (query) => { searchCalls += 1; return query === "check option one" ? planned : sources.slice(0, 1); } },
      extractor: { extract: async (source) => ({ sourceId: source.sourceId, status: "viable" as const, page: { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, title: source.title, text: `evidence for ${source.title}`, extractedAt: new Date().toISOString() as never, characterCount: 20 } }) },
      chat: {
        planResearch: async () => ({ status: "needs_more_research" as const, guidance: "compare the two options", queries: [{ query: "check option one", purpose: "verify option one", priority: 1 as const }] }),
        stream: async function* (input) { synthesisInput = input.currentUserContent; yield { type: "content" as const, part: { type: "text" as const, markdown: "According to my research..." } }; },
      },
    })) events.push(event);
    expect(searchCalls).toBe(2);
    expect(events.find((event) => event.type === "research.plan")).toMatchObject({ plan: { status: "needs_more_research" } });
    expect(events.find((event) => event.type === "research.followup.query")).toMatchObject({ query: { query: "check option one" } });
    expect(synthesisInput).toContain("compare the two options");
    expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(1);
  });

  it("extracts all generated-query sources in one bounded concurrent batch", async () => {
    let active = 0;
    let peak = 0;
    const extra = (number: number): SearchResult => ({ sourceId: `extra-${number}` as never, rank: 1, title: `Extra ${number}`, url: `https://extra.example/${number}`, canonicalUrl: `https://extra.example/${number}`, displayUrl: `extra.example/${number}` });
    const events = [];
    for await (const event of runResearch("compare", "turn-5", {
      fixture: false,
      maxResults: 3,
      maxConcurrent: 3,
      seedSources: sources.slice(0, 1),
      search: { search: async (query) => [extra(Number(query.slice(-1)))] },
      extractor: { extract: async (source) => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 10)); active -= 1; return { sourceId: source.sourceId, status: "viable" as const, page: { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, title: source.title, text: "evidence", extractedAt: new Date().toISOString() as never, characterCount: 8 } }; } },
      chat: {
        planResearch: async () => ({ status: "needs_more_research" as const, guidance: "compare", queries: [1, 2, 3].map((number) => ({ query: `query ${number}`, purpose: `angle ${number}`, priority: number as 1 | 2 | 3 })) }),
        stream: async function* () { yield { type: "content" as const, part: { type: "text" as const, markdown: "answer" } }; },
      },
    })) events.push(event);
    expect(peak).toBe(3);
    expect(events.find((event) => event.type === "research.followup.extracting")).toMatchObject({ queryCount: 3, sourceCount: 3 });
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
