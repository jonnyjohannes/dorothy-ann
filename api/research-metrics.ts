import { loggerResearchTimingSink, type ResearchTimingSink } from "../server/runtime/research-timing.js";
import type { Logger } from "../server/runtime/logger.js";

/** Only the Vercel runtime composes this sink; local Node execution keeps its existing log-only sink. */
export function createResearchMetricsSink(
  logger: Logger,
  emit: (name: string, value: number, attributes: Record<string, string>) => void,
): ResearchTimingSink {
  const log = loggerResearchTimingSink(logger);
  return (record) => {
    log(record);
    const duration = (stage: string, value: number | undefined) => {
      if (value === undefined) return;
      try { emit("research.duration_ms", value, { stage }); } catch { /* Metrics cannot affect research or logs. */ }
    };
    duration("execution", record.execution_ms);
    duration("resolution", record.resolution_ms);
    if (record.acquisition_wall?.calls) duration("acquisition_wall", record.acquisition_wall.cumulative_ms);
    for (const stage of ["search", "extraction", "assessment", "synthesis"] as const) {
      const timing = record.stages[stage];
      if (timing.calls) duration(stage, timing.cumulative_ms);
    }
  };
}
