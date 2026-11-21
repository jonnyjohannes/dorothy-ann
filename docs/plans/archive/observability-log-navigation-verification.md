# Production research-log navigation verification

## Current State

- Status: done. Deferred verification from [`client-observability.md`](client-observability.md) is complete; the Analytics and research-timing implementation shipped in `d95923a` and the `v1.2.1` release. Owner-supplied Production invocation evidence closed log navigation, and Jonny explicitly accepted the existing global `no-referrer` tradeoff. This plan closure made no Vercel-side change.
- Fixture tests verified that a turn-local collector emits sanitized `assessment_anomaly` and `research_timing` records. An earlier bounded Vercel CLI lookup had no recent matching request. Later owner-supplied Vercel invocation details show a Production `POST /api/turn` request with a platform Request ID, function route and 49.20s execution duration. The owner-supplied excerpt for that request shows its info-level `research_timing` schema-v8 summary (49.184s), two info-level `assessment_anomaly` records for a bounded rejected/truncated assessment and accepted retry, and matching debug attempt/call records. The invocation start time and duration align with the excerpt, verifying per-request function navigation and log correlation for this example. Do not retain the Request ID, host, source URLs, user agent or request content in this plan. This does not establish an Analytics-to-request join, Observability Plus entitlement, per-function latency charts, or chart unit controls.
- Owner reports the separately shipped fixed-name research stage metrics are flowing in Vercel; treat their delivery check as complete.

## Decision

- The ordinary owner-initiated research request supplied the read-only invocation and sanitized log evidence needed for L1; retain only bounded conclusions, not raw logs or Request ID. Do not claim an Analytics-to-request join or generalize one successful invocation to every turn.
- Jonny accepted the deployed `no-referrer` policy as-is, including its effect on unrelated outgoing navigation/embeds. Do not change it without a separately scoped privacy review and approval.

## Handoff

- `research_timing` schema v8 is an info-level record; `assessment_anomaly` emits only for rejected/retried or ≥10s attempts. An absence of anomaly on an ordinary turn is expected. Concurrent cumulative timings are not wall-clock partitions. A narrow request window and Vercel's platform Request ID are the only candidate grouping keys; no prompt, thread/source ID, raw URL, provider text or credential belongs in notes.
- L1 is complete from the owner-supplied invocation view and matching log excerpt; R1 is complete by explicit owner acceptance. The plan is archived, with no dashboard, referrer, or deployment setting change. Any future Vercel-side action requires an exact command, target, effect and separate explicit approval.

## Plan Ledger

- [x] L1 — owner-supplied Vercel Production invocation view shows a platform Request ID, function route and execution duration matching the associated `research_timing` and conditional `assessment_anomaly` excerpt; this verifies function invocation navigation and per-request log correlation for one real turn. No application correlation ID or Analytics-to-request join is claimed; only sanitized observations are recorded here.
- [x] R1 — Jonny explicitly accepted the deployed global `no-referrer` tradeoff for unrelated outbound links/embeds. No narrower policy is requested; any later change is separate scope.

## Open Questions

- The project exposes a request-level function invocation view with duration and Request ID; per-function latency time-series charts or Observability Plus entitlement were not established by this check and are not an acceptance gate for L1.
- No blocking questions. Jonny accepted the outbound-referrer tradeoff. Per-function latency time-series charts and Observability Plus entitlement remain unverified external capabilities, not claims made by this plan.
