import type { IsoTimestamp } from "./types.js";

/** Durable thread records and deletion tombstones expire seven days after activity. */
export const THREAD_RETENTION_MS = 7 * 86_400_000;

export function threadExpiryAt(activity: IsoTimestamp): IsoTimestamp {
  return new Date(Date.parse(activity) + THREAD_RETENTION_MS).toISOString() as IsoTimestamp;
}
