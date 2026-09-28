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
      ["research.duration_ms", 22, { stage: "execution" }],
      ["research.duration_ms", 19, { stage: "resolution" }],
      ["research.duration_ms", 11, { stage: "acquisition_wall" }],
      ["research.duration_ms", 14, { stage: "search" }],
      ["research.duration_ms", 5, { stage: "assessment" }],
    ]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: "research_timing", terminal_status: "failed", stages: { search: { calls: 2, cumulative_ms: 14 }, assessment: { calls: 1, failed: 1 } } });
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(/SENTINEL_PRIVATE_QUERY|SENTINEL_PROVIDER_PAYLOAD/u);
  });

  it("keeps the log and other metrics when one emission fails, and omits unentered stages", async () => {
    const logs: LogRecord[] = [];
    const emit = vi.fn((_: string, __: number, attributes: Record<string, string>) => {
      if (attributes.stage === "resolution") throw new Error("metric unavailable");
    });
    let time = 0;
    const collector = new ResearchTimingCollector(createResearchMetricsSink(createLogger({ level: "info", sink: (record) => { logs.push(record); } }), emit), () => time);
    const search = collector.decorateSearch({ search: async () => { time = 1; return []; } });
    await collector.measureResolution(() => search.search("private", { maxResults: 1 }));
    expect(() => collector.emit({ terminalStatus: "interrupted" })).not.toThrow();
    expect(emit.mock.calls.map(([, , attributes]) => attributes.stage)).toEqual(["execution", "resolution", "search"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: "research_timing", terminal_status: "interrupted" });
  });

  it("keeps Vercel metrics independent of the console log level", () => {
    const emit = vi.fn();
    new ResearchTimingCollector(createResearchMetricsSink(createLogger({ level: "silent" }), emit)).emit({ terminalStatus: "executor_error" });
    expect(emit).toHaveBeenCalledExactlyOnceWith("research.duration_ms", expect.any(Number), { stage: "execution" });
  });
});
