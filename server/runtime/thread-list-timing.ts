import type { ThreadListTimingSink } from "../../src/infrastructure/storage/thread-store-base.js";
import type { Logger } from "./logger.js";

/** One count-only log per list; optional Vercel metrics use fixed names without thread identifiers. */
export function createThreadListTimingSink(
  logger: Logger,
  emit?: (name: string, value: number) => void,
): ThreadListTimingSink {
  return (record) => {
    logger.info("thread_list_timing", { stage: "storage_list", ...record });
    const duration = (name: string, value: number | undefined) => {
      if (value === undefined) return;
      try { emit?.(name, value); } catch { /* Telemetry cannot affect listing. */ }
    };
    duration("threads.list.total.wall_elapsed_ms", record.total_ms);
    duration("threads.list.ids.wall_elapsed_ms", record.ids_ms);
    duration("threads.list.records.wall_elapsed_ms", record.records_ms);
    duration("threads.list.sort.wall_elapsed_ms", record.sort_ms);
  };
}
