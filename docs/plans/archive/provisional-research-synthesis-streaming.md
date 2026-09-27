# Provisional research synthesis streaming

## Current State

- Status: done
- Verification: `npm ci`, lint, typecheck, 350 unit/integration tests, build, and 14 isolated Chromium/mobile-WebKit fixture e2e tests passed; `git diff --check` passed. Live provider and production/browser-network timing were not measured.
- Owner: Jonny
- Executor: worker (MUSCLE), sole writer on `release/v1.2.1`
- Last updated: 2026-09-27
- Current focus: implementation and fixture verification complete; the validated terminal alone is durable.
- Next action: any production smoke, operational measurement or Vercel-side change requires a separate per-command operator approval. No deployment was performed.
- Branch / PR / session: `release/v1.2.1` / none; implementation commits `76fdee2`, `bd1b0bb`, `b543b9b`, `677a7b7` (no tag). Independent first-assessment-cap trial: `395b9ff`.

## Abstract

After the research root resolves, show synthesis text as a clearly **provisional** answer while the provider streams, rather than waiting for `AnswerSynthesizer` to validate the entire response. On successful completion replace the draft with the validated, citation-aware terminal answer; on any failure or interruption clear it. This is a responsiveness/UX change, not a shorter resolution or a promise of a 0.5s end-to-end answer.

## Flow

```text
[research root: sufficient | best_effort]
              │ one synthesis call (only after existing two-source gate)
              ▼
[Anthropic stream + citation parser] ──text parts──▶ [AnswerSynthesizer]
                  citation parts ────────────────▶ │ buffer + validate full answer
                                                  │ emit bounded draft text, provisional only
                                                  ▼
                                       [server SSE answer_delta]
                                                  │ awaited write
                                                  ▼
                                         [browser active preview]
                                                  │ terminal valid + commit succeeds
                                                  ▼
                                         [durable transcript answer]
                     failure / abort / disconnect ─▶ [clear preview; no draft persistence]
```

The provider owns model streaming and citation-marker parsing; the application owns validated terminal content and optional provisional text notification; server owns SSE/backpressure; browser owns active, non-durable preview. `answer_delta` never constitutes a validated answer. The completed terminal's `answer.parts` remains the only authoritative answer and may not be identical to the draft (citation filtering, coalescing, heading demotion).

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] P1 — Emit provisional text without weakening answer validation
  - Deliverable: a provider-neutral async provisional-text callback/stream seam in `AnswerSynthesizer` invoked on parsed text parts as they arrive; preserve the one-call, two-source gate and full terminal validation, heading normalization, reachable-citation filtering, refusal/error behavior, and abort handling. Do not emit citation parts as draft links.
  - Verify: synthesizer fixtures for first yield before provider completion, split `[[cite:...]]` markers, leading heading across chunks, filtered citations, invalid/empty/refused output after a partial yield, and aborted iteration; no preliminary text in the returned terminal answer on failure.
  - Evidence: `npx vitest run tests/turn-executors-v3.test.ts tests/anthropic-v3.test.ts` (37 pass), typecheck pass; deferred/heading/failure/abort fixtures. P4 split-citation regression exposed and fixed an incomplete marker-prefix buffering bug; full suite then passed (350), including awaited slow-observer and malformed-terminal cleanup cases.
- [x] P2 — Transport a bounded, backpressured draft
  - Deliverable: `server/app.ts` forwards provisional text during synthesis through the existing typed `answer_delta` signal. Apply the per-turn preview policy (at most 64,000 JS code units total and 256 draft frames; each delta within the current 64,000-code-unit event limit), coalescing later tiny parts without delaying the *first* available safe text. Stop sending draft deltas at the budget without truncating or changing the final validated answer. Await writes; propagate disconnect cancellation to the provider synthesis request where supported. Do not emit duplicate final-answer deltas or leak draft text into logs.
  - Verify: stream-boundary/app tests using a deferred provider show an `answer_delta` **before** provider completion and terminal; final terminal still authoritative; many tiny/large parts, overflow, slow writer, disconnect and provider refusal never create an invalid frame, extra provider call or durable provisional answer. Assert bounded aggregate metadata only.
  - Evidence: `npx vitest run tests/app.test.ts tests/turn-stream-boundary.test.ts` (22 pass), `npm run typecheck` pass; deferred SSE pre-terminal read, overflow rejection, single fixture preview, serialized writes and disconnect abort.
- [x] P3 — Present and clean up the draft in the active turn
  - Deliverable: active `ThreadRoute` renders whitespace-preserving plain text labelled “provisional · checking answer and citations”, distinct from `TranscriptBox`; no Markdown parser, live links or citation controls. Cap preview storage at 64k code units and complete controller event history at 512 events; reject excess events as invalid protocol instead of dropping source/projection evidence. Validate monotonic SSE sequence independently of retained array length. Clear preview on all terminal states, interrupted/disconnected runs, invalid protocol/terminal, navigation and commit failure/retry. A completed terminal replaces it only after terminal/source closure validation and commit succeeds; only terminal outcome enters IndexedDB/context/export/retry.
  - Verify: controller, projection and UI tests cover early visible text, successful replacement with normalized/cited answer, failed/refused synthesis after visible draft, user cancel/navigation, disconnected stream, malformed terminal, commit failure/retry and screen-reader announcement behavior. No stale draft flashes on a new run.
  - Evidence: `npx vitest run tests/workspace-routes.test.tsx tests/turn-controller.test.ts tests/research-browser-flow.test.ts` (38 pass), lint/typecheck/diff-check pass; active plain-text/ARIA preview, 512-event/64k caps, failure/navigation/disconnect/retry cleanup.
- [x] P4 — Regression, browser flush and rollout checks
  - Deliverable: update README operational/product description and relevant tests. Run focused checks then lint, typecheck, test, build, `git diff --check`, status and isolated fixture e2e; compare provider first-yield → server emission → browser display on a deferred fixture. Any live-provider or Vercel deployment/setting/log mutation requires separate operator approval per command and must not be inferred from fixture speed.
  - Verify: real browser sees a preview before terminal with a delayed fixture; failure/cancel clears it; keyboard, screen reader, responsive and terminal citation behavior preserved. If browser/Vercel buffers frames, report the observed behavior without claiming streaming latency success.
  - Evidence: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (350 pass/37 files), `npm run build`, `CI=1 npm run test:e2e` (14 pass/Chromium and mobile WebKit), `git diff --check`, `git status --short --branch` passed. Deferred fixture first text is written before its delayed citation/terminal, and both browsers displayed preview before final cited answer; interrupted navigation and simulated disconnect clear it. No live provider, intermediary, or Vercel flush timing claimed. npm ci reported 2 moderate dependency audit advisories; build reported existing chunk-size warnings.

## Handoff

- Shipped locally through `677a7b7`, without deployment or release tag. Provider text observation, SSE budgeting/backpressure, active-only plain-text preview and terminal cleanup are implemented and covered.
- A deferred fixture separates provider first yield from completion by 750ms. Deferred boundary reads first `answer_delta` before release; Playwright observes the preview before terminal in Chromium and mobile WebKit. No synchronized first-yield/server-write/browser-paint time measurements were captured, so fixture ordering is the evidence, not a latency estimate.
- Operator-controlled production smoke, SDK abort behavior under a live provider, intermediary flush timing and any deployment remain external follow-up with fresh approval per command.

## Desired Outcome

For an otherwise valid multi-second synthesis, a user sees partial text clearly labelled as a provisional, unverified preview soon after the model's first safely parsed text arrives. When the terminal response commits, the preview disappears and the validated answer with proper citations appears in the durable transcript. If the turn stops or the connection fails, partial text vanishes and can never be mistaken for saved research. Assessment/resolution latency is unchanged.

## Baseline before implementation

- `src/infrastructure/providers/anthropic.ts` already streams parser-produced text/citation parts; its `CitationParser` buffers incomplete citation markers. The model's first output can precede completion, but a marker or fragmented heading can delay/alter visible text.
- Before this change, `src/application/answer-synthesizer.ts` collected all parts, filtered unreachable citations, coalesced text, demoted the first Markdown heading and validated terminal `AssistantContent` before returning. `server/app.ts` awaited that result via `executeResearchTurn` and only then emitted text-only `answer_delta` events before terminal.
- Previously, `src/server/turn-stream-boundary.ts` validated individual 64k-string-length deltas but had no cumulative preview cap. Browser gateway had per-event/parser-buffer limits. `src/ui/controllers/turn-controller.ts` accumulated both all events and a concatenated draft; `turn-projection.ts` also read events. `ThreadRoute` showed an active-only Markdown draft, hidden on inactive turns, but controller snapshots retained it after failure/interruption. Transcript and persistence used the terminal turn.
- Operator-supplied post-change trace: synthesis first output at 569ms after synthesis began; full synthesis 9,045ms; resolution 12,368ms; first **server answer signal** at 21,435ms of 21,436ms execution. Roughly 8.5s elapsed between the inferred first provider output and first answer signal because current emission waits for validation. The turn completed with three viable root sources and one accepted assessment; 11 SSE frames (largest 31,027 bytes), clean terminal and no transport abort. This does **not** measure first browser paint or prove Vercel/browser flushing. An earlier trace measured first synthesis output at 512ms after resolution, also not an end-to-end 0.5s answer.
- Separate assessment-cap trial `395b9ff` raises only the first attempt's default/ceiling to 1,200; normal correction/400 fallback remains ≤800 and truncation retry ≤1,600. In that post-change trace, the first attempt accepted a 938-token `resolved` output in 10,502ms; an earlier 800-capped run needed two attempts and 24,596ms of assessment. The samples differ and do not establish a controlled speedup. This trial is not a prerequisite for streaming.

## Scope

### Goals

- Reduce time to first *visible provisional text* during synthesis without changing answer acceptance, source/citation rules, provider count or durable shape.
- Make transient/terminal states unambiguous and bound preview memory and transport load under hostile/chattery streams.
- Verify actual SSE/browser flushing and clearly separate that metric from total research time.

### Non-goals

- Streaming assessment, partial research evidence, citation activation before final validation, persisting/exporting drafts, adding a second synthesis call, changing search/source budgets, accepting invalid output, or promising production/network timing.

## Decisions

- **Terminal is authoritative** — preview is not a `Turn` and never supplies context, citations, retry input, storage or export. On terminal completion render the validated answer, not a concat of deltas.
- **Reuse research `answer_delta` with documented provisional meaning** — current UI already treats it as active-only. Do not add a new durable field. A terminal can fail after deltas, and the final answer can differ; tests must enforce this.
- **Plain-text draft (owner chose A)** — render parsed text with preserved whitespace and a visible “provisional · checking answer and citations” label; do not interpret Markdown or create links/citation controls until the validated terminal. Citation parts remain in the validator/terminal path; no live source attribution from unvalidated tokens.
- **Preserve single root synthesis and full validation** — streaming is an observation of the same run; no second provider pass or early `completed` terminal.
- **Bound preview without truncating truth** — emit at most 64,000 JS code units and 256 preview frames per turn; then show “preview paused; final answer pending” and continue validating the full stream. Cap the controller's complete event history at 512 and reject excess frames rather than silently pruning source evidence. These are transport/UI caps, not an enlargement or truncation of the durable answer contract.

## Detailed Plan

### Application/provider

Add an optional async text observer to `AnswerSynthesizerInput` (or equivalent provider-neutral streaming seam), awaited during iteration. Keep provider part parsing in the adapter; add an optional `signal` to the provider-neutral `ResearchSynthesisInput`, forward it to the Anthropic synthesis SDK request and check it between yields so cancellation can tear down iteration. The observer may stop publishing preview after its own transport budget, but the synthesizer still consumes the stream and validates the full answer. Never mask terminal validation/refusal failures behind a successful preview; transport abort must not yield a completed turn.

### Server/SSE

Forward only parsed text from the synthesis observer to `onSignal({ type: "answer_delta", delta })` as the stream proceeds. Ensure signal is still live before writes and use existing writer backpressure; flush an early safe text fragment promptly (subsequent fragments may be batched). Specify one cumulative preview ceiling and event count; coordinate with individual `answer_delta` and gateway frame limits; stop preview at budget and indicate that final answer is pending rather than truncating the terminal. Avoid writing finalized text again: terminal outcome carries it. Existing server summaries remain count/time-only. Keep heartbeats and sequence ordering safe under concurrent writes.

### Browser/UX

Render the draft as whitespace-preserving **plain text**, visibly marked provisional/unverified. Do not parse Markdown, expose clickable links/citations or announce per-token changes to screen readers; announce state changes instead. Clear it on **all** exit paths, not just via an `active` conditional. Bound complete event history to 512; reject excess frames via the existing invalid-protocol path rather than pruning events needed by `turn-projection`/status. Track the monotonic sequence independently of array length and keep the 64k preview cap. When a terminal fails validation or storage commit, do not show a saved answer; retry only the validated terminal candidate when available.

### Rollout and stop conditions

Use fixture mode to verify flush order and DOM visibility. Measure first parser text, first SSE write, and first browser paint separately from root resolution and terminal commit. Stop and amend this plan before implementation if a new public event schema, durable draft, weakened terminal validation/citation policy, or additional provider run becomes necessary. Vercel-side changes are not authorized by the plan: before **each** mutation show the exact command, target and effect, and wait for explicit approval.

## Verification

### Automated

- Focused application/provider, typed boundary, gateway, controller/projection and route tests; full `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (isolated fixture where applicable), `git diff --check`, `git status --short`.

### Manual / operational

- Deferred-fixture real-browser preview → final replacement and preview → failure/cancel, including keyboard focus and screen reader. Later, only with operator approval, run a production smoke and examine aggregate first-text/first-frame timing without capturing prompt/provider text or turning on excessive logs.

### Not verified / external pending

- Fixture synthesis delay and browser visibility, SSE ordering, invalid/failed/cancelled cleanup, and full automated checks are verified below. Live provider/Vercel timing, intermediary buffering, SDK cancellation in production, and effects on total latency remain unverified. The first-assessment-cap trial is local and separate.

## Open Questions

- None blocking readiness. Production deployment, operational measurements and any Vercel-side mutation require a separate per-command approval.
