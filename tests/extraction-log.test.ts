import { describe, expect, it } from "vitest";
import { logSelectedExtractionFailure } from "../server/runtime/extraction-log.js";
import { createLogger, type LogRecord } from "../server/runtime/logger.js";

describe("selected extraction logging", () => {
  it("emits sanitized URL and host for empty and failed selected pages through the normal logger", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ level: "info", sink: (record) => { records.push(record); } });
    logSelectedExtractionFailure(logger, { url: "https://example.org/article?token=PRIVATE_QUERY#PRIVATE_FRAGMENT", rank: 2, status: "skipped", reason: "empty_content" });
    logSelectedExtractionFailure(logger, { url: "https://other.example.org/%74oken/PRIVATE_PATH", rank: 4, status: "failed", reason: "fetch_failed" });
    expect(records).toMatchObject([
      { level: "info", event: "extraction_rejected", stage: "extracting", url: "https://example.org/article", host: "example.org", rank: 2, reason: "empty_content" },
      { level: "warn", event: "extraction_failed", stage: "extracting", url: "https://other.example.org/[redacted]", host: "other.example.org", rank: 4, reason: "fetch_failed" },
    ]);
    expect(JSON.stringify(records)).not.toMatch(/PRIVATE_QUERY|PRIVATE_FRAGMENT|token=|PRIVATE_PATH/);
  });

  it("allows only bounded fixed diagnostics and an HTTP bucket for actual HTTP rejection", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ level: "info", sink: (record) => { records.push(record); } });
    logSelectedExtractionFailure(logger, { url: "https://example.org/private?key=PRIVATE_QUERY", rank: 1, status: "failed", reason: "fetch_failed", elapsed_ms: 999_999,
      metadata: { failure_phase: "fetch", failure_detail: "http_rejected", http_status_bucket: "429" } });
    logSelectedExtractionFailure(logger, { url: "https://example.org/private", rank: 2, status: "failed", reason: "timeout", elapsed_ms: Number.POSITIVE_INFINITY,
      metadata: { failure_phase: "fetch", failure_detail: "deadline", http_status_bucket: "403" } });
    logSelectedExtractionFailure(logger, { url: "https://example.org/private", rank: 3, status: "skipped", reason: "empty_content", elapsed_ms: -99,
      metadata: { failure_phase: "PRIVATE_PHASE" as never, failure_detail: "PRIVATE_DETAIL" as never, http_status_bucket: "PRIVATE_BUCKET" as never } });
    expect(records).toMatchObject([
      { failure_phase: "fetch", failure_detail: "http_rejected", http_status_bucket: "429", elapsed_ms: 300_000 },
      { failure_phase: "fetch", failure_detail: "deadline", elapsed_ms: 0 },
      { failure_phase: "unknown", failure_detail: "other", elapsed_ms: 0 },
    ]);
    expect(JSON.stringify(records)).not.toMatch(/PRIVATE_|PRIVATE_PHASE|PRIVATE_DETAIL|PRIVATE_BUCKET/);
    expect(records[1]).not.toHaveProperty("http_status_bucket");
    expect(records[2]).not.toHaveProperty("http_status_bucket");
  });

  it("debug level includes the info yield events without introducing another flag", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ level: "debug", sink: (record) => { records.push(record); } });
    logSelectedExtractionFailure(logger, { url: "https://example.org/missing", rank: 1, status: "skipped", reason: "empty_content" });
    expect(records).toMatchObject([{ level: "info", event: "extraction_rejected" }]);
  });

  it("uses only LOG_LEVEL and never logs credential-bearing or invalid source URLs", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ level: "warn", sink: (record) => { records.push(record); } });
    logSelectedExtractionFailure(logger, { url: "https://example.org/no-text", rank: 1, status: "skipped", reason: "empty_content" });
    logSelectedExtractionFailure(logger, { url: "https://user:PRIVATE_PASS@example.org/secure", rank: 1, status: "failed", reason: "timeout" });
    logSelectedExtractionFailure(logger, { url: "javascript:PRIVATE_PAYLOAD", rank: 2, status: "failed", reason: "fetch_failed" });
    logSelectedExtractionFailure(logger, { url: "https://example.org/", rank: 9, status: "failed", reason: "timeout" });
    logSelectedExtractionFailure(logger, { url: "https://example.org/", rank: 1, status: "failed", reason: "PRIVATE_REASON" });
    expect(records).toMatchObject([
      { level: "warn", event: "extraction_failed", reason: "timeout", rank: 1 },
      { level: "warn", event: "extraction_failed", reason: "fetch_failed", rank: 2 },
    ]);
    expect(records.every((record) => !("url" in record) && !("host" in record))).toBe(true);
    expect(JSON.stringify(records)).not.toMatch(/PRIVATE|user:/);
  });
});
