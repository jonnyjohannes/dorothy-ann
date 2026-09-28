# Dorothy Ann v1.2.1 — long-context research recovery

## Current State

- Status: released; the long-context recovery defect is fixed and the deployed product is behaving normally. P4's broader retry UX and P6 release-bookkeeping checks are explicitly deferred, not blockers or evidence that the original defect remains open.
- Verification: the defect was reproduced as a rejected post-resolution `research_state` frame when combined knowledge exceeded the three-evidence-pack schema bound. Commit `ef93dd3` bounds resolver knowledge and adds an app regression proving a three-pack follow-up plus fresh evidence reaches synthesis and a terminal. The plan's provider changes are separately fixture- and live-probe-verified below; production deployment is owner-confirmed in this session, but no v1.2.1 release tag is recorded.
- Owner: Jonny
- Executor: parent (P5 only)
- Last updated: 2026-09-26
- Current focus: none for this incident. Latency and extraction-yield concerns are separate work and should be scoped in their own plan.
- Next action: none. If broader interruption retry UX or v1.2.1 release bookkeeping is pursued, track it separately; this archived plan's unchecked P4/P6 entries are frozen deferred history.
- Branch / PR / session: `release/v1.2.1` / pending

## Handoff

### Closure note

The original incident was not an SSE frame-byte overflow: a long-context follow-up could combine three context evidence packs with newly acquired evidence, exceeding `knowledgeUnitV3Schema.evidence.max(3)`. The transport rejected the `research_state` signal, aborted the executor, and sent no terminal or synthesis. `ef93dd3` bounds the resolver accumulator before stream emission and adds a regression for the three-context-pack-plus-fresh-evidence path. P1–P3 classify and fix this incident; P5 and P5b separately resolved structured-output compatibility and truncated-assessment recovery. The former filename called this an “overflow,” but the mismatch was the bounded evidence/schema count, not frame size.

P4 remains unchecked because its broader browser retry UX and explicit rerun affordance were not implemented or verified; existing controller behavior does clear active progress on interruption and surfaces bounded errors. P6 remains unchecked because v1.2.1 release bookkeeping and the specified complete verification run are not recorded. These are intentionally deferred outside this incident plan; archive status does not imply either item was completed. No current evidence indicates the original rejected-state failure is recurring.

P5's exact-schema probe reproduced the 400; removing only Anthropic-unsupported bounds succeeded on the configured assessment model. The provider now sends that compatible schema and retains strict local validation, with allowlisted rejected-output metadata. A post-fix 15-question local live-provider run using the same assessment/resolver/acquisition/synthesis components as `server/app.ts` (not HTTP/SSE, browser, or persistence) yielded zero schema fallbacks. Four complex turns hit `max_tokens=800` on both assessment attempts and ended best-effort. The operator explicitly approved an adaptive retry amendment: leave first attempts at the existing ≤800-token bound, allow the *existing* second attempt up to 1,600 only after the first response's `stop_reason=max_tokens`, and preserve two attempts and strict local validation. Give that second attempt its own bounded `MAX_ASSESSMENT_RETRY_OUTPUT_TOKENS` operational cap (default 1,600, allowed 800–1,600); the existing `MAX_ASSESSMENT_OUTPUT_TOKENS` remains the first-attempt setting. Do not raise the second cap for malformed non-truncated outputs or HTTP 400 fallback. User asked to proceed with the local environment as configured; that `.env` disables TLS verification. Do not publish `.env` or provider response bodies. P5b now uses an independent 800–1,600-token retry cap only when the first assessment hits `max_tokens`; all four formerly truncated complex prompts returned `sufficient` in a targeted real-provider resolver rerun. The targeted rerun did not run synthesis, HTTP/SSE, browser, or persistence. Do not confuse this scoped work with P4 browser recovery or the separate [two-source synthesis plan](dorothy-ann-two-source-synthesis.md). No prompt assets were edited.

### Post-fix local pilot (15 questions, fresh initial contexts)

The runner reproduced the first-search → acquisition → root assessment/recursion → optional root synthesis path with the current provider adapters and root prompts. It omitted HTTP/SSE, browser/storage commits, and presentation. It emitted only numeric/enum summaries, not answer or provider text. The operator's earlier pilot is a different run; do not equate source counts or answer quality between runs.

| bucket (5 each) | sufficient | best effort | structured 400 fallbacks | final usable sources ≥2 |
| --- | ---: | ---: | ---: | ---: |
| simple (#1–5) | 5 | 0 | 0 | 5 |
| contested (#6–10) | 5 | 0 | 0 | 5 |
| multi-obligation (#11–15) | 1 | 4 | 0 | 5 |
| **total** | **11** | **4** | **0** | **15** |

The four best-effort turns were #11, #12, #14, and #15: each had enough viable evidence, but both structured assessment attempts ended `max_tokens` at the adapter's hard 800-token cap; each was classified `missing_directive` and stopped `provider_unavailable`. Across 16 searches, 48 extraction selections yielded 41 viable, four short/empty, and three failed pages. The first three secure-transport trial runs are **excluded**: they had a different extraction environment and are not comparable to the 15-turn pilot. Two sufficient synthesized answers in this local pilot emitted zero citation parts despite available evidence; this is a separate citation-discipline issue, not evidence that the assessor saw no sources. Do not use this pilot as proof of factual answer quality, UI terminal validity, or production TLS behavior.

## Abstract

A long-context follow-up could exceed the bounded evidence-pack count in `research_state`, causing the server to abort after resolution but before synthesis or terminal delivery. The fix bounds resolver knowledge and is covered by a regression. This archive records that resolved incident plus adjacent Anthropic structured-output and truncated-assessment fixes; broader interruption retry UX and v1.2.1 release bookkeeping were deferred.

## Flow

```text
long-context research request
    ──SSE request──▶ resolver + assessment provider
    ──assessment failure/fallback──▶ typed recoverable resolution or interruption
    ──terminal outcome──▶ browser gateway/controller
    ──view state──▶ bounded failure/retry UI
```

The HTTP request signal remains authoritative for genuine client disconnects and explicit cancellation. Provider assessment failures must not be conflated with transport interruption. Useful admitted evidence may proceed to best-effort synthesis when the request is still alive; an actual abort must produce a durable interrupted outcome or a clear retryable client state.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] P1 — Reproduce and classify the failure
  - Deliverable: deterministic fixture or captured contract test covering long context, structured-output fallback, malformed assessment response, and the observed terminal outcome
  - Verify: focused resolver/provider/SSE/browser test reproduces the failure or documents the exact environment-dependent abort boundary
  - Evidence: Local logs showed a sufficient resolution followed by `protocol_invalid: true`, `executor_aborted: true`, no terminal, and no synthesis. The rejected outbound signal was the post-resolution `research_state`; typecheck and 27 focused resolver/boundary/app tests pass.
- [x] P2 — Separate assessment failure from interruption
  - Deliverable: typed handling and allowlisted diagnostics that distinguish provider bad request, invalid assessment response, client disconnect, explicit cancellation, and timeout
  - Verify: provider, executor, and timing-log regressions assert distinct codes and terminal states without exposing payloads
  - Evidence: Added bounded `turn_sse_frame`, `turn_invalid_signal`, and `turn_stream_end` diagnostics. The reproduced stream reports `protocol_invalid: false`, `executor_aborted: false`, and `terminal_sent: true`; provider fallback remains separately logged.
- [x] P3 — Preserve useful recovery
  - Deliverable: when the request remains active and evidence is useful, assessment failure yields bounded best-effort synthesis; genuine aborts produce a clear interrupted/retryable outcome
  - Verify: execution and terminal-contract tests cover synthesis-after-assessment-failure and abort-before-synthesis paths
  - Evidence: Long-context follow-up completed with `assessment_directives: ["search", "resolved"]`, `resolution_status: sufficient`, one synthesis call, answer delta, and terminal frame.
- [ ] P4 — Fix progress-state recovery
  - Deliverable: browser gateway/controller/route exits the progress UI on interruption, connection loss, timeout, or terminal error and exposes a bounded retry action
  - Verify: UI tests assert no indefinite “analyzing” state and preserve retry behavior
  - Evidence: —
- [x] P5 — Validate assessment structured-output compatibility
  - Deliverable: confirmed model/API configuration behavior and the smallest compatible request/fallback change, or an explicit deployment blocker
  - Verify: live-provider smoke when credentials are available; fixture coverage for fallback and malformed responses
  - Evidence: Non-private live probe with the exact `assessmentOutputSchema` returned HTTP 400. A second request on the same configured model with only `minLength`, `maxLength`, and `maxItems` removed succeeded (`end_turn`, 83 output tokens). `src/infrastructure/providers/anthropic.ts` now omits only those raw-schema constraints, describes string length to the model, and still locally validates all bounds/support. Rejected assessment responses emit allowlisted server-only diagnostic metadata (`format`, bounded `stop_reason`, output-token count, text length, reason), never body/prompt/IDs. Focused 28 tests, lint, typecheck, build, and `git diff --check` pass; full Vitest: 265 passed / one pre-existing user-edited `ASSESSOR.md` exact-string failure. A local 15-question post-fix pilot had **zero** `assessment_structured_output_fallback` events and **zero** assessment invalid responses except four multi-obligation turns where both attempts reached `stop_reason=max_tokens` at 800 output tokens. See aggregate below; local TLS verification was disabled by the environment per the operator's explicit request to proceed, so repeat in a verified deployment before claiming deployment acceptance.
- [x] P5b — Implement the operator-approved bounded adaptive assessment retry
  - Deliverable: first call remains at `min(800, MAX_ASSESSMENT_OUTPUT_TOKENS)`; only an invalid first response with `stop_reason=max_tokens` raises the same second call to `MAX_ASSESSMENT_RETRY_OUTPUT_TOKENS` (default/maximum 1,600, configurable down to 800). No third attempt, no raised cap for other invalid output or the 400 compatibility fallback, and no weakening of proposal/support validation. Keep this operational cap in the Anthropic adapter/runtime config rather than widening the provider-neutral LLM input.
  - Verify: fixture tests for truncated first result, valid high-cap second result, still-invalid second result, ordinary correction and 400 fallback remaining at 800, config bounds/defaults, exact prompt pass-through, bounded diagnostics, lint/typecheck/full tests/build/diff; targeted live pilot after implementation.
  - Evidence: `MAX_ASSESSMENT_OUTPUT_TOKENS` remains ≤800 on the first attempt; new `MAX_ASSESSMENT_RETRY_OUTPUT_TOKENS` defaults to 1,600 (validated 800–1,600) for the existing second attempt only after a truncated first response. Direct adapter instances enforce the same retry-cap range. HTTP 400 fallback and ordinary correction retain their 800-token cap; no third attempt or relaxed local validation. `tests/anthropic-v3.test.ts` and `tests/config.test.ts` cover both paths, bounded metadata, config defaults/range and two-attempt failure. Focused 40 tests, lint, typecheck, build, and `git diff --check` pass; full Vitest: 268 passed / one pre-existing prompt exact-string failure. In a live rerun of #11, #12, #14 and #15 through Brave/extractor/resolver/assessor, each truncated assessment's first response hit `max_tokens=800`, and its higher-cap second response produced a valid directive, and all four root resolutions were `sufficient` with zero 400 fallbacks. This rerun did not synthesize or exercise SSE/browser/storage. Local TLS verification remained disabled per the operator's explicit request to use that environment; do not treat it as production security acceptance.
- [ ] P6 — Release verification and documentation
  - Deliverable: synchronized release notes, handoff, and verification evidence for v1.2.1
  - Verify: lint, typecheck, full tests, build, isolated-port e2e, and `git diff --check`
  - Evidence: —

## Desired Outcome

A long-context recursive research request must always leave the active state visibly and durably: it either synthesizes a bounded answer, records a clear interrupted/failed terminal result, or presents an explicit retryable error. The UI must never remain indefinitely on “analyzing” because an assessment fallback or request abort bypassed terminal recovery.

## Current Reality

- The reported turn logged two `assessment_structured_output_fallback` events caused by `provider_bad_request`; both assessment calls ultimately succeeded.
- The resolver completed a search followed by a successful reassessment: `assessment_directives: ["search", "resolved"]`, `resolution_status: sufficient`, and `stop_reason: sufficient`.
- The turn nevertheless ended `terminal_status: interrupted` with zero synthesis calls, so the failure occurs after resolution and before synthesis.
- The diagnostic confirms the server abort path: `protocol_invalid: true`, `executor_aborted: true`, `terminal_sent: false`, and no `research_state` frame was logged before the error.
- The resolver completed successfully, then the server rejected an outbound signal before synthesis; the invalid signal is therefore the post-resolution `research_state` event, not an Anthropic assessment failure.
- The leading contract mismatch is `knowledgeUnitV3Schema.evidence.max(3)`: the resolver starts with three context evidence packs and adds a new search pack, so the resulting resolution can fail boundary validation before synthesis. Frame size should still be measured, but it is not the primary failure in this reproduction.
- Healthy neighboring turns complete with `assessment_directive: resolved` and one synthesis call.
- `AnthropicProvider` retries structured output once without `output_config`, then requires a parseable directive.
- `ResearchResolver` treats provider/assessment unavailability as a bounded provider-unavailable resolution, while `executeResearchTurn` checks the shared abort signal before synthesis.
- `TurnStreamBoundary` uses the request abort signal for client disconnects and executor cancellation; the current timing record does not identify the abort source.
- `ThreadRoute` renders progress from the last accepted phase and relies on the controller result to clear active state and show a message.

## Scope

### Goals

- Reproduce the long-context failure across provider, resolver, SSE, gateway, controller, and UI boundaries.
- Preserve strict validation of untrusted assessment output.
- Distinguish provider failure, malformed assessment output, explicit cancellation, client disconnect, and timeout.
- Synthesize useful best-effort research when no genuine abort occurred.
- Ensure every interruption/error path clears active progress state and exposes bounded recovery.
- Add regression coverage and release documentation.

### Non-goals

- Removing recursive research or increasing research budgets.
- Weakening assessment schema, support-reference validation, or source-closure checks.
- Exposing provider payloads, prompts, credentials, or raw error details to users or durable turns.
- Replacing Anthropic or changing the general research protocol.
- Adding a new unbounded retry loop.
- Broad UI redesign unrelated to interrupted research recovery.

## Decisions

- **Provider assessment failures remain bounded and typed** — malformed or unavailable assessment output must not be treated as valid strategy, and must not silently trigger unbounded retries.
- **Abort source is operational metadata, not user-facing research content** — diagnostics may distinguish request disconnect, user cancellation, timeout, and provider interruption while public errors remain capability-level.
- **Useful evidence may support best-effort synthesis only while the request is alive** — a genuine client abort must stop work and produce interruption semantics rather than synthesizing after disconnect.
- **Progress state is cleared on every terminal/controller exit** — the UI must not infer completion solely from a phase event.

## Detailed Plan

### Assessment provider and resolver

Inspect the Anthropic structured-output request against the configured assessment model/API behavior. Preserve the current single fallback attempt, but normalize fallback responses into explicit `assessment_invalid_response` reasons. Confirm whether long context causes request-size/model rejection and keep request/context bounds enforced.

Update resolver/executor handling so provider assessment failure with retained useful knowledge can produce the existing bounded best-effort resolution and proceed to synthesis when the signal is live. Do not synthesize after an authoritative abort.

### HTTP/SSE and timing

Trace the shared abort signal from the browser request through `TurnStreamBoundary`, executor, resolver, provider, and synthesis. Add only bounded allowlisted abort-source diagnostics and timing fields needed to identify the boundary. Preserve heartbeat and cancellation behavior, and never log prompts, context, provider payloads, identifiers, or credentials.

### Browser recovery

Ensure `TurnController` handles stream closure, typed errors, explicit cancellation, and interrupted terminals consistently. Ensure `ThreadRoute` clears active progress and renders a bounded message/retry affordance for every non-success result, including the assessment-failure path. Keep retry semantics limited to safe retained candidates or a fresh user retry as appropriate.

### Verification and release

Add focused regressions before changing behavior. Run the repository verification suite and record environmental blockers explicitly. Update the v1.2.1 release inventory and this plan’s handoff only after the implementation evidence is available.

## Verification

### Automated

- Focused provider, resolver, executor, SSE boundary, gateway/controller, and route tests.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e` using isolated fixture ports when shared ports are occupied.
- `git diff --check`

### Manual / operational

- Live-provider long-context research with at least one recursive continuation.
- Live-provider assessment structured-output fallback behavior.
- Browser observation that interruption, connection loss, and retry states replace the progress loader.

### Not verified / external pending

- The abort source for the reported production-like turn is not yet known.
- Anthropic model/API structured-output compatibility requires live-provider confirmation.
- Deployment timeout or proxy behavior is not verifiable from repository logs alone.

## Historical Open Questions at Closure

- The rejected field was the joined knowledge evidence array exceeding the `research_state` schema's three-pack limit; P1/P2 resolved this by bounding the resolver accumulator.
- Deterministic evidence bounding was implemented in `ef93dd3`; the transport now receives schema-valid bounded research state.
- The configured model's structured-output compatibility was verified with the provider probe and adapter change documented under P5.
- Whether a generic interruption retry should start a fresh run or retain an exact candidate remains undecided. This belongs to the deferred P4 UX work, not the fixed long-context incident.
