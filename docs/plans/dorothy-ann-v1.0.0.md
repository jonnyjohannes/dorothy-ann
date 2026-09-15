# Dorothy Ann v1.0.0 — adaptive research launch

## Current State

- Status: done
- Last updated: 2026-09-15
- Current focus: v1.0.0 launch complete; focused patches may follow real-world use
- Handoff lives in: [`## Handoff`](#handoff)
- Next action: none; follow-on research-quality work belongs in a new plan

## Handoff

Alpha2 is complete in [`dorothy-ann-v1.0.0-alpha2.md`](./dorothy-ann-v1.0.0-alpha2.md). v1.0.0 adds bounded adaptive research without reopening alpha2 persistence, shell, retention, or export decisions. Dorothy Ann is now in real use as Jonny's default browser search engine; launch patches should remain focused and separately verified.

The v1.0.0 architecture is:

```text
initial lookup/search + extraction
              |
              v
       strict research decision
        /                    \
     ready              needs_more_research
       |                       |
 normal synthesis       1–3 Brave searches
                               |
                    bounded concurrent extraction
                               |
                       normal synthesis
```

The planner never writes a user-facing answer. It returns only `ready` or `needs_more_research`. Generated queries, purposes, sources, guidance, and lifecycle stages are visible through the research stream and canonical transcript. Planner output is bounded, validated, normalized for a small allowlist of predictable JSON variants, retried once when malformed, and never persisted raw.

Read this plan, `server/research.ts`, `server/extractor.ts`, `server/app.ts`, `server/anthropic.ts`, `src/ports/chat.ts`, `src/domain/types.ts`, `src/domain/schemas.ts`, `src/ui/App.tsx`, and the research/Anthropic/extractor/app/UI tests before follow-on work.

## Summary

Dorothy Ann can now decide whether an initial evidence set is sufficient for the complete user question. If not, she generates up to three targeted searches, runs them once through Brave, extracts additional evidence in one bounded concurrent batch, and synthesizes from the merged evidence. The research decision is separate from final answer generation, so a caveated answer cannot silently bypass fan-out. Extraction and planner failures are bounded and observable without exposing provider payloads.

## Problem Statement

A single search often produces evidence about only one part of a multi-part question. Earlier alpha3 behavior could also emit a planner-generated caveat as a final answer, fall back directly to synthesis after planner failure, or appear stuck while source extraction was waiting. The product needs a bounded research continuation that is explicit, recoverable, concise, and visible in the transcript.

## Goals

- Perform zero or one adaptive fan-out phase per research turn.
- Allow at most three generated subqueries per turn.
- Run generated searches in parallel through the provider-neutral search port and Brave live adapter.
- Extract follow-up sources in one globally bounded concurrent batch rather than query-by-query batches.
- Preserve source/query association, canonical URL deduplication, partial failures, and stable citations.
- Keep planner and synthesis inputs complete but brief; keep outputs structured and concise.
- Ensure every user-facing research synthesis begins exactly with `According to my research...`.
- Log generated queries, purposes, guidance, sources, extraction outcomes, and relevant stage/failure state in the committed research transcript.
- Preserve alpha2 request ownership, stale-request protection, reload/recovery, fixture parity, auth, retention, and export contracts.

## Non-Goals

- Recursive fan-out or more than three generated queries.
- An autonomous research agent, hidden chain-of-thought, or free-form reasoning transcript.
- New providers, browser-side secrets, extraction libraries, persistence envelopes, or UI research-depth controls.
- Persisting raw Brave responses, raw extracted documents, provider payloads, credentials, or exception details.
- Removing safe URL validation or extractor timeouts.
- Changing the alpha2 shell, retention policy, or canonical export format.

## Context and Existing Boundaries

Alpha2 provides:

- `server/research.ts` staged SSE orchestration;
- `server/app.ts` `/api/research` validation and SSE boundary;
- `server/brave.ts` source normalization and canonical URL handling;
- `server/extractor.ts` safe fetching and readable extraction;
- `server/anthropic.ts` normalized LLM interaction;
- `src/ports/chat.ts` provider-neutral chat/planner input;
- `src/domain/types.ts` thread, research, source, and extraction types;
- browser-local committed thread persistence and canonical scrollback export.

The server owns provider orchestration. The browser receives lifecycle events and renders committed research content. Retrieved material remains untrusted reference data, never instructions.

## Decisions

### Strict planner contract

```ts
interface ResearchQuery {
  query: string;
  purpose: string;
  priority: 1 | 2 | 3;
}

type ResearchDecision =
  | { status: "ready"; queries: [] }
  | {
      status: "needs_more_research";
      guidance: string;
      queries: ResearchQuery[]; // 1–3
    };
```

The planner is a sufficiency gate, not a synthesizer. It must return JSON only and must choose `needs_more_research` when any material part, named entity, relationship, comparison, date, or causal claim is unsupported. A `ready` decision has no answer field. A ready decision always enters normal synthesis; a needs-more decision always enters fan-out.

### Planner normalization and retry

At the Anthropic adapter boundary:

- unwrap one `decision` or `research_decision` envelope;
- accept `searches` as an alias for `queries`;
- discard legacy `answer` fields;
- accept numeric priority strings and normalize them to `1 | 2 | 3`;
- accept string searches and supply a compact purpose;
- supply bounded default guidance only for an otherwise valid needs-more decision;
- convert `ready` carrying non-empty queries into `needs_more_research`;
- reject arbitrary prose and malformed query entries.

Malformed planner output receives one stricter retry. If both attempts fail, the server emits a bounded typed planner failure and does not silently synthesize from incomplete evidence or invent queries.

### Bounded fan-out and extraction

The planner may request at most three searches. The server trims and validates query fields, deduplicates normalized query strings and canonical URLs, preserves stable source IDs, and runs searches concurrently. All unique follow-up sources are passed through one globally bounded extraction batch. Outcomes are mapped back to their originating generated query for evidence events and transcript state. One failed sibling search or extraction does not erase successful siblings.

### Extraction timeout and progress

The entire `SafeContentExtractor.extract` operation is bounded, including URL validation and DNS resolution before the existing fetch timeout. Source extraction events are emitted as individual sources settle. The UI receives explicit transient stages instead of appearing stuck at `sources found` or generic `synthesizing`.

### Lifecycle events

The research stream includes:

```ts
{ type: "research.sources"; sources: SearchResult[] }
{ type: "research.extracting"; sourceCount: number }
{ type: "research.extraction"; sourceId: string; status: string; code?: string; reason?: string }
{ type: "research.evidence"; sourceIds: string[] }
{ type: "research.planning" }
{ type: "research.planner.failed"; code: PlannerFailureCode }
{ type: "research.plan"; plan: ResearchDecision }
{ type: "research.followup.query"; query: ResearchQuery }
{ type: "research.followup.searching"; queries: ResearchQuery[] }
{ type: "research.followup.sources"; query: string; sources: SearchResult[] }
{ type: "research.followup.extracting"; queryCount: number; sourceCount: number }
{ type: "research.followup.extraction"; query: string; sourceId: string; status: string; code?: string; reason?: string }
{ type: "research.followup.evidence"; query: string; sourceIds: string[] }
{ type: "answer.delta"; markdown: string }
{ type: "turn.completed"; turnId: string; extractedPages: number }
```

The browser maps stages to short statuses: `extracting evidence`, `planning`, `searching additional angles`, `extracting additional evidence`, and `synthesizing`. Planner failure is surfaced through the normal turn failure path without raw model output.

### LLM interaction policy

Planner input contains the original question, concise prior context, and compact initial evidence. Planner output is small JSON only. Final synthesis receives the original question, concise guidance where relevant, and bounded merged evidence. Every synthesis path enforces the exact opening `According to my research...` and cites only supplied source IDs. No hidden reasoning, raw provider payload, secrets, or unbounded fetched text is logged or persisted.

### Transcript and persistence

Generated direction is part of the same research turn, not a separate assistant turn. The committed research run retains, where available:

- initial and generated query strings;
- generated query purpose and priority;
- planner decision and guidance;
- initial and additional sources;
- extraction outcomes and evidence IDs;
- final answer and failure/interruption state.

The visible scrollback and canonical Markdown export render the same direction/search entries and source links. Existing alpha2 turn separators, citation links, thread ownership, and export determinism remain authoritative.

## Safe Failure Behavior

- No viable initial evidence: do not call the planner; emit insufficient-evidence state.
- Planner invalid after retry: emit typed planner failure and stop the adaptive turn; do not invent queries or silently bypass the gate.
- One generated search/extraction failure: preserve successful sibling evidence and continue when viable evidence remains.
- No viable additional evidence: use the documented evidence fallback only when the synthesis path is explicitly available; otherwise mark insufficient evidence.
- Aborts, stale events, duplicate events, and out-of-order events cannot overwrite newer committed state.

## Implementation Plan

1. **Decision contract** — define validated answer-free decision/query types, compact context, and research-run fields; verify domain/schema tests.
2. **Planner adapter** — add strict JSON parsing, one retry, typed failure classification, and bounded normalization of predictable variants; verify Anthropic adapter tests.
3. **Research orchestration** — route ready to normal synthesis, needs-more to one-time fan-out, flatten extraction, reconcile sources, and preserve partial failures; verify research event tests.
4. **Extraction recovery** — bound the entire extractor operation and emit per-source progress; verify timeout and lifecycle tests.
5. **HTTP/UI/transcript continuity** — stream lifecycle events, render transient stages, persist generated research direction and sources, and preserve canonical export; verify app/UI/storage/export tests.
6. **Acceptance** — run focused and repository checks, refresh this plan, and commit the milestone.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` done and verified, `[!]` blocked.

- [x] 1. Decision contract — answer-free `ResearchDecision`, query validation, and compact context; verify: typecheck and domain/schema coverage.
- [x] 2. Planner adapter — strict parsing, one retry, typed failures, and compatibility normalization; verify: Anthropic tests.
- [x] 3. Adaptive orchestration — ready synthesis, needs-more fan-out, source merge, and no recursion; verify: research tests.
- [x] 4. Extraction recovery — global follow-up concurrency, whole-operation timeout, and per-source events; verify: extractor/research tests.
- [x] 5. HTTP/UI/transcript continuity — lifecycle SSE, visible stages, generated-search transcript/export state; verify: app/UI/storage/build checks.
- [x] 6. Acceptance — deliverable: complete alpha3 implementation and documentation; verify: 52 tests, lint, build, e2e, diff check.
- [x] 7. Empty synthesis recovery — deliverable: typed failure instead of blank completed turns; verify: research regression, full suite, lint, build, e2e, diff check.
- [x] 8. Research-plan persistence — deliverable: unwrap the `research.plan` SSE envelope before storing the decision; verify: UI and full repository checks.
- [x] 9. Follow-up query persistence — deliverable: unwrap generated query SSE envelopes before storing query metadata; verify: full unit, lint, and type checks.
- [x] 10. Thread deletion recovery — deliverable: remove deleted rows immediately and surface storage failures; verify: storage and UI checks.
- [x] 11. Delete confirmation deduplication — deliverable: stop row key events from reaching the global delete handler twice; verify: UI checks.
- [x] 12. Mobile keyboard layout — deliverable: keep header and prompt usable in compact visual viewports; remove `dorothy ann` from rotating brand strings; verify: full checks.
- [x] 15. Revert compact iOS layout — deliverable: restore prior `100vh` and keyboard-overlay behavior while retaining brand cleanup; verify: UI/build checks.
- [x] 16. Route and thread navigation polish — deliverable: normalize title scale/code styling, simplify settings, and add immediate title filtering to `/threads`; verify: UI and full checks.
- [x] 17. Route scale and fzf visual polish — deliverable: equalize title size, square the finder, and soften selected-row contrast; verify: UI and full checks.
- [x] 18. Restore fzf highlight — deliverable: retain yellow selected-row highlight and use one thin yellow input border; verify: UI/style checks.
- [x] 19. Finder deletion guard — deliverable: keep Delete/Backspace editing the focused filter instead of deleting the selected thread; verify: UI and full checks.
- [x] 20. Route title alignment — deliverable: align `/new`, `/settings`, and `/threads` to the same top offset; verify: UI/style checks.
- [x] 22. Research presentation — deliverable: stream direction/searches in the live UI, distinguish them from synthesis, and enforce one exact opening; verify: research/UI/full checks.
- [x] 21. Home title baseline — deliverable: account for the home hero’s missing secondary-layout offset; verify: style checks.
- [x] 13. Route title hierarchy — deliverable: use `/new`, `/settings`, and `/threads` as route-level h2 titles without duplicated `commands` labels; verify: UI and full checks.
- [x] 14. Route title typography — deliverable: retain h2 semantics with subtle inline code styling; verify: UI/build checks.

## Verification

- A ready decision has no answer field and always invokes normal synthesis.
- A needs-more decision emits one to three generated query events and runs fan-out.
- A planner-generated answer can never become direct transcript content.
- Predictable valid JSON variants normalize; malformed output retries once and then fails with a bounded code.
- The missing-relationship case requests additional research rather than returning a caveated ready answer.
- Generated searches run once in parallel and never recurse.
- Three generated queries with three results each use one bounded global extraction batch.
- Duplicate canonical URLs are extracted once and retain stable source IDs.
- Initial and follow-up extraction cannot hang indefinitely, including pre-fetch URL/DNS validation.
- The UI shows extraction/planning/searching states while work is active.
- Lookup → same-thread research preserves request ownership and reaches completion or typed failure.
- Generated queries, purposes, guidance, sources, and extraction outcomes remain visible in canonical transcript/export state.
- Citation markers resolve only to supplied normalized sources.
- Fixture and live paths preserve provider-neutral event contracts.
- Existing alpha2 retention, auth, security, stale-request, and export invariants remain green.

## Completion Record

v1.0.0 delivers adaptive research fan-out, strict answer-free planning, bounded planner retry/normalization, extraction timeout recovery, global follow-up concurrency, lifecycle progress events, transcript logging, and exact synthesis opening enforcement without reopening alpha2 shell or persistence contracts. The release is validated in practical use as Jonny's default browser search engine; subsequent findings belong in focused patches.

Verification completed:

```text
npm test              # 52 tests across 11 files
npm run lint
npm run typecheck
npm run build
CI=1 npm run test:e2e # 4 Chromium/WebKit fixture + axe tests
git diff --check
```

The build retains the existing non-blocking Vite warnings about third-party bundle size and Zod annotations.

## Follow-up Patch: Empty Synthesis Recovery

A provider completion event without any content can currently produce `turn.completed` with no assistant message. The UI stops its spinner and persistence can commit a blank completed turn. Synthesis must track whether at least one content or citation part was emitted and throw bounded `synthesis_empty` when none arrived. The application then emits the normal turn failure/retry state instead of committing a blank answer. This preserves provider payload privacy and distinguishes an empty provider result from a client rendering issue.

## Follow-up Completion

Synthesis now tracks whether the provider emitted any content or citation part. A provider completion with no content raises bounded `synthesis_empty` instead of emitting `turn.completed`, preventing blank assistant turns from being persisted. The normal application failure/retry path handles the error.

Verification completed:

```text
npm test              # 53 tests across 11 files
npm run lint
npm run build
CI=1 npm run test:e2e # 4 Chromium/WebKit fixture + axe tests
git diff --check
```

## Follow-up Patch: Research-Plan SSE Envelope

The server emits `research.plan` as `{ type: "research.plan", plan: ResearchDecision }`. The UI was casting the entire SSE payload to `ResearchDecision`, so the saved planner value became schema-invalid. Final persistence rejected the completed turn with `invalid_thread`, while the original `running` turn remained visible and the error was unhandled. The UI now reads `payload.plan` and surfaces persistence failures instead of silently leaving the turn running.

## Follow-up Completion

The UI now unwraps the `research.plan` SSE envelope before deriving stage, guidance, generated queries, and persisted planner state. Completion persistence failures are now surfaced as a failed state instead of leaving an unhandled rejection and a stale `running` turn.

Verification completed:

```text
npm test              # 53 tests across 11 files
npm run lint
npm run build
CI=1 npm run test:e2e # 4 Chromium/WebKit fixture + axe tests
git diff --check
```

## Follow-up Patch: Follow-up Query SSE Envelope

`research.followup.query` is emitted as `{ type: "research.followup.query", query: ResearchQuery }`. The UI had treated the envelope as `ResearchQuery`, appending an invalid object to `generatedQueries`. Final thread validation then returned `invalid_thread` after an otherwise successful synthesis. The UI now reads `payload.query`.

## Follow-up Patch: Thread Deletion Recovery

The `/threads` picker now removes a successfully deleted row from local UI state immediately, refreshes IndexedDB-backed summaries, redirects when the active topic is deleted, and reports storage failures instead of silently ignoring the rejected promise. The browser store also has explicit remove coverage for both the thread record and its summary.

## Follow-up Patch: Duplicate Delete Confirmation

Keyboard deletion was handled both by the focused topic button and by the picker’s window-level key handler. The row handler now stops propagation after handling Delete/Backspace, so one user action produces one confirmation dialog.

## Follow-up Patch: Mobile Keyboard Layout and Brand

Mobile Safari’s keyboard changes the visual viewport and can cover fixed/sticky UI; this is partly a platform constraint, but the compact case is tractable. Mobile shells now use the small viewport unit, and when a topic prompt is focused in a short viewport, the topic content collapses so the sticky header and prompt are the useful visible controls. Safe-area-aware prompt spacing remains in place. The rotating brand choices are now `take chances`, `make mistakes`, and `get messy`; `dorothy ann` is no longer a rotating string.

## Follow-up Patch: Route Title Hierarchy

The route-level page titles now use one styled `h2` each: `/new`, `/settings`, and `/threads`. The old `/new` `commands` heading/label pair and the threads kicker plus `Saved threads` title were removed; settings no longer uses a separate `h1` title.

## Follow-up Patch: Route Title Typography

The route titles remain semantic `h2` elements, but each path is now rendered inside `<code>` and uses a smaller, medium-weight style. This keeps `/new`, `/settings`, and `/threads` noticeable without the oversized display-heading treatment.

## Follow-up Patch: Revert Compact iOS Layout

The compact keyboard layout experiment was more disruptive than the prior iOS behavior. Its `100svh` shell sizing and short-viewport focus-collapse rules were removed; the prior `100vh` shell and fixed prompt behavior are restored. The rotating brand cleanup and route-title typography remain.

## Follow-up Patch: Route and Thread Navigation Polish

Route titles remain semantic `h2`s but now use lower-case, code-styled labels at one normalized, subtler scale. `/new` uses `according to my research...` as its code-styled title. Settings keeps the appearance control and consolidates retention/import/export into one compact section without section headings. `/threads` removes the redundant saved-threads heading and opens with a focused title filter; typing narrows by thread title, and Enter/arrow/delete behavior operates on the filtered set in an fzf-like flow.

## Follow-up Patch: Route Scale and Finder Visual Polish

The route title selector now applies uniformly to `/new`, `/settings`, and `/threads`; the home title no longer inherits the oversized `.hero h2` display rule, and all three use the same slightly larger subtle code-styled size. The thread finder has square corners and a lighter selected-row highlight with a restrained focus outline.

## Follow-up Patch: Restore Finder Highlight

The selected thread row retains the original yellow accent highlight. The focused finder now uses a single 1px yellow border without an additional outline, keeping the focus treatment thinner while preserving visibility.

## Follow-up Patch: Finder Deletion Guard

The picker’s global Delete/Backspace handler now ignores those keys when the title finder input is focused. Text editing can no longer trigger deletion of the currently selected thread; row-level keyboard deletion remains available when a thread row is focused.

## Follow-up Patch: Route Title Alignment

The home route used a `14vh` hero offset while settings and threads used `10vh`. The home offset now matches the secondary-layout offset so all three route titles begin at the same vertical position.

## Follow-up Patch: Home Title Baseline

The home hero’s title still rendered above the secondary-page titles because its flow did not include the same effective header/section offset. The hero now receives the matching additional spacing at desktop and mobile breakpoints.

## Follow-up Patch: Research Presentation

The synthesis opening normalizer now removes provider-written variants such as `According to my research,` before prepending exactly one `According to my research...` opening. Planner guidance and generated searches are rendered live as SSE state arrives, before final persistence, using a restrained bordered research-plan block. Persisted scrollback uses bold section labels and code-styled generated queries so direction remains visually distinct from the synthesized answer.

## Open Questions

None. Further autonomous, recursive, or richer research behavior belongs in a new plan.
