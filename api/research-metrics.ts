import { loggerResearchTimingSink, type ResearchTimingSink } from "../server/runtime/research-timing.js";
import type { Logger } from "../server/runtime/logger.js";

/** Only the Vercel runtime composes this sink; local Node execution keeps its existing log-only sink. */
export function createResearchMetricsSink(
  logger: Logger,
  emit: (name: string, value: number) => void,
): ResearchTimingSink {
  const log = loggerResearchTimingSink(logger);
  return (record) => {
    log(record);
    const duration = (name: string, value: number | undefined) => {
      if (value === undefined) return;
      try { emit(name, value); } catch { /* Metrics cannot affect research or logs. */ }
    };
    duration("research.turn.execution.wall_elapsed_ms", record.execution_ms);
    duration("research.turn.resolution.wall_elapsed_ms", record.resolution_ms);
    if (record.acquisition_wall?.calls) duration("research.turn.acquisition.span_elapsed_sum_ms", record.acquisition_wall.cumulative_ms);
    for (const [stage, name] of [
      ["search", "research.turn.search.call_elapsed_sum_ms"],
      ["extraction", "research.turn.extraction.call_elapsed_sum_ms"],
      ["assessment", "research.turn.assessment.call_elapsed_sum_ms"],
      ["synthesis", "research.turn.synthesis.call_elapsed_sum_ms"],
    ] as const) {
      const timing = record.stages[stage];
      if (timing.calls) duration(name, timing.cumulative_ms);
    }
  };
}
