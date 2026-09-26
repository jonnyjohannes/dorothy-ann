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

The root uses the exact user question for its first search when no admissible extracted evidence already exists. The assessor returns one `resolved | search | decompose(all | any)` directive. `search` acquires focused missing evidence; `decompose` resolves genuinely independent child obligations and joins their supported knowledge. Both paths reassess the parent, and children never produce separate user-facing answers. A root `resolved` directive targets at least two materially independent evidence sources supporting the central conclusion, including for straightforward factual questions; when that target is unmet, the assessor requests one focused corroboration search where the existing budget permits. Independence is model-judged: different URLs or domains, syndicated copies, repeated reports, and same-publisher pages are not automatically independent, and the application does not enforce source count or publisher lineage. This target applies to the root only; child obligations retain their existing behavior. A sufficient or useful best-effort root synthesizes exactly once; no useful supported evidence produces an insufficient outcome. Search, source, assessment, and depth ceilings are shared across the complete tree and are hard limits rather than targets.

## search result kinds

`/threads/new?q=<prompt input>` is the canonical prompt-input URL, and a `?q` value on the home route redirects into it. The shared classifier is used for typed and URL input: bare text creates a `ResearchTurn`, while `/link <query>`, `/news <query>`, `/image <query>`, and `/video <query>` create link, news, image, and video `SearchTurn` result kinds. News articles use link-shaped source records; research begins with web discovery and may search news after assessing evidence, using the same extraction and citation rules. Media results are retained as bounded durable source records for reload and export; they never enter factual extraction. Supported video cards mount a paused inline provider player when they enter the viewport; offscreen, unsupported, or failed cards retain the linked-thumbnail fallback, and titles remain external source-page links.

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

`LOG_LEVEL=info` (the default) controls the single structured server logger. `debug` includes info and warn; `warn` suppresses info/debug; `silent` suppresses everything. There are no separate research diagnostic flags. Keep normal production log access and retention controls: selected-source paths can be identifying even after credentials, queries, fragments, and suspicious path segments are removed.

| Level | Events and fields |
| --- | --- |
| `info` | `server_listening` (port); one `research_timing` per research execution (schema v7, bounded terminal/resolution/stop enums, search/extraction/assessment/synthesis counts and timings, distinct usable root IDs, and `assessment_profile` attempt/retry, input-size, token-usage, parse and validation metrics); `extraction_rejected` for each selected, nonviable *skipped* link (rank, allowlisted reason, sanitized URL and host when safe). |
| `warn` | `extraction_failed` for each selected *failed* link (rank, allowlisted fetch/timeout/extraction code, sanitized URL and host when safe). |
| `debug` | `assessment_call` (per-turn ordinal, depth, evidence count/characters, elapsed and outcome); `assessment_attempt` (same ordinal, attempt 1/2, provider round-trip plus parse elapsed, prompt-size count, output cap, usage when returned, stop reason and outcome); `assessment_decision` (validated directive/depth, local validation elapsed, remaining budget); allowlisted `assessment_failed`, Anthropic `assessment_output_rejected` and `assessment_structured_output_fallback`; stream `turn_sse_summary` (one bounded frame/byte summary), `turn_invalid_signal`, and `turn_stream_end`. No per-frame console output. |

The `research_timing` record includes per-request selected/viable/empty/failure counts and stage workload duration (`calls`, `succeeded`, `failed`, `cumulative_ms`, `max_ms`, optional `first_output_ms`), plus wall-clock execution/resolution times. `assessment_profile.provider_attempts` counts observed adapter requests; `stages.assessment.calls` counts outer provider calls, and `counts.assessments_used` counts accepted directives. Token totals count only attempts whose provider returned usage; `token_usage_reported` says how many. `input_chars_max` includes the assessor system prompt and user envelope, measured in JavaScript code units, not provider tokens. `assessment_attempt.elapsedMs` includes provider round-trip and local parsing; `parseMs` is the measured parsing portion. Concurrent stage durations can overlap. No operational logs enter SSE, `/api/status`, durable turns or browser storage. Only fixed enums and bounded numbers are logged for assessment (never prompts, evidence, provider response, query, or IDs); existing selected-failure logs retain separately sanitized URLs. In Vercel, filter Logs to `POST /api/turn` and search `research_timing`; the function Request ID groups its debug lines with the request. Keep `LOG_LEVEL=info` for routine use; temporarily use `debug` for per-attempt analysis. Vercel's console severity filter is not the `level` inside the JSON. No additional log flag or persistence service is required. The legacy-key deprecation warning remains a separate startup `console.warn` before the logger is initialized. The unused legacy `ANTHROPIC_MODEL` Production variable has been removed; retain the compatibility parser for other deployments.

## documentation

- [v1.2.1 long-context recovery](docs/plans/archive/dorothy-ann-v1.2.1-long-context-recovery.md) — the rejected `research_state` schema-bound bug is fixed; broader retry UX and v1.2.1 release bookkeeping were deferred
- [Two-source synthesis and evidence-yield plan](docs/plans/archive/dorothy-ann-two-source-synthesis.md) — shipped root synthesis gate, charged backfill, and logging standardization; extraction-yield recovery remains a separate open concern
- [Release hygiene plan](docs/plans/archive/dorothy-ann-release-hygiene.md) — completed tags, version, documentation, and release-inventory reconciliation
- [Search result kinds amendment](docs/plans/archive/dorothy-ann-search-result-kinds.md) — `/link`, `/image`, and `/video` behavior shipped in v1.2.0
- [News discovery plan](docs/plans/archive/dorothy-ann-news-search.md) — raw `/news` and optional research news discovery (live Brave verification pending); [icon-only cue amendment](docs/plans/archive/dorothy-ann-news-cue-alignment.md) — article metadata presentation
- [v1.1.0 architecture plan](docs/plans/archive/dorothy-ann-v1.1.0.md) — architectural baseline: boxes, contracts, migration policy, and verification
- [v1.1.0 release-candidate changelog](docs/releases/dorothy-ann-v1.1.0-rc.md) — historical detailed inventory and RC patch log
- [v1.0.0 plan](docs/plans/archive/dorothy-ann-v1.0.0.md) — original product baseline
- [Repository guide](AGENTS.md) — working boundaries, verification, secrets, and implementation rules

made with curiosity, citations, and Miss Frizzle's timeless wisdom. <|°_°|>
