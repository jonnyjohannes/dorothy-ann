import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../server/runtime/config";

describe("runtime configuration", () => {
  it("uses the approved operational maxima by default", () => {
    const config = loadConfig({}, { onDeprecation: vi.fn() });

    expect(config).toMatchObject({
      RESEARCH_TIMING_LOGS: false,
      MAX_SEARCH_RESULTS: 10,
      MAX_CONCURRENT_SEARCHES: 3,
      MAX_CONCURRENT_EXTRACTIONS: 3,
      EXTRACTION_TIMEOUT_MS: 8_000,
      MAX_EXTRACTED_CHARS_PER_PAGE: 20_000,
      MAX_EVIDENCE_CHARS_PER_SOURCE: 4_000,
      MAX_EVIDENCE_CHARS_TOTAL: 48_000,
      MAX_THREAD_CONTEXT_TURNS: 8,
      MAX_THREAD_CONTEXT_CHARS: 24_000,
      MAX_ASSESSMENT_OUTPUT_TOKENS: 800,
      MAX_OUTPUT_TOKENS: 4_096,
      MAX_TURN_REQUEST_BYTES: 128_000,
    });
  });

  it("accepts only explicit research timing log booleans", () => {
    expect(loadConfig({ RESEARCH_TIMING_LOGS: "true" }, { onDeprecation: vi.fn() }).RESEARCH_TIMING_LOGS).toBe(true);
    expect(loadConfig({ RESEARCH_TIMING_LOGS: "false" }, { onDeprecation: vi.fn() }).RESEARCH_TIMING_LOGS).toBe(false);
    expect(() => loadConfig({ RESEARCH_TIMING_LOGS: "TRUE_PRIVATE_VALUE" }, { onDeprecation: vi.fn() })).toThrow("invalid configuration: RESEARCH_TIMING_LOGS");
  });

  it("accepts lowered canonical operational values", () => {
    const config = loadConfig({
      MAX_CONCURRENT_SEARCHES: "2",
      MAX_CONCURRENT_EXTRACTIONS: "1",
      MAX_EVIDENCE_CHARS_PER_SOURCE: "1000",
      MAX_EVIDENCE_CHARS_TOTAL: "2000",
      MAX_TURN_REQUEST_BYTES: "8000",
    }, { onDeprecation: vi.fn() });

    expect(config.MAX_CONCURRENT_SEARCHES).toBe(2);
    expect(config.MAX_CONCURRENT_EXTRACTIONS).toBe(1);
    expect(config.MAX_TURN_REQUEST_BYTES).toBe(8_000);
  });

  it.each([
    ["MAX_CONCURRENT_SEARCHES", "4"],
    ["MAX_CONCURRENT_EXTRACTIONS", "0"],
    ["MAX_THREAD_CONTEXT_TURNS", "1.5"],
    ["MAX_OUTPUT_TOKENS", "4097"],
    ["MAX_TURN_REQUEST_BYTES", "7999"],
  ])("rejects invalid %s", (name, value) => {
    expect(() => loadConfig({ [name]: value }, { onDeprecation: vi.fn() })).toThrow(`invalid configuration: ${name}`);
  });

  it("rejects a per-source evidence bound above the total", () => {
    expect(() => loadConfig({
      MAX_EVIDENCE_CHARS_PER_SOURCE: "4000",
      MAX_EVIDENCE_CHARS_TOTAL: "3999",
    }, { onDeprecation: vi.fn() })).toThrow("invalid configuration: MAX_EVIDENCE_CHARS_PER_SOURCE");
  });

  it("uses independent legacy model fallbacks and emits no values", () => {
    const onDeprecation = vi.fn();
    const config = loadConfig({
      ANTHROPIC_MODEL: "legacy-secret-model-ref",
      ANTHROPIC_ASSESSMENT_MODEL: "assessment-ref",
    }, { onDeprecation });

    expect(config.ANTHROPIC_ASSESSMENT_MODEL).toBe("assessment-ref");
    expect(config.ANTHROPIC_SYNTHESIS_MODEL).toBe("legacy-secret-model-ref");
    expect(onDeprecation).toHaveBeenCalledOnce();
    expect(onDeprecation).toHaveBeenCalledWith("deprecated configuration: ANTHROPIC_MODEL");
    expect(onDeprecation.mock.calls.flat().join(" ")).not.toContain("legacy-secret-model-ref");
  });

  it("prefers canonical settings while mapping bounded legacy operational values", () => {
    const warnings: string[] = [];
    const config = loadConfig({
      MAX_THREAD_CONTEXT_CHARS: "12000",
      MAX_CONTEXT_CHARS: "120000",
      MAX_EXTRACTED_CHARS_TOTAL: "50000",
      MAX_REQUEST_BYTES: "32000",
    }, { onDeprecation: (message) => warnings.push(message) });

    expect(config.MAX_THREAD_CONTEXT_CHARS).toBe(12_000);
    expect(config.MAX_EVIDENCE_CHARS_TOTAL).toBe(48_000);
    expect(config.MAX_TURN_REQUEST_BYTES).toBe(32_000);
    expect(warnings).toEqual([
      "deprecated configuration: MAX_EXTRACTED_CHARS_TOTAL",
      "deprecated configuration: MAX_CONTEXT_CHARS",
      "deprecated configuration: MAX_REQUEST_BYTES",
    ]);
  });
});
