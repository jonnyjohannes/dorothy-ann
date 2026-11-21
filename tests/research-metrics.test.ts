import { describe, expect, it, vi } from "vitest";
import { createResearchMetricsSink } from "../api/research-metrics.js";
import { createLogger, type LogRecord } from "../server/runtime/logger.js";
import { ResearchTimingCollector } from "../server/runtime/research-timing.js";

describe("Vercel research metrics mapping", () => {
  it("emits one bounded duration per measured stage while preserving the info log", async () => {
    const logs: LogRecord[] = [];
    const emit = vi.fn();
    let time = 0;
    const collector = new ResearchTimingCollector(createResearchMetricsSink(createLogger({ level: "info", sink: (record) => { logs.push(record); } }), emit), () => time);
    const search = collector.decorateSearch({ search: async () => { time += 7; return []; } });
    await collector.measureResolution(async () => {
      await search.search("SENTINEL_PRIVATE_QUERY", { maxResults: 1 });
      await search.search("SENTINEL_PRIVATE_QUERY", { maxResults: 1 });
      collector.markAcquisitionWall(11, true);
      const assessment = collector.decorateLlm({
        assessResearch: async () => { time += 5; throw new Error("SENTINEL_PROVIDER_PAYLOAD"); },
        async *synthesizeResearch() { yield { type: "text", markdown: "unused" }; },
      });
      await expect(assessment.assessResearch({} as never)).rejects.toThrow("SENTINEL_PROVIDER_PAYLOAD");
    });
    time += 3;
    collector.emit({ terminalStatus: "failed" });
    collector.emit({ terminalStatus: "completed" });

    expect(emit.mock.calls).toEqual([
      ["research.turn.execution.wall_elapsed_ms", 22],
      ["research.turn.resolution.wall_elapsed_ms", 19],
      ["research.turn.acquisition.span_elapsed_sum_ms", 11],
      ["research.turn.search.call_elapsed_sum_ms", 14],
      ["research.turn.assessment.call_elapsed_sum_ms", 5],
    ]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: "research_timing", terminal_status: "failed", stages: { search: { calls: 2, cumulative_ms: 14 }, assessment: { calls: 1, failed: 1 } } });
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(/SENTINEL_PRIVATE_QUERY|SENTINEL_PROVIDER_PAYLOAD/u);
  });

  it("keeps the log and other metrics when one emission fails, and omits unentered stages", async () => {
    const logs: LogRecord[] = [];
    const emit = vi.fn((name: string) => {
      if (name === "research.turn.resolution.wall_elapsed_ms") throw new Error("metric unavailable");
    });
    let time = 0;
    const collector = new ResearchTimingCollector(createResearchMetricsSink(createLogger({ level: "info", sink: (record) => { logs.push(record); } }), emit), () => time);
    const search = collector.decorateSearch({ search: async () => { time = 1; return []; } });
    await collector.measureResolution(() => search.search("private", { maxResults: 1 }));
    expect(() => collector.emit({ terminalStatus: "interrupted" })).not.toThrow();
    expect(emit.mock.calls.map(([name]) => name)).toEqual([
      "research.turn.execution.wall_elapsed_ms", "research.turn.resolution.wall_elapsed_ms", "research.turn.search.call_elapsed_sum_ms",
    ]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: "research_timing", terminal_status: "interrupted" });
  });

  it("emits all seven fixed names with at most one sample per measured stage", async () => {
    const emit = vi.fn();
    let time = 0;
    const collector = new ResearchTimingCollector(createResearchMetricsSink(createLogger({ level: "silent" }), emit), () => time);
    const extractor = collector.decorateExtractor({ extract: async (source) => {
      time += 4;
      return { sourceId: source.sourceId, status: "skipped" as const, reason: "empty_content" as const };
    } });
    const llm = collector.decorateLlm({
      assessResearch: async () => { time += 5; return { directive: { kind: "resolved" as const, observations: [] } }; },
      async *synthesizeResearch() { time += 6; yield { type: "text" as const, markdown: "answer" }; time += 3; },
    });
    await collector.measureResolution(async () => {
      await extractor.extract({ sourceId: "private" as never, rank: 1, title: "private", url: "https://example.test", canonicalUrl: "https://example.test", displayUrl: "example.test" }, { maxCharacters: 1, timeoutMs: 1 });
      const search = collector.decorateSearch({ search: async () => { time += 2; return []; } });
      await search.search("private", { maxResults: 1 });
      await llm.assessResearch({} as never);
      collector.markAcquisitionWall(6, true);
    });
    for await (const part of llm.synthesizeResearch({} as never)) expect(part.type).toBe("text");
    collector.emit({ terminalStatus: "completed" });
    expect(emit.mock.calls).toEqual([
      ["research.turn.execution.wall_elapsed_ms", 20],
      ["research.turn.resolution.wall_elapsed_ms", 11],
      ["research.turn.acquisition.span_elapsed_sum_ms", 6],
      ["research.turn.search.call_elapsed_sum_ms", 2],
      ["research.turn.extraction.call_elapsed_sum_ms", 4],
      ["research.turn.assessment.call_elapsed_sum_ms", 5],
      ["research.turn.synthesis.call_elapsed_sum_ms", 9],
    ]);
    expect(emit).toHaveBeenCalledTimes(7);
    expect(emit.mock.calls.every(([name, value]) => name.length < 64 && /^[a-z._]+$/u.test(name) && Number.isFinite(value))).toBe(true);
    expect(emit.mock.calls.every((call) => call.length === 2)).toBe(true);
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(/private|example\.test|answer/u);
  });

  it("keeps Vercel metrics independent of the console log level", () => {
    const emit = vi.fn();
    new ResearchTimingCollector(createResearchMetricsSink(createLogger({ level: "silent" }), emit)).emit({ terminalStatus: "executor_error" });
    expect(emit).toHaveBeenCalledExactlyOnceWith("research.turn.execution.wall_elapsed_ms", expect.any(Number));
  });
});
