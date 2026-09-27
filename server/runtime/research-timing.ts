import type { GapLedger, ResearchResolution } from "../../src/domain/types.js";
import { viableEvidenceSourceCount } from "../../src/domain/knowledge.js";
import type { EvidenceYieldRequest } from "../../src/application/evidence-acquirer.js";
import type { ContentExtractor } from "../../src/ports/extraction.js";
import type { AssessmentAttemptObservation, LLMProvider } from "../../src/ports/llm.js";
import type { SearchProvider } from "../../src/ports/providers.js";
import type { Logger } from "./logger.js";

export interface StageTiming {
  calls: number;
  succeeded: number;
  failed: number;
  cumulative_ms: number;
  max_ms: number;
  first_output_ms?: number;
  remaining_after_first_output_ms?: number;
}

export interface ResearchTimingRecord {
  event: "research_timing";
  schema_version: 8;
  terminal_status: "completed" | "failed" | "interrupted" | "executor_error";
  answer_position?: "initial" | "follow_up";
  assessment_failure_code?: "provider_bad_request" | "provider_rate_limited" | "provider_unavailable" | "provider_failed" | "provider_interrupted" | "assessment_invalid_response";
  assessment_invalid_reason?: "empty_response" | "invalid_json" | "missing_directive" | "unknown_directive" | "invalid_search_query" | "invalid_resolved" | "invalid_decomposition";
  assessment_directive?: "resolved" | "search" | "decompose";
  assessment_directives?: Array<"resolved" | "search" | "decompose">;
  context?: {
    turns: number;
    known_sources: number;
    evidence_packs: number;
    evidence_sources: number;
  };
  assessment_profile: {
    provider_attempts: number;
    retried_calls: number;
    rejected_attempts: number;
    failed_attempts: number;
    input_chars_max: number;
    input_tokens_total: number;
    output_tokens_total: number;
    token_usage_reported: number;
    slowest_attempt_ms: number;
    parse_ms_total: number;
    validation_ms_total: number;
    accepted_observations: number;
    provider_ms_total: number;
  };
  evidence_yield: {
    requests: EvidenceYieldRequest[];
    distinct_viable_root_ids?: number;
  };
  resolution_status?: ResearchResolution["status"];
  stop_reason?: ResearchResolution["stopReason"];
  execution_ms: number;
  resolution_ms?: number;
  acquisition_wall?: StageTiming;
  search_subphases?: { http?: StageTiming; json_normalization?: StageTiming };
  extraction_subphases?: { safety?: StageTiming; http?: StageTiming; body?: StageTiming; text?: StageTiming };
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
const boundedCount = (value: number, maximum: number): number => Number.isSafeInteger(value) ? Math.max(0, Math.min(maximum, value)) : 0;
const boundedYield = (request: EvidenceYieldRequest): EvidenceYieldRequest => ({
  requested: boundedCount(request.requested, 5), returned: boundedCount(request.returned, 5),
  normalized_unique: boundedCount(request.normalized_unique, 5),
  invalid_discarded: boundedCount(request.invalid_discarded, 5), duplicate_discarded: boundedCount(request.duplicate_discarded, 5),
  selected: boundedCount(request.selected, 5), reused: boundedCount(request.reused, 5), unselected: boundedCount(request.unselected, 5),
  viable: boundedCount(request.viable, 3), empty: boundedCount(request.empty, 5),
  failed: boundedCount(request.failed, 5), fetch_failed: boundedCount(request.fetch_failed, 5),
  timeout: boundedCount(request.timeout, 5), extract_failed: boundedCount(request.extract_failed, 5),
  skipped_other: boundedCount(request.skipped_other, 5),
});
const duration = (started: number, finished: number): number => {
  const value = finished - started;
  return Number.isFinite(value) && value > 0 ? Math.min(5_400_000, Math.round(value)) : 0;
};

export function logAssessmentAnomaly(logger: Logger, observation: AssessmentAttemptObservation): void {
  if (observation.outcome !== "rejected" && observation.attempt !== 2 && observation.elapsedMs < 10_000) return;
  const shapes: AssessmentAttemptObservation["outputShape"][] = ["incomplete_outer_json", "complete_no_directive", "complete_invalid_directive"];
  const reasons: AssessmentAttemptObservation["reason"][] = ["empty_response", "invalid_json", "missing_directive", "unknown_directive", "invalid_search_query", "invalid_resolved", "invalid_decomposition", "provider_error"];
  const stops: AssessmentAttemptObservation["stopReason"][] = ["end_turn", "max_tokens", "refusal", "other", "unknown"];
  try {
    logger.info("assessment_anomaly", {
      stage: "assessing", attempt: observation.attempt === 2 ? 2 : 1,
      outcome: observation.outcome === "accepted" || observation.outcome === "rejected" ? observation.outcome : "failed",
      elapsed_ms: boundedCount(observation.elapsedMs, 300_000), parse_ms: boundedCount(observation.parseMs, 300_000),
      max_output_tokens: boundedCount(observation.maxOutputTokens, 1_600),
      input_chars: boundedCount(observation.inputChars, 2_000_000),
      accepted_observations: boundedCount(observation.acceptedObservations ?? 0, 24),
      stop_reason: stops.includes(observation.stopReason) ? observation.stopReason : "unknown",
      ...(reasons.includes(observation.reason) ? { reason: observation.reason } : {}),
      ...(shapes.includes(observation.outputShape) ? { output_shape: observation.outputShape } : {}),
    });
  } catch { /* Diagnostic logging cannot alter a turn. */ }
}

export function loggerResearchTimingSink(logger: Logger): ResearchTimingSink {
  return (record) => logger.info(record.event, { stage: "resolving", ...record });
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
  private readonly acquisitionWall = emptyStage();
  private readonly searchSubphases = { http: emptyStage(), json_normalization: emptyStage() };
  private readonly extractionSubphases = { safety: emptyStage(), http: emptyStage(), body: emptyStage(), text: emptyStage() };
  private resolutionMs: number | undefined;
  private emitted = false;
  private firstAnswerSignalMs: number | undefined;
  private assessmentFailureCode: ResearchTimingRecord["assessment_failure_code"];
  private assessmentDirective: ResearchTimingRecord["assessment_directive"];
  private readonly assessmentDirectives: NonNullable<ResearchTimingRecord["assessment_directives"]> = [];
  private assessmentInvalidReason: ResearchTimingRecord["assessment_invalid_reason"];
  private readonly evidenceYield: EvidenceYieldRequest[] = [];
  private readonly assessmentProfile: ResearchTimingRecord["assessment_profile"] = {
    provider_attempts: 0, retried_calls: 0, rejected_attempts: 0, failed_attempts: 0,
    input_chars_max: 0, input_tokens_total: 0, output_tokens_total: 0, token_usage_reported: 0,
    slowest_attempt_ms: 0, parse_ms_total: 0, validation_ms_total: 0, accepted_observations: 0, provider_ms_total: 0,
  };

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
    const collectorEmitted = () => this.emitted;
    const assess = (input: Parameters<LLMProvider["assessResearch"]>[0]) => this.measure("assessment", () => provider.assessResearch(input));
    const recordSynthesis = (started: number, succeeded: boolean) => {
      if (!this.emitted && synthesis.first_output_ms !== undefined) synthesis.remaining_after_first_output_ms = Math.max(0, duration(started, now()) - synthesis.first_output_ms);
      this.record("synthesis", started, succeeded);
    };
    return {
      assessResearch: assess,
      async *synthesizeResearch(input) {
        const started = now();
        let succeeded = false;
        try {
          for await (const part of provider.synthesizeResearch(input)) {
            if (!collectorEmitted() && synthesis.first_output_ms === undefined) synthesis.first_output_ms = duration(started, now());
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
      if (!this.emitted) this.resolutionMs = duration(started, this.now());
    }
  }

  markFirstAnswerSignal(): void {
    if (!this.emitted) this.firstAnswerSignalMs ??= duration(this.startedAt, this.now());
  }

  markAssessmentDirective(value: unknown): void {
    if (this.emitted) return;
    if (value === "resolved" || value === "search" || value === "decompose") {
      this.assessmentDirective = value;
      if (this.assessmentDirectives.length < 18) this.assessmentDirectives.push(value);
    }
  }

  markAssessmentFailure(error: unknown): void {
    if (this.emitted) return;
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
    const allowed: ResearchTimingRecord["assessment_failure_code"][] = ["provider_bad_request", "provider_rate_limited", "provider_unavailable", "provider_failed", "provider_interrupted", "assessment_invalid_response"];
    if (code && allowed.includes(code as ResearchTimingRecord["assessment_failure_code"])) this.assessmentFailureCode = code as ResearchTimingRecord["assessment_failure_code"];
    const reason = error && typeof error === "object" && "reason" in error && typeof error.reason === "string" ? error.reason : undefined;
    const reasons: ResearchTimingRecord["assessment_invalid_reason"][] = ["empty_response", "invalid_json", "missing_directive", "unknown_directive", "invalid_search_query", "invalid_resolved", "invalid_decomposition"];
    if (reason && reasons.includes(reason as ResearchTimingRecord["assessment_invalid_reason"])) this.assessmentInvalidReason = reason as ResearchTimingRecord["assessment_invalid_reason"];
  }

  markAssessmentAttempt(observation: AssessmentAttemptObservation): void {
    if (this.emitted) return;
    const profile = this.assessmentProfile;
    profile.provider_attempts = boundedCount(profile.provider_attempts + 1, 18);
    if (observation.attempt === 2) profile.retried_calls = boundedCount(profile.retried_calls + 1, 9);
    if (observation.outcome === "rejected") profile.rejected_attempts = boundedCount(profile.rejected_attempts + 1, 18);
    if (observation.outcome === "failed") profile.failed_attempts = boundedCount(profile.failed_attempts + 1, 18);
    profile.input_chars_max = Math.max(profile.input_chars_max, boundedCount(observation.inputChars, 2_000_000));
    if (observation.inputTokens !== undefined || observation.outputTokens !== undefined) profile.token_usage_reported = boundedCount(profile.token_usage_reported + 1, 18);
    profile.input_tokens_total = boundedCount(profile.input_tokens_total + boundedCount(observation.inputTokens ?? 0, 1_000_000), 18_000_000);
    profile.output_tokens_total = boundedCount(profile.output_tokens_total + boundedCount(observation.outputTokens ?? 0, 1_000_000), 18_000_000);
    profile.slowest_attempt_ms = Math.max(profile.slowest_attempt_ms, boundedCount(observation.elapsedMs, 300_000));
    profile.parse_ms_total = boundedCount(profile.parse_ms_total + boundedCount(observation.parseMs, 300_000), 5_400_000);
    profile.provider_ms_total = boundedCount(profile.provider_ms_total + Math.max(0, boundedCount(observation.elapsedMs, 300_000) - boundedCount(observation.parseMs, 300_000)), 5_400_000);
    profile.accepted_observations = boundedCount(profile.accepted_observations + boundedCount(observation.acceptedObservations ?? 0, 24), 432);
  }

  markExtractionSubphase(phase: "safety" | "http" | "body" | "text", elapsedMs: number): void {
    if (this.emitted) return;
    this.recordStage(this.extractionSubphases[phase], boundedCount(Math.round(elapsedMs), 300_000), true);
  }

  markSearchSubphase(phase: "http" | "json_normalization", elapsedMs: number, succeeded: boolean): void {
    if (this.emitted) return;
    this.recordStage(this.searchSubphases[phase], boundedCount(Math.round(elapsedMs), 300_000), succeeded);
  }

  markAcquisitionWall(elapsedMs: number, succeeded: boolean): void {
    if (this.emitted) return;
    this.recordStage(this.acquisitionWall, boundedCount(Math.round(elapsedMs), 300_000), succeeded);
  }

  markAssessmentValidation(elapsedMs: number): void {
    if (this.emitted) return;
    this.assessmentProfile.validation_ms_total = boundedCount(this.assessmentProfile.validation_ms_total + boundedCount(elapsedMs, 300_000), 2_700_000);
  }

  markEvidenceYield(requests: EvidenceYieldRequest[]): void {
    if (this.emitted) return;
    for (const request of requests) if (this.evidenceYield.length < 3) this.evidenceYield.push(boundedYield(request));
  }

  emit(summary: {
    terminalStatus: ResearchTimingRecord["terminal_status"];
    answerPosition?: ResearchTimingRecord["answer_position"];
    context?: ResearchTimingRecord["context"];
    resolution?: Pick<ResearchResolution, "status" | "stopReason" | "ledger" | "knowledge">;
    ledger?: GapLedger;
  }): void {
    if (this.emitted) return;
    this.emitted = true;
    try {
      const resolution = summary.resolution;
      const ledger = resolution?.ledger ?? summary.ledger;
      const distinctRootIds = resolution && viableEvidenceSourceCount(resolution.knowledge);
      const record: ResearchTimingRecord = {
        event: "research_timing",
        schema_version: 8,
        terminal_status: summary.terminalStatus,
        ...(summary.answerPosition ? { answer_position: summary.answerPosition } : {}),
        ...(this.assessmentFailureCode ? { assessment_failure_code: this.assessmentFailureCode } : {}),
        ...(this.assessmentInvalidReason ? { assessment_invalid_reason: this.assessmentInvalidReason } : {}),
        ...(this.assessmentDirective ? { assessment_directive: this.assessmentDirective, assessment_directives: [...this.assessmentDirectives] } : {}),
        ...(summary.context ? { context: summary.context } : {}),
        assessment_profile: { ...this.assessmentProfile },
        evidence_yield: {
          requests: this.evidenceYield.map(boundedYield),
          ...(distinctRootIds === undefined ? {} : { distinct_viable_root_ids: boundedCount(distinctRootIds, 24) }),
        },
        ...(resolution ? { resolution_status: resolution.status, stop_reason: resolution.stopReason } : {}),
        execution_ms: duration(this.startedAt, this.now()),
        ...(this.resolutionMs === undefined ? {} : { resolution_ms: this.resolutionMs }),
        ...(this.acquisitionWall.calls ? { acquisition_wall: { ...this.acquisitionWall } } : {}),
        ...(this.searchSubphases.http.calls || this.searchSubphases.json_normalization.calls ? { search_subphases: {
          ...(this.searchSubphases.http.calls ? { http: { ...this.searchSubphases.http } } : {}),
          ...(this.searchSubphases.json_normalization.calls ? { json_normalization: { ...this.searchSubphases.json_normalization } } : {}),
        } } : {}),
        ...(Object.values(this.extractionSubphases).some((phase) => phase.calls) ? { extraction_subphases: Object.fromEntries(
          Object.entries(this.extractionSubphases).filter(([, timing]) => timing.calls),
        ) as ResearchTimingRecord["extraction_subphases"] } : {}),
        ...(this.firstAnswerSignalMs === undefined ? {} : { first_answer_signal_ms: this.firstAnswerSignalMs }),
        counts: {
          searches_used: ledger?.searchesUsed ?? 0,
          sources_consumed: ledger?.sourcesConsumed ?? 0,
          assessments_used: ledger?.assessmentsUsed ?? 0,
        },
        stages: this.stages,
      };
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
    if (this.emitted) return;
    this.recordStage(this.stages[stage], elapsed, succeeded);
  }

  private recordStage(timing: StageTiming, elapsed: number, succeeded: boolean): void {
    timing.calls = boundedCount(timing.calls + 1, 36);
    if (succeeded) timing.succeeded = boundedCount(timing.succeeded + 1, 36);
    else timing.failed = boundedCount(timing.failed + 1, 36);
    const boundedElapsed = boundedCount(elapsed, 300_000);
    timing.cumulative_ms = boundedCount(timing.cumulative_ms + boundedElapsed, 10_800_000);
    timing.max_ms = Math.max(timing.max_ms, boundedElapsed);
  }
}
