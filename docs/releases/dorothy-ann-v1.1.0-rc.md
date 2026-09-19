# Dorothy Ann v1.1.0 release candidate

- Status: release candidate
- Branch: `release/v1.1.0`
- Detailed inventory updated: 2026-09-18

This is the durable change inventory for the v1.1.0 release candidate. Keep the pull request summary stable; append subsequent RC patches to [`RC patch log`](#rc-patch-log) and update verification evidence here.

## Release summary

Dorothy Ann v1.1.0 rebuilds the application around explicit typed domain, application, port, infrastructure, server, runtime, and UI boundaries. It makes ordinary input follow one bounded retrieval-first research protocol, retains `/search` as the explicit raw-link utility, moves persistence to a v3 thread aggregate, and adds typed browser/server execution with one root synthesis.

## Refactor efforts

- Replaced legacy research/server paths with provider-neutral assessment, evidence acquisition, recursive resolution, synthesis, turn execution, and typed SSE boundaries.
- Moved persistence to the v3 `Thread` aggregate with deterministic identities and migration, atomic CAS/idempotent terminal commits, source reconciliation, seven-day retention, deletion tombstones, and aligned IndexedDB, browser-remote, and Redis adapters.
- Split the browser monolith into focused routes, workspace/turn/supporting controllers, semantic primitives, and the named `PromptBox`, `TranscriptBox`, `EvidenceBox`, `BrandBox`, `StickyHeader`, `SettingsBox`, `ThreadsBox`, `UnlockBox`, and `SystemStatusBox` product regions. `Hotkeys` remains a non-visible layout-control box.
- Externalized the assessor and synthesizer system prompts into runtime-loaded `ASSESSOR.md` and `SYNTHESIZER.md` assets that stay out of frontend bundles and durable turns.
- Removed superseded chat, lookup, storage, UI, and route paths while retaining only bounded private v1/v2 migration inputs and read-only legacy archive presentation.

## Net-new additions

- Added one bounded retrieval-first `ResearchTurn` protocol. A node may return `resolved`, request one focused `search`, or `decompose(all | any)` into bounded child obligations; continued work rejoins and reassesses the parent before exactly one root synthesis for `sufficient | best_effort` outcomes.
- Made ordinary non-command input and `/threads/new?q=...` create research regardless of punctuation. `/search <query>` and `/search?q=...` remain the explicit one-provider-call `SearchTurn` path without extraction, assessment, or synthesis.
- Added typed progress, checkpoint/failure outcomes, interruption and retry handling, source-closure validation, terminal commit recovery, and initial/follow-up synthesis metadata across the browser gateway, controller, SSE boundary, executor, and provider adapter.
- Added shared remote thread storage and portable thread routes with production readiness reporting and thin Node/Vercel runtime injection.
- Added bounded follow-up context and evidence reuse. Materially new follow-up claims require direct evidence; time-sensitive facts require fresh retrieval when current support is absent.
- Added thread-wide evidence projection, linked Markdown export citations and source entries, deterministic source accents, responsive full-width workspace/evidence presentation, fuzzy command/thread navigation, accessible semantic primitives, color schemes, and reduced-motion-aware caret/loader behavior.
- Added allowlisted structured server logging and opt-in research diagnostics for aggregate answer position, context counts, directive history, bounded assessment failures/invalid reasons, stage timings, and ledger counts. Prompt, request, source, provider, payload, credential, and identifier content is excluded.
- Added broad contract and regression coverage across domain policy, identity/migration, storage adapters, providers, research orchestration, streaming/controllers, routes, boxes/primitives, exports, logging/configuration, prompt assets, browser flow, and Playwright smoke.

## Settled contracts

- Request kinds are `ResearchTurn` and `SearchTurn`, not persistent modes. Punctuation never routes a turn.
- Recursive directives are `resolved | search | decompose(all | any)`; root outcomes are `sufficient | best_effort | insufficient`.
- The application owns transcript request/response and inter-turn separators. Synthesized content may use emphasized labels, lists, tables, code, quotes, and whitespace, but not headings or horizontal rules.
- Active execution is controller-only. Durable history contains terminal v3 turns and bounded read-only legacy archive entries; archive content never becomes context, evidence, retry input, or a child turn.
- Provider, persistence, authentication, runtime, and extraction details stay behind their ports. Fetched content is always untrusted data, never instructions.

## RC patch log

Append later release-candidate patches here in chronological order. Describe observable impact, the bounded implementation area, and verification; do not rewrite the release summary for a minor patch.

### 2026-09-18 — presentation and export hardening

- Linked referenced sources in Markdown exports, converted valid raw citation markers, and preserved unresolved markers rather than inventing links.
- Moved request/response and inter-turn separation fully into `TranscriptBox`; strengthened `SYNTHESIZER.md` so model output cannot impersonate application separators with headings or horizontal rules.

### 2026-09-18 — follow-up research hardening

- Preserved admitted contextual evidence if follow-up assessment fails, allowing an honest best-effort checkpoint instead of losing useful support.
- Required research for materially new follow-up obligations and fresh retrieval for date-specific or otherwise time-sensitive facts not directly established by supplied evidence.
- Normalized sparse provider search directives to the exact provider-neutral protocol without relaxing other directive validation.

### 2026-09-18 — structured diagnostics

- Added bounded follow-up answer-position and aggregate context diagnostics, assessment directive history, and allowlisted assessment failure/invalid-response reasons.
- Standardized structured runtime logging behind `LOG_LEVEL`; `RESEARCH_TIMING_LOGS` remains opt-in and operational logging failure cannot alter a research result.

## Verification

Current documentation-alignment checkpoint:

- `npm run lint` — passed
- `npm test` — 29 files and 231 tests passed
- `npx vitest run tests/system-prompts.test.ts tests/anthropic-v3.test.ts tests/thread-markdown.test.ts tests/ui-boxes-v3.test.tsx` — 4 files and 40 tests passed
- local Markdown-link validation — all local links resolved across the five changed documentation files
- `git diff --check` — passed

The last full pre-hardening checkpoint recorded:

- `npm run lint`
- `npm run typecheck`
- `npm test` — 219 tests
- `npm run build`
- `git diff --check`

The post-checkpoint work added focused provider, resolver, prompt, export/UI, config, logger, and timing regressions. The current documentation pass did not rerun typecheck, build, or Playwright.

Playwright product-flow checks passed on isolated fixture ports in the recorded release evidence. A repository-default run reused unrelated authenticated servers on ports 5173/8787 and reached `/unlock`; that environmental collision was not recorded as a product regression.

## Deployment follow-up

- Visually check light/dark/auto themes and reduced-motion behavior.
- Confirm live-provider initial-only `According to my research` behavior and direct follow-up wording.
- Observe one focused-search continuation and one decomposed recursive continuation through final synthesis.
