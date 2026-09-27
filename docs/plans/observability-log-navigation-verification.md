# Production research-log navigation verification

## Current State

- Status: active, deferred verification from [`client-observability.md`](archive/client-observability.md). Analytics-only instrumentation and the server timing implementation shipped in Production from `d95923a`. One authenticated `/settings` Analytics beacon was observed with a normalized URL and empty referrer; this does not identify a server invocation.
- Fixture tests verified that a turn-local collector emits sanitized `assessment_anomaly` and `research_timing` records. A bounded read-only Vercel CLI lookup found no matching research-timing request in the available recent serverless results. The project's Observability Plus entitlement, dashboard function view, and platform Request ID grouping have not been verified. The CLI can list bounded requests, but it is not evidence of a per-invocation UI link.

## Decision

- Wait for an ordinary owner-initiated research request. Inspect its narrow time window and the associated `POST /api/turn` invocation **read-only**; verify whether the project exposes Function Logs and whether platform Request ID groups the sanitized info-level summary and any emitted anomaly. If the feature is unavailable, record the bounded Logs lookup as the supported fallback. Do not create a research turn merely for telemetry, enable verbose logging, copy raw logs, or claim an Analytics-to-request join.
- Keep the `no-referrer` policy's effect on unrelated outgoing navigation/embeds visible as an accepted deployment tradeoff pending explicit owner review; any narrower alternative requires its own privacy evidence and approval.

## Handoff

- `research_timing` schema v8 is an info-level record; `assessment_anomaly` emits only for rejected/retried or ≥10s attempts. An absence of anomaly on an ordinary turn is expected. Concurrent cumulative timings are not wall-clock partitions. A narrow request window and Vercel's platform Request ID are the only candidate grouping keys; no prompt, thread/source ID, raw URL, provider text or credential belongs in notes.
- No Vercel-side mutation is authorized by this plan. Any future setting/deployment action requires an exact command, target, effect and separate explicit approval.

## Plan Ledger

- [ ] L1 — read-only verification of dashboard entitlement and a real research invocation's `research_timing`/conditional `assessment_anomaly` visibility and platform Request ID grouping; record the observed fallback when unavailable, without capturing sensitive data. Close this plan after the result is documented.

## Open Questions

- Does the project's dashboard expose per-function latency and invocation navigation, or only bounded Logs search?
- Does the owner accept the already-deployed global `no-referrer` tradeoff for outbound navigation and embeds?
