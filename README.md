# Dorothy Ann

Dorothy Ann is a browser-based information resolver and researcher. Ordinary requests and `/threads/new?q=...` create recursively resolved `ResearchTurn`s with bounded evidence and one synthesized answer. Use `/link`, `/news`, `/image`, or `/video` in the prompt input when you want ranked raw retrieval without research synthesis.

## what it does

- ⚡ **`/link`, `/news`, `/image`, `/video`** return ranked, normalized link, news article, or media sources without extraction or LLM synthesis
- 🔎 **ordinary requests** research by default, recursively resolving evidence gaps within explicit search, source, depth, branch, and assessment ceilings
- 🧾 **thread history** keeps terminal turns, canonical source metadata, evidence projections, and read-only migrated legacy archive entries
- 🗂️ **browser workspace** provides focused home, thread, thread-list, settings, and unlock routes backed by typed product boxes
- 🔐 **private research desk** keeps authentication, storage, provider, and extraction implementations behind ports
- 🧪 **fixture mode** supports development without live provider credentials

## research flow

Ordinary research follows one retrieval-first protocol. Continued research may be one focused search or a bounded decomposition; both return to assessment before the root answer is synthesized:

```text
question
   |
   v
exact-question retrieval when admissible evidence is absent
   |
   v
extract useful results -> assess
                         | root resolved with ≥2 materially independent sources
                         +-------------------------------> synthesize once
                         | search (including unmet root corroboration)
                         +-> focused retrieval/extraction -> reassess
                         | decompose(all | any)
                         `-> bounded child resolution -> join -> reassess
```

The root uses the exact user question for its first search when no admissible extracted evidence already exists. The assessor returns one `resolved | search | decompose(all | any)` directive. `search` acquires focused missing evidence; `decompose` resolves genuinely independent child obligations and joins their supported knowledge. Both paths reassess the parent, and children never produce separate user-facing answers. A root `resolved` directive targets at least two materially independent evidence sources supporting the central conclusion, including for straightforward factual questions; when that target is unmet, the assessor requests one focused corroboration search where the existing budget permits. Independence is model-judged: different URLs or domains, syndicated copies, repeated reports, and same-publisher pages are not automatically independent, and the application does not enforce source count or publisher lineage. This target applies to the root only; child obligations retain their existing behavior. A sufficient or useful best-effort root synthesizes exactly once; no useful supported evidence produces an insufficient outcome. During that single synthesis, safely parsed text can appear as a labelled, plain-text provisional preview. It has no live citations or links, is capped at 64,000 code units and 256 frames, and is cleared on failure, interruption or navigation. Only the fully validated answer replaces it after terminal commit and becomes available for history, context and export; the final text may differ from the preview. Search, source, assessment, and depth ceilings are shared across the complete tree and are hard limits rather than targets.

## search result kinds

`/threads/new?q=<prompt input>` is the canonical prompt-input URL, and a `?q` value on the home route redirects into it. The shared classifier is used for typed and URL input: bare text creates a `ResearchTurn`, while `/link <query>`, `/news <query>`, `/image <query>`, and `/video <query>` create link, news, image, and video `SearchTurn` result kinds. News articles use link-shaped source records. Research begins with web discovery and may request further focused web searches after assessing evidence; assessor-selected news research is deferred. Historical news research tasks remain readable. Media results are retained as bounded durable source records for reload and export; they never enter factual extraction. Supported video cards mount a paused inline provider player when they enter the viewport; offscreen, unsupported, or failed cards retain the linked-thumbnail fallback, and titles remain external source-page links.

## keyboard shortcuts

| key | action |
| --- | --- |
| `i` | focus the prompt input (ignored while typing in a field) |
| `Alt+S` | open saved threads, even while the prompt is focused |
| `Alt+C` | open settings |
| `Escape` | leave `/threads` or `/settings` and return where you came from |
| `Escape` `Escape` | from anywhere else, return home (within 500ms) |

Inside the thread list, arrow keys move the selection, `Enter` opens, and `Delete`/`Backspace` asks to confirm with `y` or `n`. Settings menus and the brand control accept arrows, `Enter`, and `Space`.

## architecture

The package is strict TypeScript targeting Node 22. Domain and application code remain provider/platform independent. The main boundaries are:

- `src/domain/` — canonical v3 types, schemas, identity, migration, knowledge, and context policies
- `src/application/` — assessor, evidence acquisition, recursive resolution, synthesis, turn execution, and terminal commit policies
- `src/ports/` — provider-neutral LLM, search, extraction, storage, identity, prompts, and turn-gateway contracts
- `src/infrastructure/` — Anthropic/Brave/extraction, browser gateway/storage, Redis, identity, and runtime adapters
- `src/server/` — portable Hono composition and authenticated HTTP/SSE turn boundary
- `server/` and `api/` — thin Node/Vercel runtime adapters
- `src/ui/` — route composition, workspace/turn controllers, semantic primitives, and typed `PromptBox`, `TranscriptBox`, `EvidenceBox`, `BrandBox`, `StickyHeader`, `SettingsBox`, `ThreadsBox`, `UnlockBox`, and `SystemStatusBox` components; global keyboard shortcuts live in `GlobalShortcuts` (`src/ui/App.tsx`), and each box owns its own list, confirm, and activation keys
- `tests/` — domain, application, contract, infrastructure, UI, and Playwright coverage

`ASSESSOR.md` and `SYNTHESIZER.md` are the only target LLM system-prompt assets. Runtime loading keeps them out of browser bundles and durable product data; dynamic context, schemas, retries, and evidence remain typed user/protocol input.

## development

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Fixture mode is the default. Live provider credentials are optional for local implementation and must never be exposed through `VITE_*` variables or browser assets.

### operational logs

The Vercel `api/index.ts` adapter also sends one `research.duration_ms` custom metric per measured research span (fixed `stage`: `execution`, `resolution`, `acquisition_wall`, `search`, `extraction`, `assessment`, `synthesis`). This does not run in local Node mode or for search turns. Repeated stage durations are cumulative work and may overlap; execution and resolution are wall spans, while acquisition_wall sums acquisition spans. None are additive partitions. Unentered stages have no sample. Metrics use only bounded numbers and fixed labels, while `research_timing` remains the per-turn diagnostic log. After a deployment and an ordinary research request, open **Vercel → Project → Observability → Custom Metrics** and look for `research.duration_ms`; configure a time-series chart grouped by `stage` if the account permits it. The dashboard's Hobby custom-query/grouping controls and live ingestion remain unverified. Each sample counts as a metered Observability event (up to seven per research turn); no Log Drain, client SDK or additional environment variable is required. See [the custom metrics plan](docs/plans/archive/research-custom-metrics.md) and [Vercel's metric documentation](https://vercel.com/docs/observability/custom-metrics).

`LOG_LEVEL=info` (the default) controls the single structured server logger. `debug` includes info and warn; `warn` suppresses info/debug; `silent` suppresses everything. There are no separate research diagnostic flags. Keep normal production log access and retention controls: selected-source paths can be identifying even after credentials, queries, fragments, and suspicious path segments are removed.

| Level | Events and fields |
| --- | --- |
| `info` | `server_listening` (port); one `research_timing` per research execution (schema v8, bounded terminal/resolution/stop enums, search/extraction/assessment/synthesis counts and timings, distinct usable root IDs, and `assessment_profile` attempt/retry, input-size, token-usage, parse and validation metrics); count-only `assessment_anomaly` only for rejected/retried or ≥10s attempts (fixed output-shape/reason/stop enums and bounded numbers); `extraction_rejected` for each selected, nonviable *skipped* link (rank, allowlisted reason, bounded elapsed, fixed phase/detail, sanitized URL and host when safe). |
| `warn` | `extraction_failed` for each selected *failed* link (rank, allowlisted fetch/timeout/extraction code, bounded elapsed, fixed phase/detail, HTTP bucket only for HTTP rejection, sanitized URL and host when safe). |
| `debug` | `assessment_call` (per-turn ordinal, depth, evidence count/characters, elapsed and outcome); `assessment_attempt` (same ordinal, attempt 1/2, provider round-trip plus parse elapsed, prompt-size count, output cap, usage when returned, stop reason and outcome); `assessment_decision` (validated directive/depth, local validation elapsed, remaining budget); allowlisted `assessment_failed`, Anthropic `assessment_output_rejected` and `assessment_structured_output_fallback`; stream `turn_sse_summary` (one bounded frame/byte summary), `turn_invalid_signal`, and `turn_stream_end`. No per-frame console output. |

The `research_timing` record includes per-request selected/viable/empty/failure counts and stage workload duration (`calls`, `succeeded`, `failed`, `cumulative_ms`, `max_ms`, optional `first_output_ms`), plus wall-clock execution/resolution times. `assessment_profile.provider_attempts` counts observed adapter requests; `stages.assessment.calls` counts outer provider calls, and `counts.assessments_used` counts accepted directives. Token totals count only attempts whose provider returned usage; `token_usage_reported` says how many. `first_answer_signal_ms` now measures the first provisional server answer signal when available, not terminal answer availability or browser paint. `input_chars_max` includes the assessor system prompt and user envelope, measured in JavaScript code units, not provider tokens. `assessment_attempt.elapsedMs` includes provider round-trip and local parsing; `parseMs` is the measured parsing portion. `acquisition_wall` measures the completed acquisition span separately from concurrent `search`/`extraction` workloads. Optional `search_subphases` (HTTP header wait and JSON/normalization) and `extraction_subphases` (winner-only safety/DNS, HTTP, bounded body, text) omit unentered phases; extraction subphase `succeeded` means that timing completed on the winning outcome, not that content was viable. Synthesis `remaining_after_first_output_ms` spans stream consumption after first output, not browser paint or separate validation. `assessment_profile.accepted_observations` counts only accepted provider proposals (not admitted findings), and `provider_ms_total` is elapsed attempt minus local parse; provider-internal queue versus generation remains unmeasured. Concurrent stage durations can overlap. For a slow turn, compare `execution_ms` (wall time) and `resolution_ms` to `stages.assessment.calls/cumulative_ms/max_ms`: cumulative assessment time is workload duration, not necessarily wall time. `assessment_profile.provider_attempts/retried_calls/slowest_attempt_ms` separates provider requests from outer calls; repeated outer calls can be recursive assessment rather than a retry. Compare `input_chars_max`, `input_tokens_total`, `output_tokens_total`, and `token_usage_reported` only where usage exists: missing provider usage is not zero, and input characters are not tokens or evidence of prompt causality. `parse_ms_total` and `validation_ms_total` quantify measured local work. A redacted schema-v6 slow summary with one assessment call occupying most resolution localizes time but has no attempt details. In the supplied schema-v7 example, two accepted attempts, no retries and negligible parse/validation coexist with an 8s extraction timeout; extraction `cumulative_ms` may overlap other work. At debug, group `assessment_call` and `assessment_attempt` by `call` ordinal, compare each call's `elapsed_ms` with attempt `elapsedMs` (the adapter starts attempt timing after envelope construction), `inputChars`, `parseMs`, outcome and reported usage; inspect `assessment_decision.validationMs` separately after provider return. Neither sample alone proves that input size caused latency. No operational logs enter SSE, `/api/status`, durable turns or browser storage. Only fixed enums and bounded numbers are logged for assessment (never prompts, evidence, provider response, query, or IDs); existing selected-failure logs retain separately sanitized URLs. For an operator lookup in Vercel Logs: select the production deployment and a narrow UTC time window; confirm the function route is `POST /api/turn`, filter that route, search `research_timing`, and open the slow or sparse record. Inspect other console lines grouped by that invocation's Vercel function Request ID, not by question, URL or turn ID. At `info`, inspect `assessment_anomaly` for rejected/retried/slow attempts and `extraction_failed` / `extraction_rejected` under the same Request ID. Each selected nonviable extraction attempt has a reason, `elapsed_ms` (0–300,000), `failure_phase` (`url_check`, `dns`, `fetch`, `redirect`, `body`, `text`, `unknown`) and `failure_detail`; HTTP rejection alone has a status bucket (`403`, `429`, `other_4xx`, `5xx`, `other`). Compare with `evidence_yield.requests` and final viable root IDs: HTTP 2xx does not imply admitted text. A deadline reports the last reached phase, not a proven root cause; HTTP bucket does not establish bot blocking. Generic normalized failures fall back to `unknown`/`other`. If the summary cannot localize assessment latency, temporarily deploy `LOG_LEVEL=debug`, reproduce a **new** turn, group `assessment_call`, `assessment_attempt`, `assessment_decision`, `assessment_failed` and `turn_stream_end` under its Request ID, then restore `info` after sampling. Vercel's console severity filter is not the `level` inside the JSON. No additional log flag or persistence service is required. The legacy-key deprecation warning remains a separate startup `console.warn` before the logger is initialized. The unused legacy `ANTHROPIC_MODEL` Production variable has been removed; retain the compatibility parser for other deployments.

The assessment first attempt and ordinary non-truncated corrective attempt now share the bounded `MAX_ASSESSMENT_OUTPUT_TOKENS` setting (default/maximum 1,200). The structured-400 compatibility fallback remains ≤800; only a first attempt stopped by `max_tokens` uses the separate `MAX_ASSESSMENT_RETRY_OUTPUT_TOKENS` (default 1,600). This follow-up trial was motivated by an operator-supplied invalid 1,023-token first response whose 800-token correction truncated; it is not evidence that a 1,200-token correction would have succeeded.

## documentation

- [Provisional research synthesis streaming](docs/plans/archive/provisional-research-synthesis-streaming.md) — implemented bounded plain-text preview, terminal replacement and failure cleanup. The earlier operator-supplied trace measured first provider output at 569ms but the first server answer signal near the 21.4s end; the deferred fixture now verifies browser display before terminal, not production network latency. Live provider and Vercel buffering remain unverified.
- [Research failure diagnostics](docs/plans/archive/research-failure-diagnostics.md) — selected-source failure classifications, existing assessment latency triage and Vercel lookup; remediation awaits evidence and separate approval.
- [v1.2.1 long-context recovery](docs/plans/archive/dorothy-ann-v1.2.1-long-context-recovery.md) — the rejected `research_state` schema-bound bug is fixed; broader retry UX and v1.2.1 release bookkeeping were deferred
- [Two-source synthesis and evidence-yield plan](docs/plans/archive/dorothy-ann-two-source-synthesis.md) — shipped root synthesis gate, charged backfill, and logging standardization; extraction-yield recovery remains a separate open concern
- [Release hygiene plan](docs/plans/archive/dorothy-ann-release-hygiene.md) — completed tags, version, documentation, and release-inventory reconciliation
- [Search result kinds amendment](docs/plans/archive/dorothy-ann-search-result-kinds.md) — `/link`, `/image`, and `/video` behavior shipped in v1.2.0
- [News discovery plan](docs/plans/archive/dorothy-ann-news-search.md) — raw `/news` and historical research news behavior (live Brave verification pending); [assessor web-only amendment](docs/plans/archive/assessor-compact-web-only.md) and [surface-free follow-up](docs/plans/archive/assessor-surface-free.md) — defer assessor-selected news research without a live surface choice; [icon-only cue amendment](docs/plans/archive/dorothy-ann-news-cue-alignment.md) — article metadata presentation
- [v1.1.0 architecture plan](docs/plans/archive/dorothy-ann-v1.1.0.md) — architectural baseline: boxes, contracts, migration policy, and verification
- [v1.1.0 release-candidate changelog](docs/releases/dorothy-ann-v1.1.0-rc.md) — historical detailed inventory and RC patch log
- [v1.0.0 plan](docs/plans/archive/dorothy-ann-v1.0.0.md) — original product baseline
- [Repository guide](AGENTS.md) — working boundaries, verification, secrets, and implementation rules

made with curiosity, citations, and Miss Frizzle's timeless wisdom. <|°_°|>
