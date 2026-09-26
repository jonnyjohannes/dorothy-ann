import type { Logger } from "./logger.js";

export type SelectedExtractionFailure = {
  url: string;
  rank: number;
  status: "skipped" | "failed";
  reason: string;
};

const skippedReasons = new Set(["duplicate", "unsafe_url", "blocked", "unsupported_content", "empty_content", "limit_reached"]);
const failedCodes = new Set(["fetch_failed", "timeout", "extract_failed"]);

/** No credentials, query, fragment, or suspicious path segments enter operational logs. */
export function safeSourceLocation(value: string): { url: string; host: string } | undefined {
  try {
    const location = new URL(value);
    if (!["http:", "https:"].includes(location.protocol) || location.username || location.password) return undefined;
    location.search = "";
    location.hash = "";
    if (location.pathname.length > 512 || location.pathname.split("/").some((segment) => {
      let decoded = segment;
      try { decoded = decodeURIComponent(segment); } catch { return true; }
      return segment.length > 128 || /token|secret|password|session|api[_-]?key|bearer/i.test(decoded);
    })) location.pathname = "/[redacted]";
    return { url: location.toString(), host: location.host };
  } catch { return undefined; }
}

/** Bound the values before passing anything from an extractor or search result to the shared logger. */
export function logSelectedExtractionFailure(logger: Logger, entry: SelectedExtractionFailure): void {
  if (!Number.isInteger(entry.rank) || entry.rank < 1 || entry.rank > 5) return;
  const allowed = entry.status === "skipped" ? skippedReasons : entry.status === "failed" ? failedCodes : undefined;
  if (!allowed?.has(entry.reason)) return;
  const fields = { stage: "extracting", rank: entry.rank, reason: entry.reason, ...safeSourceLocation(entry.url) };
  if (entry.status === "failed") logger.warn("extraction_failed", fields);
  else logger.info("extraction_rejected", fields);
}
