# Hobby-friendly research timing metric names

## Current State

- Status: done (local implementation on `release/v1.2.2`; no deployment/tag). Owner confirmed live `research.duration_ms` samples arrive on Hobby, but the read-only Query view locks Group By and defaults to Sum, mixing stages. Owner approved replacing the single stage-tagged name with seven fixed per-measurement names to make each stage separately browseable.
- Existing `research_timing` schema v8 and archived [`research-custom-metrics.md`](archive/research-custom-metrics.md) document the current timing/metrics boundary. The archived plan remains a record of the original deployment; this plan owns only the name migration. Production chart behavior for the new names is not yet verified.

## Decision

- Emit one of these fixed names per available timing: `research.turn.execution.wall_elapsed_ms`, `research.turn.resolution.wall_elapsed_ms`, `research.turn.acquisition.span_elapsed_sum_ms`, `research.turn.search.call_elapsed_sum_ms`, `research.turn.extraction.call_elapsed_sum_ms`, `research.turn.assessment.call_elapsed_sum_ms`, `research.turn.synthesis.call_elapsed_sum_ms`. Preserve the current values and omission rules. No `stage` attribute is required: separate names are the Hobby grouping workaround. Emit no additional copies under the legacy name; existing legacy data ages out under platform retention. Keep logs and collector contract unchanged, at most seven emissions per research turn, and metric errors nonblocking.
- `wall_elapsed` means one enclosing span; `span_elapsed_sum`/`call_elapsed_sum` mean summed per-turn elapsed times, potentially overlapping other stages or each other. Names stay under Vercel's 64-byte/allowed-character limit. Do not add subphase, per-call, URL, question, thread, provider payload or request metadata. Vercel supplies platform metadata. A Hobby Sum plot still sums multiple turns per bucket, not an average/p95 and not an additive execution breakdown.
- No deployment, environment change, dashboard edit, or production turn authorized by this code-only work.

## Handoff

- Local checks: focused metric/timing tests (13 passed), `npm run lint`, `npm run typecheck`, `npm test` (367 passed), `npm run build` (pre-existing large-chunk warnings), and `CI=1 npm run test:e2e -- --workers=2` (21 passed, one Chromium layout test flaky on first attempt but passed on retry, 10 conditional telemetry tests skipped). Initial e2e launch hit an occupied fixture server port; retry launched cleanly. `git diff --check` passed. No remote chart or deployment check was performed.
- After separately authorized deployment, owner can view each new name in Observability → Custom Metrics and set an ms display unit if offered; whether a specific Hobby graph/control is exposed must be observed, not assumed. Old name historical samples persist until retention expiry.
- Do not modify the separate active production log-navigation verification plan.

## Plan Ledger

- [x] N1 — replace the metric mapping names in the Vercel API adapter; test exact names and values, absent phases, privacy, error isolation and emission count. Update README, run focused and applicable checks, inspect status/diff, then archive this plan when local implementation is verified.

## Open Questions

- Will Hobby show each separate metric's time-series view with an ms display unit after live emission? External verification after deployment, not a local acceptance gate.
