import { describe, expect, it, vi } from "vitest";
import { logAssessmentAnomaly, loggerResearchTimingSink, ResearchTimingCollector, type ResearchTimingRecord } from "../server/runtime/research-timing.js";
import { createLogger, type LogRecord } from "../server/runtime/logger.js";
import type { LLMProvider, ResearchAssessmentInput, ResearchSynthesisInput } from "../src/ports/llm.js";

const assessmentInput = { maxOutputTokens: 800 } as ResearchAssessmentInput;
const synthesisInput = {} as ResearchSynthesisInput;

describe("research timing", () => {
  it("aggregates allowlisted stage, wall, first-output, and first-signal timings", async () => {
    let time = 0;
    let record: ResearchTimingRecord | undefined;
    const collector = new ResearchTimingCollector((value) => { record = value; }, () => time);
    const search = collector.decorateSearch({ search: async () => { time = 10; return []; } });
    const extractor = collector.decorateExtractor({ extract: async (source) => { time = 15; return { sourceId: source.sourceId, status: "skipped", reason: "empty_content" }; } });
    const provider: LLMProvider = {
      assessResearch: async () => { time = 23; return { directive: { kind: "search", query: "q", purpose: "p", successCriterion: "s", priority: 1 } }; },
      async *synthesizeResearch() { time = 30; yield { type: "text", markdown: "answer" }; time = 40; },
    };
    const llm = collector.decorateLlm(provider);

    await search.search("private query", { maxResults: 1 });
    await extractor.extract({ sourceId: "private-source" as never, rank: 1, title: "private", url: "https://example.test", canonicalUrl: "https://example.test", displayUrl: "example.test" }, { maxCharacters: 1, timeoutMs: 1 });
    await llm.assessResearch(assessmentInput);
    const parts = [];
    for await (const part of llm.synthesizeResearch(synthesisInput)) parts.push(part);
    expect(parts).toHaveLength(1);
    collector.markAssessmentDirective("search");
    collector.markAssessmentFailure({ code: "provider_rate_limited", reason: "invalid_search_query" });
    collector.markAssessmentAttempt({ attempt: 1, elapsedMs: 20, parseMs: 1, inputChars: 3_000, maxOutputTokens: 800, inputTokens: 700, outputTokens: 800, stopReason: "max_tokens", outcome: "rejected", reason: "missing_directive" });
    collector.markAssessmentAttempt({ attempt: 2, elapsedMs: 30, parseMs: 2, inputChars: 3_100, maxOutputTokens: 1_600, inputTokens: 750, outputTokens: 950, stopReason: "end_turn", outcome: "accepted" });
    collector.markAssessmentValidation(3);
    time = 45;
    collector.markFirstAnswerSignal();
    time = 50;
    collector.emit({
      terminalStatus: "completed",
      answerPosition: "follow_up",
      context: { turns: 1, known_sources: 2, evidence_packs: 1, evidence_sources: 1 },
      resolution: { status: "sufficient", stopReason: "sufficient", ledger: { gaps: [], searchesUsed: 1, sourcesConsumed: 1, assessmentsUsed: 1 }, knowledge: { problemId: "root" as never, findings: [], evidence: [], unresolvedGapIds: [] } },
    });

    expect(record).toEqual({
      event: "research_timing",
      schema_version: 8,
      terminal_status: "completed",
      answer_position: "follow_up",
      assessment_failure_code: "provider_rate_limited",
      assessment_invalid_reason: "invalid_search_query",
      assessment_directive: "search",
      assessment_directives: ["search"],
      context: { turns: 1, known_sources: 2, evidence_packs: 1, evidence_sources: 1 },
      assessment_profile: { provider_attempts: 2, retried_calls: 1, rejected_attempts: 1, failed_attempts: 0, input_chars_max: 3_100, input_tokens_total: 1_450, output_tokens_total: 1_750, token_usage_reported: 2, slowest_attempt_ms: 30, parse_ms_total: 3, validation_ms_total: 3, accepted_observations: 0, provider_ms_total: 47 },
      evidence_yield: { requests: [], distinct_viable_root_ids: 0 },
      resolution_status: "sufficient",
      stop_reason: "sufficient",
      execution_ms: 50,
      first_answer_signal_ms: 45,
      counts: { searches_used: 1, sources_consumed: 1, assessments_used: 1 },
      stages: {
        search: { calls: 1, succeeded: 1, failed: 0, cumulative_ms: 10, max_ms: 10 },
        extraction: { calls: 1, succeeded: 1, failed: 0, cumulative_ms: 5, max_ms: 5 },
        assessment: { calls: 1, succeeded: 1, failed: 0, cumulative_ms: 8, max_ms: 8 },
        synthesis: { calls: 1, succeeded: 1, failed: 0, cumulative_ms: 17, max_ms: 17, first_output_ms: 7, remaining_after_first_output_ms: 10 },
      },
    });
  });

  it("counts distinct nonempty final root IDs across reused context snapshots separately from citations and outcome", () => {
    const records: ResearchTimingRecord[] = [];
    const collector = new ResearchTimingCollector((record) => { records.push(record); });
    const snapshot = (sourceId: string, text: string) => ({ sourceId: sourceId as never, page: { text, extractedAt: "2026-01-01T00:00:00.000Z" as never, characterCount: text.length } });
    collector.markEvidenceYield([{ requested: 5, returned: 2, normalized_unique: 2, invalid_discarded: 0, duplicate_discarded: 0, selected: 1, reused: 1, unselected: 0, viable: 1, empty: 0, failed: 0, fetch_failed: 0, timeout: 0, extract_failed: 0, skipped_other: 0 }]);
    collector.emit({ terminalStatus: "completed", resolution: {
      status: "best_effort", stopReason: "no_new_knowledge", ledger: { gaps: [], searchesUsed: 1, sourcesConsumed: 1, assessmentsUsed: 1 },
      knowledge: { problemId: "root" as never, findings: [], unresolvedGapIds: [], evidence: [
        { problemId: "root" as never, query: "private query", createdAt: "2026-01-01T00:00:00.000Z" as never, requestOrder: 0, sources: [snapshot("same", "text"), snapshot("same", "text")] },
        { problemId: "root" as never, query: "private query", createdAt: "2026-01-01T00:00:00.000Z" as never, requestOrder: 1, sources: [snapshot("same", "text"), snapshot("empty", "")] },
      ] },
    } });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ schema_version: 8, resolution_status: "best_effort", evidence_yield: { distinct_viable_root_ids: 1, requests: [{ reused: 1, viable: 1 }] } });
    expect(JSON.stringify(records)).not.toContain("private query");
    expect(JSON.stringify(records)).not.toContain("same");
  });

  it("reports five charged attempts and the twelve-attempt turn ceiling without truncation", () => {
    const records: ResearchTimingRecord[] = [];
    const collector = new ResearchTimingCollector((record) => { records.push(record); });
    collector.markEvidenceYield([{ requested: 5, returned: 5, normalized_unique: 5, invalid_discarded: 0, duplicate_discarded: 0, selected: 5, reused: 0, unselected: 0, viable: 0, empty: 5, failed: 0, fetch_failed: 0, timeout: 0, extract_failed: 0, skipped_other: 0 }]);
    collector.emit({ terminalStatus: "failed", ledger: { gaps: [], searchesUsed: 3, sourcesConsumed: 12, assessmentsUsed: 2 } });
    expect(records[0]).toMatchObject({ counts: { searches_used: 3, sources_consumed: 12 }, evidence_yield: { requests: [{ selected: 5, empty: 5 }] } });
  });

  it("bounds attempt metrics without accepting text or identifiers", () => {
    let record: ResearchTimingRecord | undefined;
    const collector = new ResearchTimingCollector((value) => { record = value; });
    collector.markAssessmentAttempt({ attempt: 1, elapsedMs: Number.POSITIVE_INFINITY, parseMs: -3, inputChars: 9_999_999, maxOutputTokens: 800, inputTokens: -1, outputTokens: 1_999_999, stopReason: "unknown", outcome: "failed", reason: "provider_error" });
    collector.emit({ terminalStatus: "failed" });
    expect(record?.assessment_profile).toMatchObject({ provider_attempts: 1, retried_calls: 0, failed_attempts: 1, input_chars_max: 2_000_000, input_tokens_total: 0, output_tokens_total: 1_000_000, slowest_attempt_ms: 0, parse_ms_total: 0 });
  });

  it("reports overlapping acquisition wall rather than summing concurrent extraction, and omits missing wall phases", async () => {
    let time = 0;
    const records: ResearchTimingRecord[] = [];
    const collector = new ResearchTimingCollector((value) => { records.push(value); }, () => time);
    const extractor = collector.decorateExtractor({ extract: async (source) => {
      await Promise.resolve();
      time = source.sourceId === "a" ? 8 : 10;
      return { sourceId: source.sourceId, status: "skipped" as const, reason: "empty_content" as const };
    } });
    const source = (id: string) => ({ sourceId: id as never, rank: 1, title: "x", url: "https://example.test", canonicalUrl: "https://example.test", displayUrl: "example.test" });
    await Promise.all([extractor.extract(source("a"), { maxCharacters: 1, timeoutMs: 10 }), extractor.extract(source("b"), { maxCharacters: 1, timeoutMs: 10 })]);
    collector.markAcquisitionWall(10, true);
    collector.emit({ terminalStatus: "interrupted" });
    expect(records[0]).toMatchObject({ acquisition_wall: { calls: 1, cumulative_ms: 10 }, stages: { extraction: { calls: 2, cumulative_ms: 20 } } });
    collector.markAcquisitionWall(123, false);
    collector.emit({ terminalStatus: "failed" });
    expect(records).toHaveLength(1);
    const missing: ResearchTimingRecord[] = [];
    new ResearchTimingCollector((record) => { missing.push(record); }).emit({ terminalStatus: "failed" });
    expect(missing[0]).not.toHaveProperty("acquisition_wall");
  });

  it("aggregates repeated Brave subphases and assessment observations under one bounded summary", () => {
    const records: ResearchTimingRecord[] = [];
    const collector = new ResearchTimingCollector((record) => { records.push(record); });
    collector.markSearchSubphase("http", 14, true);
    collector.markSearchSubphase("json_normalization", 3, true);
    collector.markSearchSubphase("http", 10, false);
    collector.markExtractionSubphase("safety", 5, true);
    collector.markExtractionSubphase("safety", 7, false);
    collector.markExtractionSubphase("http", 11, false);
    collector.markAssessmentAttempt({ attempt: 1, outcome: "rejected", outputShape: "incomplete_outer_json", reason: "missing_directive", elapsedMs: 11_000, parseMs: 2,
      inputChars: 400, maxOutputTokens: 1_200, stopReason: "max_tokens" });
    collector.markAssessmentAttempt({ attempt: 2, outcome: "accepted", acceptedObservations: 5, elapsedMs: 7_000, parseMs: 3,
      inputChars: 400, maxOutputTokens: 1_600, stopReason: "end_turn" });
    collector.emit({ terminalStatus: "completed" });
    expect(records[0]).toMatchObject({ search_subphases: { http: { calls: 2, succeeded: 1, failed: 1, cumulative_ms: 24 }, json_normalization: { calls: 1, cumulative_ms: 3 } },
      extraction_subphases: { safety: { calls: 2, succeeded: 1, failed: 1, cumulative_ms: 12 }, http: { calls: 1, succeeded: 0, failed: 1, cumulative_ms: 11 } },
      assessment_profile: { accepted_observations: 5, provider_attempts: 2, retried_calls: 1, provider_ms_total: 17_995 } });
    expect(records[0]?.extraction_subphases).not.toHaveProperty("body");
  });

  it("emits a sanitized info anomaly only for rejection, retry and slow attempts", () => {
    const info = vi.fn();
    const logger = { info } as never;
    const base = { attempt: 1 as const, elapsedMs: 9_999, parseMs: 5, inputChars: 200, maxOutputTokens: 1_200,
      stopReason: "end_turn" as const, outcome: "accepted" as const, acceptedObservations: 1 };
    logAssessmentAnomaly(logger, base);
    expect(info).not.toHaveBeenCalled();
    logAssessmentAnomaly(logger, { ...base, attempt: 2, elapsedMs: 10_000, inputChars: 8_000_000, acceptedObservations: 100 });
    logAssessmentAnomaly(logger, { ...base, outcome: "rejected", outputShape: "complete_invalid_directive", reason: "invalid_resolved", stopReason: "max_tokens" });
    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls[0]).toEqual(["assessment_anomaly", expect.objectContaining({ input_chars: 2_000_000, accepted_observations: 24, attempt: 2 })]);
    expect(info.mock.calls[1]).toEqual(["assessment_anomaly", expect.objectContaining({ output_shape: "complete_invalid_directive", reason: "invalid_resolved" })]);
    expect(JSON.stringify(info.mock.calls)).not.toContain("private");
  });

  it("keeps anomaly and summary as count-only info records for the same turn-local collector", () => {
    const logs: LogRecord[] = [];
    const logger = createLogger({ level: "info", sink: (record) => { logs.push(record); } });
    const collector = new ResearchTimingCollector(loggerResearchTimingSink(logger));
    const attempt = { attempt: 1 as const, elapsedMs: 10_500, parseMs: 10, inputChars: 300, maxOutputTokens: 1_200,
      outcome: "rejected" as const, stopReason: "max_tokens" as const, reason: "missing_directive" as const, outputShape: "incomplete_outer_json" as const };
    collector.markAssessmentAttempt(attempt);
    logAssessmentAnomaly(logger, attempt);
    collector.emit({ terminalStatus: "interrupted" });
    expect(logs.map(({ event }) => event)).toEqual(["assessment_anomaly", "research_timing"]);
    expect(logs[1]).toMatchObject({ schema_version: 8, terminal_status: "interrupted", assessment_profile: { rejected_attempts: 1, provider_attempts: 1 } });
    expect(JSON.stringify(logs)).not.toMatch(/PRIVATE_QUERY|PRIVATE_THREAD|PRIVATE_URL/u);
  });

  it("records failures without retaining errors or allowing a throwing sink to alter behavior", async () => {
    let time = 0;
    let serialized = "";
    const collector = new ResearchTimingCollector((record) => { serialized = JSON.stringify(record); throw new Error("sink failure"); }, () => time);
    const secret = "SENTINEL_PROVIDER_PAYLOAD";
    const search = collector.decorateSearch({ search: async () => { time = 9; throw new Error(secret); } });

    await expect(search.search("SENTINEL_QUERY", { maxResults: 1 })).rejects.toThrow(secret);
    time = 10;
    expect(() => collector.emit({ terminalStatus: "executor_error" })).not.toThrow();
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("SENTINEL_QUERY");
    expect(JSON.parse(serialized)).toMatchObject({
      terminal_status: "executor_error",
      stages: { search: { calls: 1, succeeded: 0, failed: 1, cumulative_ms: 9, max_ms: 9 } },
    });
  });
});
