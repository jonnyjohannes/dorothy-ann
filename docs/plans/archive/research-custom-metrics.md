# Research custom metrics

## Current State

- Status: done (local implementation on `release/v1.2.2`; no deployment/tag). The owner requested code-only emission of the existing research timings to Vercel Observability → Custom Metrics on this branch. The project dashboard is on Hobby and displays the Custom Metrics empty state and `metric()` example; grouped Query/Notebook access and live delivery have not been verified.
- Existing `research_timing` schema v8 and info-level logs remain the diagnostic source for individual turns. The collector emits once per terminal/interrupted research execution, before terminal SSE. The Vercel Node adapter is `api/index.ts`. Separate active `observability-log-navigation-verification.md` tracks live log grouping; do not fold that check into this plan.

## Decision

- At the Vercel API adapter only, consume the current `ResearchTimingRecord` and emit `research.duration_ms` numeric samples with a fixed `stage` attribute: execution, resolution (if measured), acquisition_wall (if measured), search, extraction, assessment, synthesis (only stages with calls). `execution` and `resolution` are wall spans; repeated stage values are cumulative work and can overlap; `acquisition_wall` sums measured acquisition spans within resolution. Never sum them into a partition or claim browser paint. Keep names and attributes fixed and no question, IDs, URL, provider payload, thread data, or request attributes. Vercel attaches its own platform request metadata.
- Retain the existing info log independently of metric success; fail closed/nonblocking on metric errors. Keep local Node/fixture app unaffected and package imports out of domain/application/browser code. No new timers, changes to SSE, retries, provider calls, or existing log schema. At most seven samples per turn; each is a metered Observability event. No deployment or Vercel-side change authorized.

## Handoff

- Vercel docs: https://vercel.com/docs/observability/custom-metrics and https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#metric. Dashboard screenshot proves the Custom Metrics entry point on Hobby, not entitlement to Query grouping or live metric delivery. After a separately approved deployment, an ordinary research turn and dashboard read-only check can verify discovery and chart behavior. No synthetic production turn solely for telemetry.
- Local verification: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (365 passing at the full-suite run; the final additional unit test passed focused), `npm run build` (pre-existing third-party annotation and large-chunk warnings), `CI=1 npm run test:e2e -- --workers=2` (22 passed, 10 opt-in telemetry cases skipped), `git diff --check`. No Production provider/dashboard verification; no deploy or Vercel-side change.
- Other untracked planning files in this checkout are not part of this work.

## Plan Ledger

- [x] M1 — install `@vercel/functions`; map existing timing summary to fixed-name, fixed-stage numeric samples in the Vercel adapter while retaining logs and safe no-op failure semantics. Unit-test missing stages, stage values, error isolation and privacy; document dashboard workflow and limitations. Run focused and applicable repo checks and inspect diff/status.

## Open Questions

- Does the Hobby Custom Metrics view chart by the `stage` attribute, or does Query grouping require Observability Plus? Verify only after a deployment; do not promise chart controls before observation.
