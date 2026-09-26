import { describe, expect, it } from "vitest";
import { ResearchTimingCollector, type ResearchTimingRecord } from "../server/runtime/research-timing.js";
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
      schema_version: 5,
      terminal_status: "completed",
      answer_position: "follow_up",
      assessment_failure_code: "provider_rate_limited",
      assessment_invalid_reason: "invalid_search_query",
      assessment_directive: "search",
      assessment_directives: ["search"],
      context: { turns: 1, known_sources: 2, evidence_packs: 1, evidence_sources: 1 },
      evidence_yield: { requests: [], extraction_text: {
        no_readable_text: 0, under_minimum: 0, fallback_recovered: 0, json_ld_recovered: 0, empty_body: 0, plain_no_text: 0,
        html_no_text_with_script: 0, html_no_text_without_script: 0,
        html_text_without_semantic_root: 0, html_text_outside_semantic_root: 0,
      }, distinct_viable_root_ids: 0 },
      resolution_status: "sufficient",
      stop_reason: "sufficient",
      execution_ms: 50,
      first_answer_signal_ms: 45,
      counts: { searches_used: 1, sources_consumed: 1, assessments_used: 1 },
      stages: {
        search: { calls: 1, succeeded: 1, failed: 0, cumulative_ms: 10, max_ms: 10 },
        extraction: { calls: 1, succeeded: 1, failed: 0, cumulative_ms: 5, max_ms: 5 },
        assessment: { calls: 1, succeeded: 1, failed: 0, cumulative_ms: 8, max_ms: 8 },
        synthesis: { calls: 1, succeeded: 1, failed: 0, cumulative_ms: 17, max_ms: 17, first_output_ms: 7 },
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
    expect(records[0]).toMatchObject({ schema_version: 5, resolution_status: "best_effort", evidence_yield: { distinct_viable_root_ids: 1, requests: [{ reused: 1, viable: 1 }] } });
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

  it("bounds turn-local empty-text categories and ignores non-allowlisted values", () => {
    const records: ResearchTimingRecord[] = [];
    const first = new ResearchTimingCollector((record) => { records.push(record); });
    for (let attempt = 0; attempt < 20; attempt++) {
      first.markExtractionText("no_readable_text");
      first.markExtractionText("empty_body");
    }
    first.markExtractionText("under_minimum");
    first.markExtractionText("fallback_recovered");
    first.markExtractionText("json_ld_recovered");
    first.markExtractionText("SENTINEL_UNTRUSTED_VALUE" as never);
    first.emit({ terminalStatus: "failed" });
    const second = new ResearchTimingCollector((record) => { records.push(record); });
    second.emit({ terminalStatus: "completed" });
    expect(records.map((record) => record.evidence_yield.extraction_text)).toMatchObject([
      { no_readable_text: 12, under_minimum: 1, fallback_recovered: 1, json_ld_recovered: 1, empty_body: 12 },
      { no_readable_text: 0, under_minimum: 0, fallback_recovered: 0, json_ld_recovered: 0, empty_body: 0 },
    ]);
    expect(Object.keys(records[0].evidence_yield.extraction_text).sort()).toEqual([
      "no_readable_text", "under_minimum", "fallback_recovered", "json_ld_recovered", "empty_body", "plain_no_text",
      "html_no_text_with_script", "html_no_text_without_script", "html_text_without_semantic_root", "html_text_outside_semantic_root",
    ].sort());
    expect(JSON.stringify(records)).not.toContain("SENTINEL_UNTRUSTED_VALUE");
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
