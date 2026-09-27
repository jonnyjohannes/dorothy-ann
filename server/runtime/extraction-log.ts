import type { Logger } from "./logger.js";
import type { ExtractionFailureMetadata } from "../../src/infrastructure/extraction/safe-content-extractor.js";

export type SelectedExtractionFailure = {
  url: string;
  rank: number;
  status: "skipped" | "failed";
  reason: string;
  elapsed_ms?: number;
  metadata?: ExtractionFailureMetadata;
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
      let decoded: string;
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
  const phases = ["url_check", "dns", "fetch", "redirect", "body", "text"];
  const details = ["unsafe_url", "dns_failure", "transport_other", "deadline", "http_rejected", "redirect_blocked", "body_limit", "unsupported_content", "zero_byte_body", "no_readable_text", "short_text"];
  const metadata = entry.metadata;
  const failure_phase = metadata && phases.includes(metadata.failure_phase) ? metadata.failure_phase : "unknown";
  const failure_detail = metadata && details.includes(metadata.failure_detail) ? metadata.failure_detail : "other";
  const http_status_bucket = failure_detail === "http_rejected" && metadata && ["403", "429", "other_4xx", "5xx", "other"].includes(metadata.http_status_bucket ?? "") ? metadata.http_status_bucket : undefined;
  const elapsed_ms = typeof entry.elapsed_ms === "number" && Number.isFinite(entry.elapsed_ms) ? Math.max(0, Math.min(300_000, Math.round(entry.elapsed_ms))) : 0;
  const fields = { stage: "extracting", rank: entry.rank, reason: entry.reason, elapsed_ms, failure_phase, failure_detail,
    ...(http_status_bucket ? { http_status_bucket } : {}), ...safeSourceLocation(entry.url) };
  if (entry.status === "failed") logger.warn("extraction_failed", fields);
  else logger.info("extraction_rejected", fields);
}
