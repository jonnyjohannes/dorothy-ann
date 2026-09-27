# Research failure diagnostics — extraction yield and assessment latency

## Current State

- Status: implementing
- Verification: P1 focused tests (44), P2 timing/app tests (16), lint/typecheck, 337 tests, build, bundle privacy scan and diff check passed; browser suite blocked by reused non-fixture local server (2/8 passed)
- Owner: Jonny
- Executor: MUSCLE worker on `release/v1.2.1`
- Last updated: 2026-09-27
- Current focus: deploy the smallest selected-source failure classification and document how to use the assessment telemetry already in production.
- Next action: complete orientation/archive bookkeeping. Operator Vercel smoke follows deployment and is not a prerequisite to coding.
- Branch / PR / session: `release/v1.2.1` / none

## Abstract

Add bounded, server-only detail to existing selected-source failure logs so the operator can distinguish HTTP rejection, transport/deadline, and content-admission failures. Document how the already-shipped assessment logs separate repeated calls and retries from provider time and local work. Keep one operational plan for the shared Vercel lookup; any extractor, prompt, or provider fix requires later evidence and a separate decision.

## Flow

```text
Brave results ─▶ rank/budget selection ─▶ safe URL/DNS ─▶ HTTP/redirect/body ─▶ text admission
                      │                    │                  │                    │
                      │                    └──── fixed phase/outcome + elapsed ─────┤
                      └── per-request counts ───────────────────────────────────────┤
                                                                                      ▼
assessor input ─▶ envelope ─▶ provider attempt(s) ─▶ parse ─▶ local validation ─▶ Vercel invocation logs
                      │              │                 │                │           │
                      └──── bounded size + ordinals + timings / per-turn summary ────┘
```

The Vercel invocation Request ID (dashboard grouping), not a logged question/turn/source ID, ties the `research_timing` summary to selected-source failures and optional debug attempt records. Successful fetch or parse is **not** equivalent to admitted evidence; separate HTTP fetch outcomes from text admission and final root evidence counts.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] P1 — Classify selected extraction nonviability
  - Deliverable: enrich existing `extraction_failed` / `extraction_rejected` events with bounded `elapsed_ms`, `failure_phase`, `failure_detail` and, for HTTP rejection, `http_status_bucket`. Keep one event per selected nonviable attempt, unchanged rank/reason/URL redaction, outcome and budgets; no successful-page event, raw exception or extra fetch.
  - Verify: extractor/acquirer/logger fixtures for HTTP 403/429/other 4xx/5xx, transport and DNS failure, outer deadline at each phase, redirect failure, body limit, unsupported content, zero-byte response, no readable text and short text; assert no duplicate/late event, observer safety, security guards and unchanged result.
  - Evidence: focused extractor/acquirer/logger suite 44 tests passed (including joined log fixture); lint and typecheck passed. Outer winner-only observer and fixed/allowlisted metadata leave extraction outcomes unchanged.
- [x] P2 — Document assessment triage using shipped telemetry
  - Deliverable: README decision guide for v7 info-level summary and existing debug `assessment_call` / `assessment_attempt` / `assessment_decision`; explain call vs attempt vs retry, cumulative vs wall timing, input token availability and size correlation without claiming prompt causality. **No assessment code or schema changes in this plan.**
  - Verify: compare the redacted v6/v7 sample interpretations to documented fields and existing tests; ensure no real input, identifiers or provider text enter the runbook.
  - Evidence: README field/ordinal guide reconciled with redacted v6/v7 descriptions and existing research-timing/app tests (16 passed); no assessment code/schema touched.
- [x] P3 — Vercel lookup and verification
  - Deliverable: README procedure for production deployment/time window, `POST /api/turn` and `research_timing` filter, Vercel Request ID grouping, inspection of selected failures in the same invocation, and temporary `LOG_LEVEL=debug` redeploy/reproduction/return to `info` if assessment details are needed. No new log store, auto-alert, flag, or app correlation ID.
  - Verify: fixture log-format/privacy checks; lint, typecheck, full tests, build, applicable isolated browser suite, client bundle privacy check, `git diff --check`, git status. Jonny verifies dashboard lookup on a new deployment; if inaccessible, record external pending rather than block local checks.
  - Evidence: README Vercel procedure; 337 tests, lint, typecheck, build, bundle privacy scan, `git diff --check` passed. `npm run test:e2e`: 2/8 passed, 6 failed on Unlock rather than prompt because Playwright reused an existing non-fixture server on port 8787 (`/api/health` lacked fixtureMode); isolated fixture browser suite not feasible without changing the running server. External production Request ID grouping pending Jonny.

## Desired Outcome

Given a failed research invocation in the Vercel dashboard, Jonny can find its one `research_timing` record, inspect its selected-source nonviable events and, when needed, its same-invocation debug assessment records. Extraction failures separate rejection, transport, deadline, body/content and no-text causes. Slow assessment can be assigned to more calls/retries, provider time, input/output size, or local work—or be explicitly marked unmeasured. These are triage classifications, not claims of causal proof.

## Current Reality

- The 2026-09-26 samples contain three Reddit `timeout` events at one instant and three fast-looking CNN/NYT `fetch_failed` events. Same timestamp does not prove start time or failure phase; neither event includes elapsed time, HTTP status class, or transport phase. These source traces alone cannot establish prevalence or turn outcome.
- A redacted slow-turn `research_timing` schema-v6 record reports 30,453ms execution, 24,451ms resolution, one 22,872ms assessment call (about 75% of total, 94% of resolution), 733ms search, four extraction returns with 1,425ms *cumulative* / 547ms maximum, and 5,991ms synthesis. Its four selected sources yielded two viable and two `fetch_failed`; it finished `sufficient`. This localizes the major wall-time bucket to assessment, **not** the reason for it: v6 has no attempt/profile details.
- A later schema-v7 turn finished in 28,746ms: 21,302ms resolution plus 7,430ms synthesis. It performed two searches (1,428ms cumulative) and seven selected extractions (11,121ms cumulative, 8,000ms maximum; first search yielded two viable and one timeout/one fetch failure, second yielded three viable). Overlapping extraction durations cannot be summed as wall time; the 8s timeout is a real contributor. Two accepted assessment calls took 10,416ms cumulative (slowest 7,579ms, roughly 36% of execution / 49% of resolution by workload duration); the provider reported 41,389 input tokens *across* two attempts and max 109,398 input characters in one attempt. `provider_attempts: 2`, `retried_calls: 0`, `rejected_attempts: 0`, `parse_ms_total: 1` and `validation_ms_total: 3` rule out retries and local parsing/validation as material measured contributors **for this turn**. They do not prove that prompt length caused provider latency; per-attempt debug records would show size, timing and depth by call. It resolved after `search` then `resolved` with five viable root IDs. As in v6, `first_output_ms` measures synthesis iteration, not when answer text reached the browser; `first_answer_signal_ms` occurs near execution end.
- `SafeContentExtractor` (`src/infrastructure/extraction/safe-content-extractor.ts`) returns provider-neutral `failed`/`skipped` outcomes. `fetch_failed` collapses HTTP non-2xx, body limit and non-AbortError exceptions. The outer 8s default `Promise.race` can win while inner DNS/fetch/cleanup continues; the visible event currently cannot attribute the slow step. Do not log late inner outcomes as if they won.
- `EvidenceAcquirer` (`src/application/evidence-acquirer.ts`) selects up to three ranked attempts per request, then conditionally charged backfill for sparse root evidence. It logs only selected nonviable outcomes via the callback. `research_timing.evidence_yield.requests` counts selected, viable, empty, failed and unselected per request; `stages.extraction.succeeded` means the extractor *returned*, not that its page was viable. Concurrent stage cumulative times are not wall time.
- `server/runtime/extraction-log.ts` logs sanitized URL/host, rank and an allowlisted reason at info (skips) or warn (failures); the URL path can still be identifying. Current `research_timing` schema v7 at info gives per-turn stage timings and `assessment_profile`, now demonstrated on a supplied slow turn. Debug has `assessment_call`, `assessment_attempt` (attempt 1/2, elapsed, input characters, cap, usage when reported, stop reason, parse time, outcome), `assessment_decision` (local validation), and bounded transport diagnostics; see README operational logs and archived two-source P17–P18. Anthropic starts attempt timing *after* envelope construction. No debug records were supplied for this turn.
- README already documents the Vercel `POST /api/turn` + `research_timing` filter and dashboard Request ID grouping. This plan tests and extends that path rather than inventing an identifier or logging questions. The archived two-source plan records temporary extraction probes removed in P17; do not mistake them for current instrumentation.

## Scope

### Goals

- Separate selected extraction failure phases and wall duration without altering selection or extraction results.
- Test the assessment baseline on real slow-turn summaries before adding redundant telemetry.
- Make the minimal Vercel dashboard retrieval procedure reproducible for Jonny.

### Non-goals

- Retrying origins, modifying user-agent/TLS settings, bypassing paywalls or challenges, rendering scripts, changing parser, evidence admission, search rank/fuel, provider model, prompt or assessment timeout.
- Capturing request text, full URL query, provider payload/error, page HTML, response headers, personal identifiers, or a per-turn app correlation ID.
- New SaaS observability, alerts, distributed tracing, persistent log storage, or logging every successful extracted page.

## Decisions

- **One plan for diagnosis, another only after results for fixes** — two symptoms share Vercel retrieval, safety rules, and a research-turn timing summary; their eventual fixes may not share a cause.
- **Keep `LOG_LEVEL` as the only control** — info carries one summary plus selected nonviability, debug already adds assessment attempt detail. Vercel grouping is the default join mechanism; no raw turn ID or extra application token in console.
- **No new assessment telemetry now** — the v7 sample already distinguishes two accepted provider attempts, zero retries, negligible local parsing/validation and a simultaneous extraction timeout. Use existing per-call debug records if prompt-size correlation is needed. Revisit new timers only after an evidenced gap and separate approval.
- **Report the winning outcome once** — time and fixed phase classification must follow the extractor's returned result, especially under the outer race. Do not move network or DNS work out of the existing bounded/SSRF-checked path or wait for a late loser to enrich a log.
- **Classify, don't infer** — HTTP status class is not evidence of anti-bot blocking; timeout may include DNS, fetch, body, parsing or cleanup unless the measured boundary proves otherwise. The v7 sample shows no assessment retry and negligible local parsing/validation, but one 8s extraction timeout also contributed to resolution. `inputChars` is not tokens or proof the prompt caused latency; compare per-attempt size and duration before revising prompts.

## Detailed Plan

### Selected extraction

Instrument only the concrete `SafeContentExtractor` and existing server-side nonviable log path. Fixed `failure_phase` values: `url_check`, `dns`, `fetch`, `redirect`, `body`, `text`, `unknown`. Fixed `failure_detail` values: `unsafe_url`, `dns_failure`, `transport_other`, `deadline`, `http_rejected`, `redirect_blocked`, `body_limit`, `unsupported_content`, `zero_byte_body`, `no_readable_text`, `short_text`, `other`. Use `http_status_bucket` only for rejected HTTP responses: `403`, `429`, `other_4xx`, `5xx`, `other`; never a raw status, header or caught error. Classify DNS separately only when safe from a typed failure; do not parse arbitrary exception messages to infer TLS/connection causes. Every selected nonviable event gets its existing `reason`, plus bounded monotonic `elapsed_ms` (0–300,000) and the safest known fixed phase/detail. Missing detail falls back to `unknown` / `other`. For completed 2xx HTML/plain-text pages that still become `empty_content`, distinguish zero-byte body, no extracted text, and nonempty text below the existing 120-character floor; these are extractor observations, not claims about the origin's article. An outer timeout reports the last phase reached, not the root cause.

Join concrete extractor metadata to the existing selected-outcome callback within one server execution (an in-memory source key may be used, but never logged). The callback remains provider-neutral and must still log generic cases caught/normalized by `EvidenceAcquirer`; the concrete path must not emit a duplicate event. Capture only the winning extraction outcome and fixed metadata after the outer race; exclude late inner results. Keep `ExtractionOutcome`, provider-neutral port signatures, budgets, HTTP/SSE/durable contracts and `research_timing` schema v7 unchanged. Existing `safeSourceLocation` still redacts paths/queries. Guard observer errors, retain the existing URL/DNS/redirect validation and timeout, and do not refetch or reread a body. If preserving one-event/no-late-outcome semantics requires changing extraction execution behavior, stop and amend the plan.

### Assessing

Document existing `research_timing` fields: `stages.assessment.calls/max_ms/cumulative_ms`, `assessment_profile.provider_attempts/retried_calls/slowest_attempt_ms/input_chars_max/input_tokens_total/output_tokens_total/token_usage_reported/parse_ms_total/validation_ms_total`, `resolution_ms`, and `execution_ms`. With debug, compare each `assessment_call.elapsed_ms` to `assessment_attempt.elapsedMs` by `call` ordinal and inspect `assessment_decision.validationMs` separately (validation happens after the provider call). Two attempts can account for one outer call; repeated assessor calls can reflect recursive research rather than a provider retry. Missing usage stays missing; zero is not a substitute for provider token data. No new timer, prompt change or assessment schema bump here.

### Operator lookup

In Vercel Logs select the production deployment and a narrow UTC time window; filter `POST /api/turn` (confirm actual function route), search `research_timing`, open the slow/sparse entry and inspect other console lines under its function Request ID. At `info`, search `extraction_failed` and `extraction_rejected` within that invocation; use reason/phase/HTTP bucket and elapsed against per-request yield, without matching by URL alone. For latency, compare the summary first; if inconclusive, temporarily deploy `LOG_LEVEL=debug`, reproduce a *new* turn, and inspect `assessment_call`, `assessment_attempt`, `assessment_decision`, `assessment_failed`, `turn_stream_end` under its Request ID. Restore `info` after sampling. Vercel's console severity selector is not the JSON `level`; verify filters against actual UI. Never put raw dashboard payloads, identifying URLs or secrets in plan evidence.

## Verification

### Automated

- Extractor/acquirer/logging fixtures asserting phase and elapsed fields, redaction, timeout winner, observer failure safety, and unchanged source budgets.
- Existing assessment tests remain applicable; no new assessment field or behavior is expected.
- Lint, typecheck, tests, build, isolated e2e where applicable, client bundle privacy check, `git diff --check`, status.

### Manual / operational

- Jonny retrieves one sparse and one slow turn from production with Vercel Request ID grouping; validate whether proposed categories resolve the next probe. Use redacted allowlisted fields if sharing here; do not paste secret URLs or provider data.

### Not verified / external pending

- Schema-v6 and v7 slow-turn summaries were supplied, but no same-invocation debug records or dashboard grouping confirmation. Status/classification of CNN/NYT and Reddit failures remains unknown. Browser e2e remains unverified in fixture mode because port 8787 was occupied by a non-fixture server; 2 accessibility checks passed and 6 prompt-dependent checks failed on its Unlock screen. Production lookup and fresh-turn classification await Jonny.

## Handoff

- Implemented selected nonviability classification on the existing server log path, with winner-only extractor metadata and provider-neutral outcomes. README now includes existing assessment triage and the Vercel Request ID lookup.
- Local checks passed except browser e2e, which reused an unrelated non-fixture listener on port 8787. Re-run in an isolated fixture environment when that listener is no longer needed. Jonny's post-deployment dashboard smoke (one sparse and one slow turn) remains external.
- No deployment, production variable changes, provider/prompt changes, or remediation were performed.

## Open Questions

- Which assessment call/input-size pair was slowest in the sampled invocation? — Jonny, if desired after a debug-enabled turn — does not block this diagnostics plan; a prompt/provider change requires separate evidence and authorization.
- Which extraction phase is actually dominant in a fresh deployment once categorized? — operator after P1 — does not block diagnostics; intentionally defers remediation.
- Does the Vercel UI group the new deployment's function console events by Request ID as documented? — Jonny after deployment — operational acceptance, not a coding blocker.
