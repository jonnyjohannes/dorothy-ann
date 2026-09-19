import { describe, expect, it } from "vitest";
import { createLogger, type LogRecord } from "../server/runtime/logger.js";

describe("structured logger", () => {
  it("filters levels, carries stage bindings, and records monotonic timers", () => {
    const records: LogRecord[] = [];
    let elapsed = 10;
    const logger = createLogger({ level: "debug", service: "test", sink: (record) => records.push(record), now: () => new Date("2026-01-01T00:00:00.000Z"), monotonicNow: () => elapsed });
    const assessing = logger.child({ stage: "assessing" });
    const timer = assessing.timer("provider_call", { provider: "assessment" });
    elapsed = 24;
    timer.end({ outcome: "invalid_response" });
    timer.end({ outcome: "ignored" });
    expect(records).toEqual([{ timestamp: "2026-01-01T00:00:00.000Z", level: "debug", service: "test", event: "provider_call", stage: "assessing", provider: "assessment", outcome: "invalid_response", elapsed_ms: 14 }]);
  });

  it("suppresses debug output below the configured level", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ level: "info", sink: (record) => records.push(record) });
    logger.debug("hidden", { stage: "searching" });
    logger.info("visible", { stage: "resolving" });
    expect(records.map((record) => record.event)).toEqual(["visible"]);
  });
});
