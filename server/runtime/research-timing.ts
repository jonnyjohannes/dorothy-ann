import type { GapLedger, ResearchResolution } from "../../src/domain/types.js";
import type { ContentExtractor } from "../../src/ports/extraction.js";
import type { LLMProvider } from "../../src/ports/llm.js";
import type { SearchProvider } from "../../src/ports/providers.js";
import type { Logger } from "./logger.js";

export interface StageTiming {
  calls: number;
  succeeded: number;
  failed: number;
  cumulative_ms: number;
  max_ms: number;
  first_output_ms?: number;
}

export interface ResearchTimingRecord {
  event: "research_timing";
  schema_version: 1;
  terminal_status: "completed" | "failed" | "interrupted" | "executor_error";
  answer_position?: "initial" | "follow_up";
  assessment_failure_code?: "provider_bad_request" | "provider_rate_limited" | "provider_unavailable" | "provider_failed" | "provider_interrupted" | "assessment_invalid_response";
  assessment_invalid_reason?: "empty_response" | "invalid_json" | "missing_directive" | "unknown_directive" | "invalid_search" | "invalid_resolved" | "invalid_decomposition";
  assessment_directive?: "resolved" | "search" | "decompose";
  context?: {
    turns: number;
    known_sources: number;
    evidence_packs: number;
    evidence_sources: number;
  };
  resolution_status?: ResearchResolution["status"];
  stop_reason?: ResearchResolution["stopReason"];
  execution_ms: number;
  resolution_ms?: number;
  first_answer_signal_ms?: number;
  counts: {
    searches_used: number;
    sources_consumed: number;
    assessments_used: number;
  };
  stages: {
    search: StageTiming;
    extraction: StageTiming;
    assessment: StageTiming;
    synthesis: StageTiming;
  };
}

export type ResearchTimingSink = (record: ResearchTimingRecord) => void;

type StageName = keyof ResearchTimingRecord["stages"];

const emptyStage = (): StageTiming => ({ calls: 0, succeeded: 0, failed: 0, cumulative_ms: 0, max_ms: 0 });
const duration = (started: number, finished: number): number => {
  const value = finished - started;
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
};

export function loggerResearchTimingSink(logger: Logger, level: "debug" | "info" = "debug"): ResearchTimingSink {
  return (record) => logger[level](record.event, { stage: "resolving", ...record });
}

/** Per-execution, allowlisted research timing. Inputs and caught errors are never retained. */
export class ResearchTimingCollector {
  private readonly startedAt: number;
  private readonly stages: ResearchTimingRecord["stages"] = {
    search: emptyStage(),
    extraction: emptyStage(),
    assessment: emptyStage(),
    synthesis: emptyStage(),
  };
  private resolutionMs: number | undefined;
  private firstAnswerSignalMs: number | undefined;
  private assessmentFailureCode: ResearchTimingRecord["assessment_failure_code"];
  private assessmentDirective: ResearchTimingRecord["assessment_directive"];
  private assessmentInvalidReason: ResearchTimingRecord["assessment_invalid_reason"];

  constructor(
    private readonly sink: ResearchTimingSink,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.startedAt = now();
  }

  decorateSearch(provider: SearchProvider): SearchProvider {
    return {
      search: async (query, options) => this.measure("search", () => provider.search(query, options)),
    };
  }

  decorateExtractor(extractor: ContentExtractor): ContentExtractor {
    return {
      extract: async (source, limits) => this.measure("extraction", () => extractor.extract(source, limits)),
    };
  }

  decorateLlm(provider: LLMProvider): LLMProvider {
    const now = this.now;
    const synthesis = this.stages.synthesis;
    const assess = (input: Parameters<LLMProvider["assessResearch"]>[0]) => this.measure("assessment", () => provider.assessResearch(input));
    const recordSynthesis = (started: number, succeeded: boolean) => { this.record("synthesis", started, succeeded); };
    return {
      assessResearch: assess,
      async *synthesizeResearch(input) {
        const started = now();
        let succeeded = false;
        try {
          for await (const part of provider.synthesizeResearch(input)) {
            if (synthesis.first_output_ms === undefined) synthesis.first_output_ms = duration(started, now());
            yield part;
          }
          succeeded = true;
        } finally {
          recordSynthesis(started, succeeded);
        }
      },
    };
  }

  async measureResolution<T>(operation: () => Promise<T>): Promise<T> {
    const started = this.now();
    try {
      return await operation();
    } finally {
      this.resolutionMs = duration(started, this.now());
    }
  }

  markFirstAnswerSignal(): void {
    this.firstAnswerSignalMs ??= duration(this.startedAt, this.now());
  }

  markAssessmentDirective(value: unknown): void {
    if (value === "resolved" || value === "search" || value === "decompose") this.assessmentDirective = value;
  }

  markAssessmentFailure(error: unknown): void {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
    const allowed: ResearchTimingRecord["assessment_failure_code"][] = ["provider_bad_request", "provider_rate_limited", "provider_unavailable", "provider_failed", "provider_interrupted", "assessment_invalid_response"];
    if (code && allowed.includes(code as ResearchTimingRecord["assessment_failure_code"])) this.assessmentFailureCode = code as ResearchTimingRecord["assessment_failure_code"];
    const reason = error && typeof error === "object" && "reason" in error && typeof error.reason === "string" ? error.reason : undefined;
    const reasons: ResearchTimingRecord["assessment_invalid_reason"][] = ["empty_response", "invalid_json", "missing_directive", "unknown_directive", "invalid_search", "invalid_resolved", "invalid_decomposition"];
    if (reason && reasons.includes(reason as ResearchTimingRecord["assessment_invalid_reason"])) this.assessmentInvalidReason = reason as ResearchTimingRecord["assessment_invalid_reason"];
  }

  emit(summary: {
    terminalStatus: ResearchTimingRecord["terminal_status"];
    answerPosition?: ResearchTimingRecord["answer_position"];
    context?: ResearchTimingRecord["context"];
    resolution?: Pick<ResearchResolution, "status" | "stopReason" | "ledger">;
    ledger?: GapLedger;
  }): void {
    const resolution = summary.resolution;
    const ledger = resolution?.ledger ?? summary.ledger;
    const record: ResearchTimingRecord = {
      event: "research_timing",
      schema_version: 1,
      terminal_status: summary.terminalStatus,
      ...(summary.answerPosition ? { answer_position: summary.answerPosition } : {}),
      ...(this.assessmentFailureCode ? { assessment_failure_code: this.assessmentFailureCode } : {}),
      ...(this.assessmentInvalidReason ? { assessment_invalid_reason: this.assessmentInvalidReason } : {}),
      ...(this.assessmentDirective ? { assessment_directive: this.assessmentDirective } : {}),
      ...(summary.context ? { context: summary.context } : {}),
      ...(resolution ? { resolution_status: resolution.status, stop_reason: resolution.stopReason } : {}),
      execution_ms: duration(this.startedAt, this.now()),
      ...(this.resolutionMs === undefined ? {} : { resolution_ms: this.resolutionMs }),
      ...(this.firstAnswerSignalMs === undefined ? {} : { first_answer_signal_ms: this.firstAnswerSignalMs }),
      counts: {
        searches_used: ledger?.searchesUsed ?? 0,
        sources_consumed: ledger?.sourcesConsumed ?? 0,
        assessments_used: ledger?.assessmentsUsed ?? 0,
      },
      stages: this.stages,
    };
    try {
      this.sink(record);
    } catch {
      // Operational logging must never alter the research result.
    }
  }

  private async measure<T>(stage: Exclude<StageName, "synthesis">, operation: () => Promise<T>): Promise<T> {
    const started = this.now();
    try {
      const result = await operation();
      this.record(stage, started, true);
      return result;
    } catch (error) {
      this.record(stage, started, false);
      throw error;
    }
  }

  private record(stage: StageName, started: number, succeeded: boolean): void {
    const elapsed = duration(started, this.now());
    const timing = this.stages[stage];
    timing.calls += 1;
    if (succeeded) timing.succeeded += 1;
    else timing.failed += 1;
    timing.cumulative_ms += elapsed;
    timing.max_ms = Math.max(timing.max_ms, elapsed);
  }
}
