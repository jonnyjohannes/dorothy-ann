# Dorothy Ann v1.0.0-alpha

## Current State

- Status: in progress
- Plan file: `docs/plans/dorothy-ann-v1.0.0-alpha.md`
- Last updated: 2026-09-05
- Current focus: domain schemas and pure policies verified; beginning IndexedDB storage and backup recovery
- Handoff lives in: [`## Handoff`](#handoff)
- Next action: approve implementation via `feature-builder`, beginning with Plan Ledger step 1

## Handoff

Read `Current State`, `Concrete Application Stack`, `Browser Interaction Design`, `Application HTTP and Streaming Contract`, `Explicit Non-Goals`, `Implementation Plan`, and `Operator Setup and Secret Handoff` first. Product, interfaces, browser states, transport contracts, dependencies, implementation steps, and verification are settled. The alpha is a Vercel-hosted React/Vite SPA with a portable Hono backend, browser-only IndexedDB threads, Brave search, application-owned extraction, Anthropic synthesis, passphrase auth, and Markdown reports.

Ledger steps 1 and 2 are complete and verified. The scaffold is portable and fixture-ready; domain types, boundary schemas, query/source policies, citation sentinel parsing, citation numbering, and deterministic Markdown renderers are covered by focused tests. Next, implement IndexedDB storage and backup recovery. Fixture mode allows implementation through step 11 without live credentials; step 12 needs the deployment inputs. Do not add remote thread storage, sync, autonomous research, context compaction, topic archiving, edit-history branching, rich editors, or second-provider work to the alpha.

## Summary

Dorothy Ann v1.0.0-alpha is a personal, source-aware browser search surface with two explicit costs: quick ranked lookup and bounded researched answers. It keeps threads in the current browser, exposes evidence, supports follow-up chat, and exports editable Markdown without coupling domain data to a provider or hosting runtime.

## Problem Statement

Ordinary search is fast for navigation but weak for researched synthesis; generic chat obscures evidence and produces context that is awkward to move into durable work. The alpha validates whether one browser surface can preserve fast lookup while making deeper research inspectable, conversational, and easy to export.

## Goals

- Make keyword lookups feel search-engine fast and require no model call.
- Produce a bounded, cited “According to my research…” answer from up to three viable pages.
- Keep follow-up chat, source inspection, and report export ergonomic on desktop and mobile.
- Keep stored data and application orchestration provider-neutral and runtime-portable.
- Deploy safely to Vercel without exposing credentials or storing threads server-side.

The product is intentionally an ephemeral thinking surface—not a knowledge base, coding agent, or permanent memory system. Its durable output is the artifact the user chooses to export, not an invisible memory layer.

## Product Shape

> An ephemeral, source-aware chat client with clean exits.

```text
enter a query
     │
     ├── quick lookup ──→ ranked web results ──→ open the useful link
     │
     └── research question
             ├── visible search and source evidence
             ├── “According to my research…” synthesis
             └── follow-up chat in the same lightweight topic thread
                              │
                              └── export Markdown
                                       ↓
                            durable notes / repo / pi handoff
```

The core value is not generic LLM chat. It is the combination of:

1. A browser-search entry point that is useful enough to replace the default search habit for research-heavy questions.
2. Search results and extracted evidence that remain visible and inspectable.
3. A recognizable research-report voice: “according to my research…” followed by a useful synthesis, not an opaque chatbot answer.
4. Lightweight, topic-oriented conversations rather than a permanent knowledge base.
5. A high-signal, editable artifact export as a first-class completion action.
6. A low-friction bridge into pi.dev: exported reports should preserve sources, decisions, open questions, and next actions.
7. User-controlled deployment and credentials.

## Core Requirements

### Chat

- Stream model responses.
- Render Markdown and code safely.
- Support stop, retry, and copy. Editing an earlier turn and branching/replacing downstream history is deferred.
- Remain comfortable on desktop and narrow mobile screens.
- Persist the deployment-assigned model reference as metadata without exposing model/provider selection in the alpha UI.

### Query Paths

A new query must take one of two visibly different paths:

- **lookup** — call the search provider and render ranked results without extraction or model synthesis. This is the low-cost, low-latency path for navigational and utility queries such as `weather` or `life alive`.
- **research** — search, extract up to the deployment-configured number of viable pages (three by default), and stream a Dorothy Ann synthesis with citations. The resulting page is already a chat thread, so the user can ask follow-up questions without entering another mode or moving elsewhere.

Routing is predictable and reversible. A pure browser function and visible mode chip apply these rules:

- ordinary keyword-like input defaults to `lookup`;
- a query ending in `?` explicitly selects `research`;
- an explicit `lookup` / `research` control always overrides inference;
- the selected path is visible before submission and can be changed with the keyboard or pointer;
- unpunctuated input remains on the cheap lookup path;
- after lookup, show the non-blocking `Research this with Dorothy Ann` suggestion only when the trimmed query has at least four tokens and starts with a fixed interrogative prefix (`what`, `what's`, `why`, `how`, `when`, `where`, `who`, `which`, `is`, `are`, `can`, `could`, `should`, `does`, `do`, or `did`);
- no model call is required merely to decide which path to use.

The punctuation rule and visible route chip are the only MVP routing controls; slash commands and bang aliases are deferred. The punctuation rule applies only to new queries. Inside an existing topic, follow-up questions default to contextual chat even when they end in `?`; fresh research requires an explicit per-turn selection.

When research occurs, the interface should show both:

1. The result set returned by the search layer.
2. Dorothy Ann's synthesized answer with citations linked to those sources.

The product must preserve the distinction between retrieved evidence and model synthesis.

### Topic Sessions

A thread needs only:

- title and timestamps;
- deployment-assigned model/search references;
- ordered turns;
- research runs and sources attached to relevant turns.

Required actions:

- create with a deterministic title from the first query (trimmed and capped at 60 characters);
- rename;
- delete;
- export.

Folders, tags, embeddings, semantic retrieval, and cross-thread memory are outside the initial scope.

### Dorothy Ann Reports, Transcripts, and Pi.dev Handoff

Export is a primary workflow, not a miscellaneous settings action. The user should be able to turn either one researched answer or a whole topic into an artifact without cleaning up provider-specific JSON or losing source provenance.

Support:

- download as `.md`;
- copy as Markdown;
- invoke the platform share action where available;
- export one researched answer or a whole topic as a Dorothy Ann report;
- export a whole topic as a durable transcript;
- preview and edit the artifact before it leaves the application.

The initial pi.dev integration should be file/protocol-level rather than a deep API integration: produce predictable Markdown that can be pasted, downloaded, shared, or placed into the working context of a pi session. Avoid coupling the web app to pi internals until the artifact contract proves useful.

A **Dorothy Ann report** is the branded, source-aware artifact intended for sharing or pi.dev handoff. It should optimize for actionability rather than transcript completeness and preserve:

- the user's objective and relevant constraints;
- conclusions and claims, separated from evidence;
- source links and optionally bounded source excerpts;
- decisions made and decisions still open;
- concrete next actions or an implementation prompt;
- an explicit note that the content is research context, not executed or verified work.

The two MVP export forms are:

1. **Dorothy Ann report** — concise context, conclusions, decisions, unresolved questions, sources, and suggested next actions. An answer-scoped report deterministically renders that researched turn; a topic-scoped report may use one model-assisted condensation pass.
2. **Transcript** — deterministic complete conversation with sources and metadata, available at whole-topic scope.

Arbitrary message/source selection and a special pi.dev API or import protocol are deferred. The report remains ordinary Markdown that can be copied, downloaded, shared, pasted into pi.dev, or placed in a repository.

Example transcript shape:

```markdown
---
title: "Topic title"
created: 2026-05-12T14:32:00Z
updated: 2026-05-12T15:04:00Z
model: provider/model
search_provider: configured-provider
---

# Topic title

## User

Question or prompt.

## Assistant

Answer with source references.

## Sources

1. [Source title](https://example.com)
```

## dorothy-ann Product Identity

The product and agent are named **dorothy-ann**. In interface prose, the speaking agent may be called **Dorothy Ann**. The core interaction is inspired by the character from *The Magic School Bus*: curious, prepared, evidence-oriented, and recognizable for beginning a researched response with:

> According to my research…

This phrase is earned by the research path; it must not appear for an ordinary lookup or unsupported chat answer. A Dorothy Ann response should be direct rather than theatrical:

```text
According to my research…

[direct synthesis]

What I found
- [source-backed finding]
- [source-backed finding]

Caveats / uncertainty
- [conflicting evidence or limits]

Sources
- [clickable citations]
```

The identity belongs to the application layer, not a model provider. The system prompt defines the voice and evidence rules; normalized source data supports citations; the UI owns labels, progress language, and report sections; and exporters preserve the same identity in Markdown. Provider adapters must not contain product branding or be relied upon to produce the report shape correctly.

## Concrete Application Stack

Settled:

- **toolchain:** one npm package with committed `package-lock.json`, TypeScript strict mode, and Node 22 pinned in `engines`/local tooling;
- **deployment target:** Vercel for production and preview deployments;
- **frontend UI/build:** React + Vite + TypeScript;
- **routing:** React Router with `/unlock`, `/`, `/topics/:threadId`, and `/topics/:threadId/export/:draftId` routes;
- **workflow state:** XState for auth, lookup/research turn, and topic-report actors only; local React state for ordinary UI state; no global store;
- **accessible primitives:** React Aria Components, styled locally; topic drawer/evidence sheet use modal/dialog primitives;
- **Markdown:** `react-markdown` + `remark-gfm` + `rehype-sanitize`; raw HTML disabled;
- **report editor:** autosaving native textarea with Edit/Preview toggle; no rich editor in MVP;
- **styling:** CSS Modules for components plus global CSS custom-property tokens; no CSS-in-JS or utility framework;
- **tests:** Vitest + React Testing Library + MSW + `fake-indexeddb`; Playwright desktop/mobile E2E with axe-core checks;
- **schemas/transport:** Zod at HTTP, provider-normalization, backup-import, and persisted-envelope boundaries; `eventsource-parser` for POSTed SSE responses;
- **backend HTTP layer:** Hono using standard Web `Request`/`Response` and SSE-compatible streaming; `@hono/node-server` locally and the thin Hono Vercel adapter in `api/index.ts`;
- **search/chat providers:** Brave through standard `fetch`; Anthropic through `@anthropic-ai/sdk`, both behind ports;
- **extraction:** Vercel Node adapter using `undici` + `linkedom` + `@mozilla/readability` behind `ContentExtractor`;
- **login limiter:** Upstash Redis + `@upstash/ratelimit` behind `LoginAttemptLimiter`; in-memory local adapter;
- **portability boundary:** Hono application/orchestration code contains no Vercel imports; a thin Vercel function entrypoint binds environment, secrets, limits, and platform request lifecycle;
- **local runtime:** a thin Node adapter runs the same Hono application and API contracts used on Vercel;
- **browser persistence:** IndexedDB through `idb`;
- **quality tooling:** ESLint for TypeScript/React/import-boundary rules; no separate formatter requirement.

React is the selected UI framework. It is used as a client-side Vite SPA, not through Next.js or another full-stack React framework. React Router owns URL parsing, deep links, browser Back behavior, and restoration hooks. XState machines live outside React components and consume normalized application events:

- `authMachine` — checking, locked, unlocking, authenticated, limited, unavailable, expired;
- `turnMachine` — lookup, search, extraction, synthesis/chat streaming, completed, stopped, failed, interrupted, and stage-specific retry;
- `reportMachine` — choosing, deterministic render or generation, clean/dirty workbench, save failure, and retry.

Machines do not become a second persistence model. Completed stages are written through `ThreadStore`/`ArtifactDraftStore`; on reload, machines initialize from persisted domain objects and route state. Drawer visibility, evidence collapse, field drafts, and other short-lived UI details remain local React state unless the interaction contract explicitly requires restoration. There is no Zustand/Redux-style global store.

React Aria Components owns low-level accessible interaction semantics for buttons, links, fields, menus, dialogs, modals, and focus restoration. The desktop topic drawer and mobile evidence sheet are presentation variants of the same dialog/modal primitives. Status announcements use explicit ARIA live regions; visual toasts never carry unique information. Component styling remains application-owned, and React Aria objects do not enter domain or storage types.

Assistant answers, report previews, and transcripts render through one Markdown pipeline: structural `AssistantContentPart` citations are first projected into message-local Markdown links, then `react-markdown` applies `remark-gfm` and `rehype-sanitize`. Raw HTML remains disabled; do not add `rehype-raw`. External links receive safe target/rel behavior, and code renders as semantic `pre`/`code` without a syntax-highlighting dependency in the MVP.

The artifact workbench has mutually exclusive Edit and Preview modes. Edit is a controlled native textarea bound to the current `ArtifactDraft`; changes autosave through `ArtifactDraftStore` after a short debounce and flush on route exit where possible. Preview uses the same sanitized renderer as answers. The textarea preserves plain Markdown exactly, remains usable on mobile, and is the source of downloaded/copied content.

Verification is layered:

- Vitest covers normalized domain functions, citation numbering, deterministic exports, migrations, Hono contract tests, and XState transition/guard tests;
- React Testing Library + `user-event` covers rendered state, keyboard behavior, live-region announcements, and focus restoration without asserting component internals;
- MSW supplies lookup/SSE/report fixtures, including partial and interrupted streams;
- `fake-indexeddb` verifies `LocalThreadStore` and `ArtifactDraftStore` transactions, migrations, quota/error handling, and import conflicts;
- Playwright runs the agreed happy/error paths against the local Node adapter with desktop Chromium and a mobile WebKit viewport initially;
- `@axe-core/playwright` checks representative unlock, home, lookup, research, evidence, dialog, and workbench states; zero serious/critical violations is required.

Styling is split into global design foundations and local component ownership:

```text
src/ui/styles/tokens.css    color, type, spacing, radii, elevation, motion
src/ui/styles/global.css    reset, document defaults, focus and reduced-motion rules
*.module.css                component layout and visual states
```

React Aria and XState status/data attributes drive CSS Module selectors; components do not construct ad hoc global class names. Responsive behavior uses content-driven media/container queries, mobile safe-area insets, and the agreed drawer/panel/sheet layouts. Status never depends on color alone. Tokens preserve a future theme seam, but multiple themes are not an MVP requirement.

Domain types, research orchestration, export rendering, and storage adapters remain plain TypeScript rather than React-specific modules. React owns rendering, focus/overlay behavior, and composition around those boundaries. Vercel remains the target; SPA deep-link rewrites belong only in `vercel.json`.

## Initial Provider Strategy

The alpha uses **Brave Search API** as the `SearchProvider` and **Anthropic API** as the `ChatProvider`. This gives the personal pi.dev workflow and dorothy-ann a common LLM vendor while keeping web retrieval independent and application-controlled. Use separate Anthropic API keys for pi.dev and dorothy-ann when the account supports it; keep them under the same personal billing relationship to preserve one vendor/payment surface while limiting credential blast radius and making usage attributable.

Brave owns ranked discovery only. Dorothy Ann must not receive a provider-generated research answer from Brave or Anthropic's hosted web-search tool in the MVP. The application owns the bounded pipeline:

```text
Brave ranked results
  → normalized SearchResult[]
  → URL safety, canonicalization, and bounded extraction
  → EvidencePack
  → Anthropic chat / research synthesis / report generation
  → normalized AssistantContentPart[] with app-owned citations
```

This preserves a meaningful distinction between retrieval and synthesis. Brave results are provider-ranked and their snippets are not guaranteed to be literal page quotations, but they are not an LLM research answer. Raw provider payloads remain adapter-only; normalized results, extracted pages, and evidence packs are the inspectable application inputs. Retrieved content is untrusted reference material and must be delimited from system instructions.

The adapter must preserve the application's separate boundaries:

```text
SearchProvider (Brave initially)
  └── provider response → normalized SearchResult[]

ContentExtractor (application-controlled)
  └── safe URL → bounded ExtractedPage / ExtractionOutcome

ChatProvider (Anthropic initially)
  └── EvidencePack + context → streamed ChatProviderEvent[]
```

Do not store raw provider payloads as the domain model. Provider choice remains deployment configuration behind the ports, not user-configurable UI. A second implementation is unnecessary for alpha; fake adapters and contract tests verify the seam.

## Content Extraction Adapter

The MVP owns extraction rather than calling a hosted reader service. A Node-specific infrastructure adapter composes:

- `undici` for bounded HTTP requests and a controlled dispatcher;
- `node:dns/promises` plus IP classification for destination validation;
- `linkedom` for a lightweight DOM implementation;
- `@mozilla/readability` for main-content extraction.

This adapter runs in a Vercel Node Function, not the Edge runtime. `ContentExtractor` remains platform-neutral, so another runtime can replace the fetch/DOM implementation without changing research orchestration.

Safe fetch sequence:

```text
parse candidate URL
  → require http/https, no credentials, allowed port
  → resolve all A/AAAA records
  → reject loopback/private/link-local/multicast/reserved destinations
  → connect through validated/pinned lookup
  → fetch with manual redirects and timeout
  → repeat validation for every redirect target
  → stream with compressed/decoded byte bounds
  → accept supported textual content type only
  → parse/extract/bound readable text
  → emit ExtractionOutcome
```

Requirements:

- permit only standard HTTP/HTTPS ports in the MVP;
- identify Dorothy Ann with a configurable user agent and accept header;
- cap redirect count, response bytes, decoded characters, and wall-clock duration;
- prevent DNS-rebinding bypass by using the validated address in the actual connection rather than checking DNS and then performing an unrelated lookup;
- accept `text/html` and bounded `text/plain`; mark PDFs, media, downloads, and unknown content types `unsupported_content`;
- for HTML, parse with `linkedom`, run Readability, remove markup, normalize whitespace, and require a configurable minimum readable character count;
- never execute scripts, load subresources, submit forms, or use a headless browser;
- keep title, canonical URL, extraction timestamp, text, and character count; discard the raw response body and DOM after normalization;
- distinguish retryable fetch/timeout failures from deterministic blocked/unsupported/empty skips;
- walk Brave results in rank order until three viable pages are collected or candidates are exhausted.

Fixture tests must cover public HTML, plain text, malformed HTML, redirects, redirect-to-private targets, direct private/IPv6/link-local addresses, DNS rebinding simulation, oversized/decompression-bomb responses, timeouts, duplicate canonical URLs, unsupported PDFs, empty Readability output, and successful truncation. JavaScript rendering, paywall bypass, authentication, PDF parsing, and browser automation are explicitly deferred.

## Browser Interaction Design

### Browser State Layout Completion

- [x] Draft and agree on the happy-path state transition matrix and paired desktop/mobile shell.
- [x] Expand the matrix into an exhaustive transition table covering every product-significant loading, empty, partial, error, and recovery state.
- [x] Draw and agree on the corresponding desktop/mobile variants, including actions, focus, persistence, events, and accessibility.

The design pass must cover this state matrix:

| Area | States to design |
|---|---|
| Access | checking session, unlock form, invalid/rate-limited passphrase, expired session during an action |
| Initial query | empty home, typing with inferred lookup, terminal-`?` research routing, explicit route override, submitting |
| Lookup | loading, ranked results, keyboard-focused top result, no results, failure/retry, question-shaped research suggestion, promotion to research |
| Research | searching, sources arrived, extracting, synthesizing, complete answer, fewer-than-three viable sources, zero viable sources, search/extraction/synthesis failure, interrupted stream, stage-specific retry |
| Chat follow-up | idle composer, contextual chat streaming/completed, explicit fresh-research selection, stop, retry |
| Evidence | inline source summary, desktop drawer, mobile bottom sheet, citation focus, extracted excerpt, original-source exit, blocked/failed source |
| Topics | recent-topic list, active topic, rename, delete confirmation, empty view |
| Export | answer report, topic report/transcript choice, report generation, editable preview, copy/download/native share, unsupported-share fallback, export failure |
| Storage | initial load, save in progress if surfaced, quota/unavailable/corrupt record, backup export/import, migration failure with recovery export |

For each state, the agreed design should make these details explicit:

- responsive information hierarchy and which elements disappear, collapse, or move between desktop and mobile;
- primary and secondary actions, keyboard behavior, focus destination, and cancellation path;
- transitions into and out of the state;
- what persists locally if the page reloads or an operation fails;
- which backend response or stream event drives the state;
- accessible labels and non-color-only status cues.

The wireframes may group states that share a shell, but loading, empty, partial, error, and recovery variants must be shown rather than implied. This state design is the accepted alpha interaction contract.

### Happy-Path State Transition Matrix

This matrix isolates the main route through the product; the exhaustive matrix immediately after it defines alternate and recovery transitions.

| ID | State | Entered from / trigger | Primary visible action | Persists on entry | Happy-path exit |
|---|---|---|---|---|---|
| A0 | Session check | app/deep-link load | none; branded bounded loading state | no topic read yet | authenticated → requested route; otherwise A1 |
| A1 | Unlock | unauthenticated A0 | enter passphrase and `Unlock` | only validated local `returnTo` | success → requested route H0/L1/R5 |
| H0 | Empty home | authenticated root or `New topic` | focus query field | recent topic summaries loaded | typing → H1 |
| H1 | Lookup-routed query | unpunctuated input | submit lookup; chip permits override | draft may remain in UI only | submit → L0 |
| H2 | Research-routed query | terminal `?` or chip override | `Ask Dorothy Ann` | draft may remain in UI only | submit → R0 |
| L0 | Lookup loading | submit H1 | cancel | query only; no topic required yet | response → L1 |
| L1 | Lookup results | successful L0 | open focused result | query + normalized results may be held for promotion | open link exits browser; promote → R0; edit → H1/H2 |
| R0 | Research turn created | submit H2 or promote L1 | observe/cancel search | user turn and stable IDs | first progress → R1 |
| R1 | Searching | R0 | cancel | running turn | sources event → R2 |
| R2 | Sources available / extracting | R1 | inspect source summary | ranked sources + run state | viable extraction → R3 |
| R3 | Synthesizing | R2 | inspect evidence or stop | viable bounded excerpts + run state | completion → R4 |
| R4 | Completed research answer | R3 | read/cite/open source | completed turn, answer, evidence | compose → C0; export → E0 |
| C0 | Follow-up ready | R4 or completed C1 | submit chat; optionally switch to research | draft UI-only until submit | chat submit → C1; research submit → R0 |
| C1 | Follow-up streaming | submit C0 | stop | user turn + stable IDs | completion → R4-style completed turn |
| E0 | Export choice | answer/topic export action | choose report/transcript where applicable | no artifact edits yet | deterministic render or generation → E1 |
| E1 | Editable preview | E0 | edit, copy, download, or share | artifact draft separate from topic | complete action → prior topic; cancel → prior topic |

### Exhaustive MVP State-Transition Matrix

The tables below expand the happy path into every product-significant MVP transition. “Persist” means commit through `ThreadStore`; transient buffers and focus state remain UI-only unless stated otherwise.

#### Access

| From | Event / guard | To | Persist and recovery behavior |
|---|---|---|---|
| A0 session check | valid session | requested H0, L1, R4, or E3 route | do not read topic content before validation; restore requested local route |
| A0 | no/expired session | A1 unlock | retain only validated same-origin `returnTo` |
| A0 | session endpoint unavailable | A2 access unavailable | no unlock submission; retry session check |
| A1 unlock | valid passphrase | requested route | set secure cookie; clear input; announce success |
| A1 | invalid passphrase | A1-invalid | clear passphrase, keep focus, announce error; allow retry |
| A1 / A1-invalid | limiter rejects | A1-limited | disable submit until server-provided retry time; preserve no passphrase |
| A1-limited | retry window elapses | A1 | re-enable form and focus input |
| any protected state | request returns 401 before work starts | A1-expired | preserve local draft/turn; unlock then replay the unstarted action once |
| R1–R3/C1/E2 | auth/connection ends after work starts | interrupted state for that area + A1-expired | preserve last completed stage; never blindly replay a possibly completed model call |
| authenticated state | user selects Lock | A1 | clear cookie and in-memory sensitive buffers; leave IndexedDB untouched but unread by app shell |

#### Initial Query and Routing

| From | Event / guard | To | Persist and recovery behavior |
|---|---|---|---|
| H0 empty home | focus/type keyword or unpunctuated text | H1 lookup-routed draft | draft UI-only; chip and submit label announce `lookup` |
| H0/H1 | terminal `?` added | H2 research-routed draft | draft UI-only; chip and submit label announce `research` |
| H2 | terminal `?` removed before explicit override | H1 | recompute route visibly |
| H1/H2 | user changes route chip | H1-pinned or H2-pinned | pin route for this draft; punctuation no longer overrides |
| H1/H2 | query becomes empty/whitespace | H0 | disable submit; do not create a turn |
| H1 | submit | L0 | preserve query in loading view; no topic persistence required |
| H2 | submit | R0 | create topic if needed; persist user turn and stable IDs before network work |
| H0–H2 | choose recent topic | C0/R4 for topic | load full thread lazily; restore saved conversation position when available |

#### Lookup and Promotion

| From | Event / guard | To | Persist and recovery behavior |
|---|---|---|---|
| L0 loading | lookup succeeds with results | L1 results | keep normalized results in current view for opening/promotion; announce count |
| L0 | lookup succeeds empty | L2 no results | preserve query; offer edit or research, but do not invent links |
| L0 | lookup fails retryably | L3 lookup error | preserve query; retry repeats lookup only |
| L0 | user cancels | H1 | abort request where possible; restore query and focus input |
| L1 | keyboard/pointer activates result | external source | open according to browser preference; retain results page |
| L1 | query edited | H1/H2 | invalidate old result set for promotion once resubmitted |
| L1 | `Research this with Dorothy Ann` | R0 promoted | create topic/run with original query, ranks, and source IDs; do not repeat search |
| L2 | edit query | H1/H2 | restore query input selected/focused |
| L2 | explicitly research same query | R0 | perform normal research search because there is no useful set to promote |
| L3 | retry | L0 | same query and new request ID |
| L3 | edit | H1/H2 | return query to composer |

#### Research

| From | Event / guard | To | Persist and recovery behavior |
|---|---|---|---|
| R0 created | stream accepted / `turn.started` | R1 searching | mark turn running |
| R1 | `research.query` | R1 | display query; persist it on run |
| R1 | `research.sources` with results | R2 extracting | persist normalized results; desktop opens evidence; mobile announces source count |
| R1 | search returns no results | R2-zero-results | persist insufficient-evidence run; show edit/retry; no synthesis |
| R1 | `turn.failed(stage=search)` | R1-failed | persist failed run; retry resumes at search |
| R1 | Stop | R-stopped | abort; persist interrupted/stopped turn with no assistant message |
| R2 | each extraction outcome | R2 | persist outcome; advance viable/target progress; skipped pages do not consume target |
| R2 | reaches three viable pages | R3 synthesizing | freeze bounded evidence set for this synthesis |
| R2 | candidates exhausted with one/two viable | R3-partial | synthesize with mandatory reduced-evidence caveat |
| R2 | candidates exhausted with zero viable | R2-insufficient | preserve results/outcomes; no Dorothy Ann claim or synthesis |
| R2 | extraction infrastructure fails after one/two viable | R2-failed-partial | offer synthesize-with-caveat or retry extraction; do not auto-decide |
| R2 | extraction infrastructure fails with zero viable | R2-failed | retry extraction or edit/new query |
| R2 | Stop | R-stopped | retain sources/outcomes; no synthesis |
| R3/R3-partial | `answer.delta` | same state | append transient structured parts; do not persist as completed answer |
| R3/R3-partial | `turn.completed` | R4/R4-partial | atomically persist assistant message, run, status, usage; partial variant includes caveat |
| R3/R3-partial | synthesis failure | R3-failed | discard persisted-answer status, retain transient buffer dimmed and evidence; retry synthesis only |
| R3/R3-partial | Stop or connection loss | R3-interrupted | same preservation as failure; retry synthesis with same evidence/stable IDs |
| R2-insufficient | retry extraction | R2 | retry only failed/eligible candidates; retain prior outcomes for inspection |
| R2-insufficient | edit/new query | H2 | preserve failed topic turn; begin a new research turn rather than mutating history |
| R4/R4-partial | ask chat follow-up | C1 | persist new user turn before streaming |
| R4/R4-partial | ask fresh research | R0 | persist new research turn; new run has its own three-page target |
| R4/R4-partial | activate citation | V1 focused evidence | resolve message-local number to stable source ID |
| any failed/interrupted R state | retry | stage-specific running state | update existing turn/run; never append duplicate user message |

#### Chat Follow-up

| From | Event / guard | To | Persist and recovery behavior |
|---|---|---|---|
| C0 idle | submit in default chat mode | C1 streaming | persist user turn; send bounded completed context only |
| C0 | select research then submit | R0 | persist as research turn; punctuation alone does not change mode |
| C1 | `answer.delta` | C1 | transient assistant buffer only |
| C1 | `turn.completed` | C2 complete | atomically persist assistant message/status/usage; return composer to chat |
| C1 | Stop / failure / disconnect | C1-interrupted | keep user turn, dim transient prose, offer `Retry answer`; no partial context/export |
| C1-interrupted | retry | C1 | reuse stable turn ID and same bounded context |
| C2 | Retry answer | C1 | replace assistant answer only after new completion; retain old answer until then |

#### Evidence

| From | Event / guard | To | Persist and recovery behavior |
|---|---|---|---|
| R2 desktop | sources arrive | V0 panel open | UI preference for current run only; source data already persisted |
| V0 | collapse | V-hidden | remember for current run; keep source-count affordance visible |
| V-hidden/V0 | citation activated | V1 source focused | open panel/sheet, scroll source into view, return focus to citation on close |
| mobile answer | source-count activated | V0-sheet | open modal bottom sheet without moving answer scroll |
| V1 | expand excerpt | V2 excerpt | show only stored bounded content; label snippet vs extracted passage |
| V1/V2 | Open original | external source | open safely in new browser context; retain local state |
| V0/V1 | failed/blocked source selected | V3 unavailable | show reason category and metadata; never fabricate excerpt |
| V0-sheet | swipe/close/Escape | prior answer | restore activating control focus and answer scroll |

#### Topics

| From | Event / guard | To | Persist and recovery behavior |
|---|---|---|---|
| any authenticated app state | open `[☰]` | T0 topic drawer | overlay without resizing; trap focus; Escape closes |
| T0 | select topic | C0/R4 for topic | close drawer, lazily load thread, restore position |
| T0 | New topic | H0 | close drawer and focus query |
| T0 | rename | T1 rename | inline/dialog input with existing title; save updates full record + summary transactionally |
| T0 | Delete | T3 confirm delete | name topic and explain local permanence; default focus Cancel |
| T3 | confirm | T0 or H0 if active | delete full + summary records transactionally; no silent undo promise |
| T3 | cancel/Escape | prior drawer | no mutation; restore Delete button focus |
| topic load | record missing/corrupt | S4 recovery | keep summary if useful; offer recovery export/delete |

#### Export and Artifact Workbench

| From | Event / guard | To | Persist and recovery behavior |
|---|---|---|---|
| R4 answer | Export report | E1 deterministic workbench | render answer report locally; no chooser/model call |
| topic header | Export topic | E0 chooser | focus selected default `Dorothy Ann report`; Escape returns to topic |
| E0 | choose transcript | E1 deterministic workbench | render locally from completed turns |
| E0 | choose report | E2 generating workbench | call one bounded condensation request; preserve topic unchanged |
| E2 | generation deltas/completes | E3 clean workbench | transient until complete, then save `ArtifactDraft` separately from topic |
| E2 | failure/disconnect | E2-failed | retain topic and any dimmed transient draft; retry generation only |
| E1/E3 | edit | E4 dirty workbench | autosave `ArtifactDraft` locally; never mutate topic |
| E1/E3/E4 | Copy | same + success notice | clipboard failure leaves content selected and offers manual copy |
| E1/E3/E4 | Download | same + success notice | create `.md` locally; failure retains draft |
| E1/E3/E4 | Share supported | native share → same | cancellation is neutral; failure returns with draft intact |
| E1/E3/E4 | Share unsupported | same | hide/disable with explanation; Copy/Download remain |
| E4 | Back/close | E4-confirm | choose Keep draft, Discard, or Stay; no silent loss |
| E1/E3 | Back | prior topic | restore conversation scroll/focus |
| workbench route reload | saved draft exists | E3/E4 | restore draft and dirty state |
| same export target opened with draft | resume choice | Resume restores it; Start over requires confirmation then replaces it |
| workbench route reload | no draft + deterministic request | E1 | reconstruct from topic |
| workbench route reload | no draft + generated report | E2-recover | offer regenerate; do not imply prior edits survived |
| E4-confirm | Keep draft and return | prior topic | committed draft remains resumable from the same export target |
| E4-confirm | Discard edits | prior topic | delete draft, then restore topic position |

#### Browser Storage, Import, and Migration

| From | Event / guard | To | Persist and recovery behavior |
|---|---|---|---|
| app after auth | open IndexedDB succeeds | requested app state | load summaries only, then lazy full threads |
| app after auth | IndexedDB unavailable | S1 storage unavailable | keep current session in memory; prominently offer artifact/data-backup download; explain reload risk |
| any atomic save | success | originating state | update UI only from committed normalized record where practical |
| any atomic save | quota exceeded | S2 quota | retain current exportable state in memory; offer backup/export and storage cleanup; do not report saved |
| topic load/migration | one record corrupt | S3 corrupt record | isolate record; keep app usable; offer raw recovery export and deletion |
| database upgrade | envelope migration succeeds | requested state | commit upgraded envelope; preserve IDs/timestamps |
| database upgrade | envelope migration fails | S4 migration recovery | do not overwrite source record; offer recovery export; block only affected topic |
| settings/topic drawer | Export data backup | S5 backup creating | deterministic local serialization; download on success; report excluded/corrupt records explicitly |
| settings/topic drawer | Import backup selected | S6 import preview | validate version/content before writes; report add/replace/skip counts |
| S6 | confirm import | prior app state | transactionally add/replace according to explicit conflict policy; return `ImportReport` |
| S6 | cancel/invalid backup | prior state/S6 error | no writes |

#### Global Interaction Rules

- Every async state has an announced text label, not a spinner/color alone.
- `Escape` cancels the smallest active overlay first; it never silently deletes a draft or persisted turn.
- Stop is best-effort: the client aborts transport, marks the existing turn interrupted, and ignores late events that do not match the active request ID.
- A page reload reconstructs only committed turns. Transient model prose is never promoted to completed content after reload.
- Auth and storage failures supersede the current visual state but retain the local recoverable payload described above.
- Only one modal surface is active: topic drawer, evidence sheet, confirmation dialog, export chooser, or mobile workbench transition.

### Responsive Shell

Desktop uses a stable content-first shell with a closed-by-default topic drawer. The only side-by-side regions are main content and optional evidence, avoiding a cramped three-column layout. Topic navigation is always reachable from the header but never reserves width.

```text
DESKTOP — shared shell
┌──────────────────────────────────────────────────────────────┬────────────────────────┐
│ [☰] dorothy-ann   topic title               [export]    [+] │ evidence           [×] │
├──────────────────────────────────────────────────────────────┤                        │
│                                                              │ source list or focused │
│ main query / results / conversation                          │ source + excerpt       │
│                                                              │                        │
│                                                              │                        │
├──────────────────────────────────────────────────────────────┤                        │
│ sticky turn composer                                         │                        │
└──────────────────────────────────────────────────────────────┴────────────────────────┘
                         fluid                                   optional/collapsible

DESKTOP — topic drawer open (overlays; does not resize content)
┌──────────────────────────┬────────────────────────────────────────────────────────────┐
│ Topics               [×] │ dimmed current content                                    │
│ [+ New topic]            │                                                            │
│                          │                                                            │
│ Recent                   │                                                            │
│ • composition…           │                                                            │
│ • sqlite vs…             │                                                            │
│                          │                                                            │
│ [Settings] [Lock]        │                                                            │
└──────────────────────────┴────────────────────────────────────────────────────────────┘
```

Mobile uses one content column. Topics are a left drawer, evidence is a bottom sheet, and export preview becomes full-screen. Only one overlay is open at a time.

```text
MOBILE — shared shell
┌────────────────────────────────┐
│ [☰] dorothy-ann          [+]   │
│ topic title              [•••] │
├────────────────────────────────┤
│                                │
│ main query / results /         │
│ conversation                   │
│                                │
│                                │
├────────────────────────────────┤
│ [3 sources]                    │ ← opens evidence bottom sheet
│ [chat ▾] Ask a follow-up… [↑]  │ ← sticky above safe area/keyboard
└────────────────────────────────┘
```

### Happy-Path Wireframes

#### Access and Initial Query

```text
DESKTOP — unlock                         MOBILE — unlock
┌────────────────────────────────────┐   ┌──────────────────────────┐
│            dorothy-ann             │   │       dorothy-ann        │
│                                    │   │                          │
│   This research desk is private.   │   │ This research desk is   │
│   Passphrase                       │   │ private.                 │
│   ┌────────────────────────────┐   │   │                          │
│   │ ••••••••••••••             │   │   │ Passphrase               │
│   └────────────────────────────┘   │   │ ┌──────────────────────┐ │
│                         [Unlock]   │   │ │ •••••••••••           │ │
└────────────────────────────────────┘   │ └──────────────────────┘ │
                                         │ [Unlock]                 │
                                         └──────────────────────────┘

DESKTOP — home                           MOBILE — home
┌───────────────────────────────────────────────────────────────────┐
│ [☰] dorothy-ann                                             [+]  │
│                                                                   │
│                  What should we look up?                          │
│         ┌────────────────────────────────────────────┐            │
│         │ weather                                    │            │
│         └────────────────────────────────────────────┘            │
│         [lookup ▾]                                     [Go]      │
│         Add ? to ask Dorothy Ann to research.                    │
│                                                                   │
│         Recent: composition…  ·  sqlite vs…                      │
└───────────────────────────────────────────────────────────────────┘
                                         ┌──────────────────────────┐
                                         │ [☰] dorothy-ann    [+]   │
                                         ├──────────────────────────┤
                                         │ What should we look up?  │
                                         │ ┌──────────────────────┐ │
                                         │ │ weather              │ │
                                         │ └──────────────────────┘ │
                                         │ [lookup ▾]        [Go]  │
                                         │ Add ? for research.     │
                                         │                          │
                                         │ Recent                   │
                                         │ • composition…           │
                                         └──────────────────────────┘
```

The home route chip changes label and submit copy together: `lookup / Go` versus `research / Ask Dorothy Ann`. The routing hint is text, not color alone.

#### Lookup Results and Promotion

```text
DESKTOP — lookup results
┌──────────────────────────────────────────────────────────────────────────────┐
│ [☰] dorothy-ann   [life alive                         ] [lookup ▾] [→]  [+] │
├──────────────────────────────────────────────────────────────────────────────┤
│ About 10 results                                                             │
│                                                                              │
│ > Life Alive Organic Cafe                                                    │
│   lifealive.com                                                              │
│   Organic cafés, menu, locations…                                            │
│                                                                              │
│   Life Alive — Cambridge                                                     │
│   maps.example…                                                              │
│                                                                              │
│ [Research this with Dorothy Ann]                                             │
└──────────────────────────────────────────────────────────────────────────────┘

MOBILE — lookup results
┌────────────────────────────────┐
│ [☰] dorothy-ann          [+]   │
│ [life alive            ] [→]   │
│ [lookup ▾]                    │
├────────────────────────────────┤
│ > Life Alive Organic Cafe      │
│   lifealive.com                │
│   Organic cafés, menu…         │
│                                │
│   Life Alive — Cambridge       │
│   maps.example…                │
│                                │
│ [Research this with            │
│  Dorothy Ann]                  │
└────────────────────────────────┘
```

The first result receives initial keyboard focus after results are announced. Enter opens it; focus remains in the result list for arrow-key navigation. Promotion is secondary to opening a result.

#### Research Progress and Completed Answer

```text
DESKTOP — research in progress
┌──────────────────────────────────────────────────────────────┬────────────────────────┐
│ [☰] composition over inheritance                       [+]  │ evidence           [×] │
├──────────────────────────────────────────────────────────────┤ 1. source title        │
│ ✓ searched the web                                           │ 2. source title        │
│ ✓ found 8 sources                                            │ 3. source title        │
│ ◌ reading useful pages (2 of 3)                              │                        │
│                                                              │ [open original]        │
│                                                       [Stop] │                        │
└──────────────────────────────────────────────────────────────┴────────────────────────┘

DESKTOP — completed research + follow-up
┌──────────────────────────────────────────────────────────────┬────────────────────────┐
│ [☰] composition over inheritance              [export] [+]  │ evidence           [×] │
├──────────────────────────────────────────────────────────────┤ [1] source title       │
│ Dorothy Ann                                                  │     bounded excerpt…   │
│ According to my research…                                    │ [open original]        │
│                                                              │                        │
│ Composition usually… [1]                                     │ [2] source title       │
│                                                              │ [3] source title       │
│ What I found                                                 │                        │
│ • … [2]                                                     │                        │
│                                                              │                        │
│ [Export report] [Copy]                                      │                        │
├──────────────────────────────────────────────────────────────┤                        │
│ [chat ▾] Ask a follow-up…                               [↑] │                        │
└──────────────────────────────────────────────────────────────┴────────────────────────┘

MOBILE — progress                    MOBILE — completed + evidence sheet
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ [☰] dorothy-ann          [+]   │   │ [☰] composition…        [•••] │
│ composition over…              │   ├────────────────────────────────┤
├────────────────────────────────┤   │ Dorothy Ann                    │
│ ✓ searched the web             │   │ According to my research…     │
│ ✓ found 8 sources              │   │                                │
│ ◌ reading pages (2 of 3)       │   │ Composition usually… [1]      │
│                                │   │                                │
│ Sources  [view 8]              │   │ [Export report] [Copy]        │
│                                │   ├────────────────────────────────┤
│                         [Stop] │   │ [3 sources]                    │
└────────────────────────────────┘   │ [chat ▾] Follow-up…       [↑] │
                                     ├────────────────────────────────┤
                                     │ Evidence                 [×]  │ ← bottom sheet
                                     │ [1] source title              │
                                     │     bounded excerpt…          │
                                     │ [Open original]               │
                                     └────────────────────────────────┘
```

On mobile, opening evidence preserves scroll position in the answer. Closing the sheet returns focus to the citation that opened it. On desktop, the panel opens on the `research.sources` event, and citations reopen it when collapsed and focus the matching source. Manual collapse remains in effect until a citation is activated or a later research turn produces a new source set.

#### Export Choice and Editable Preview

```text
DESKTOP — topic export modal
┌──────────────────────────────────────────────────────────────────────────────┐
│ Export topic                                                            [×] │
│ (•) Dorothy Ann report   ( ) Transcript                                     │
│                                                                              │
│ Scope: Whole topic                                                           │
│                                                                              │
│ [Cancel]                                                   [Create preview]  │
└──────────────────────────────────────────────────────────────────────────────┘

DESKTOP — full-screen artifact workbench
┌──────────────────────────────────────────────────────────────────────────────┐
│ [← Back to topic]   Dorothy Ann report                    [Copy] [Download] │
│──────────────────────────────────────────────────────────────────────────────│
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ # Composition over inheritance                                          │ │
│ │                                                                          │ │
│ │ According to my research…                                               │ │
│ │                                                                          │ │
│ │ ## Sources                                                              │ │
│ │ 1. …                                                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                        [Share if available] │
└──────────────────────────────────────────────────────────────────────────────┘

MOBILE — full-screen artifact workbench
┌──────────────────────────────┐
│ [←] Dorothy Ann report       │
├──────────────────────────────┤
│ # Composition over…         │
│                              │
│ According to my research…   │
│                              │
│ ## Sources                   │
│ 1. …                         │
│                              │
├──────────────────────────────┤
│ [Copy] [Download] [Share]    │
└──────────────────────────────┘
```

Answer-level `Export report` skips format/scope choice and opens its deterministic workbench route directly. Topic-level export asks for report versus transcript; report generation shows progress in the workbench before editable Markdown appears. Browser Back returns to the topic and restores its scroll position.

### Loading, Error, and Recovery Wireframes

These variants reuse the agreed shells. Desktop places recoverable status near the affected content; mobile uses the full content width above the sticky primary action. Neither layout relies on toast-only errors.

#### Access Variants

```text
DESKTOP — invalid / limited                 MOBILE — expired during action
┌────────────────────────────────────────┐  ┌──────────────────────────────┐
│              dorothy-ann               │  │       Session expired        │
│                                        │  │                              │
│ Passphrase                             │  │ Your question and completed  │
│ ┌────────────────────────────────────┐ │  │ research steps are safe on   │
│ │                                    │ │  │ this device. Unlock to retry │
│ └────────────────────────────────────┘ │  │ the interrupted step.        │
│ ! That passphrase didn't work.         │  │                              │
│                         [Try again]    │  │ [Unlock] [Cancel turn]       │
│                                        │  └──────────────────────────────┘
│ — rate-limited variant —               │
│ Too many attempts. Try again in 0:42.  │  MOBILE — auth service unavailable
│ [Unlock — disabled]                    │  ┌──────────────────────────────┐
└────────────────────────────────────────┘  │ Dorothy Ann can't check your │
                                            │ session right now.           │
                                            │ [Retry]                      │
                                            └──────────────────────────────┘
```

Invalid input returns focus to the emptied passphrase field. Rate-limit countdown text is announced no more than once per meaningful interval. Auth-service failure does not invite another passphrase submission.

#### Initial Query and Lookup Variants

```text
DESKTOP — lookup loading / no results / failure
┌──────────────────────────────────────────────────────────────────────────────┐
│ [☰] dorothy-ann   [life alive                         ] [lookup ▾] [×]  [+] │
├──────────────────────────────────────────────────────────────────────────────┤
│ ◌ Searching the web…                                                        │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ No results for “life alive xyz”.                                             │
│ [Edit query]  [Research this question instead]                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ ! Search didn't finish. Your query is still here.                            │
│ [Retry lookup]  [Edit query]                                                 │
└──────────────────────────────────────────────────────────────────────────────┘

MOBILE — route preview / loading / failure
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ [what is composition?     ] │  │ ! Search didn't finish.     │
│ [research ▾]                │  │ Your query is still here.    │
│ Enter will ask Dorothy Ann. │  │                              │
│             [Ask Dorothy Ann]│  │ [Retry] [Edit]              │
└──────────────────────────────┘  └──────────────────────────────┘
```

Empty input disables submission without showing an error. Lookup cancellation restores the exact query and route chip. No-results research starts a fresh search; only a non-empty result set can use promotion without searching again.

#### Research Partial, Failure, Stop, and Retry Variants

```text
DESKTOP — fewer than 3 viable pages
┌──────────────────────────────────────────────────────┬────────────────────────┐
│ [☰] composition over inheritance               [+] │ evidence           [×] │
├──────────────────────────────────────────────────────┤ ✓ 2 viable pages       │
│ Dorothy Ann                                         │ ! 6 couldn't be read    │
│ According to my research…                           │                        │
│                                                     │ [inspect failures]     │
│ Note: I could use only 2 of the planned 3 pages.    │ [1] source…           │
│ [answer continues with citations]                   │ [2] source…           │
└──────────────────────────────────────────────────────┴────────────────────────┘

DESKTOP — extraction stopped with partial evidence
┌──────────────────────────────────────────────────────┬────────────────────────┐
│ Research paused after 1 viable page.                 │ evidence           [×] │
│ Two remaining pages could not be processed.          │ ✓ 1 viable            │
│                                                      │ ! 2 failed             │
│ [Answer with this evidence]  [Retry extraction]      │                        │
│ [Edit and research again]                            │                        │
└──────────────────────────────────────────────────────┴────────────────────────┘

DESKTOP — zero viable pages
┌──────────────────────────────────────────────────────┬────────────────────────┐
│ Dorothy Ann couldn't verify enough evidence.         │ 8 search results       │
│ No pages produced readable source content, so no     │ ! 8 unavailable        │
│ research answer was generated.                       │                        │
│                                                      │ [inspect result]       │
│ [Retry extraction]  [Edit and research again]       │                        │
└──────────────────────────────────────────────────────┴────────────────────────┘

MOBILE — failed/interrupted synthesis
┌────────────────────────────────┐
│ Research answer interrupted    │
│                                │
│ Sources are saved. The faded   │
│ draft below is incomplete and  │
│ won't be exported or reused.   │
│                                │
│ ░ According to my research… ░  │
│ ░ incomplete text…          ░  │
│                                │
│ [Retry answer] [Dismiss draft] │
│ [3 sources]                    │
└────────────────────────────────┘

MOBILE — search failed / user stopped
┌────────────────────────────────┐
│ ! Web search didn't finish.    │
│ [Retry search] [Edit question] │
├────────────────────────────────┤
│ Research stopped.              │
│ 8 results and 1 viable page    │
│ remain attached to this turn.  │
│ [Continue] [Start a new turn]  │
└────────────────────────────────┘
```

The explicit `Answer with this evidence` choice appears only after an extraction infrastructure failure with one or two viable pages. Normal candidate exhaustion with one or two pages proceeds automatically with the caveat. Zero viable pages never show a synthesis action unless extraction later succeeds.

#### Chat Retry and Interruption Variants

```text
DESKTOP — interrupted chat
┌──────────────────────────────────────────────────────────────────────────────┐
│ You: Can you explain that more simply?                                      │
│                                                                              │
│ ░ Dorothy Ann: Composition lets one object… [incomplete]                  ░  │
│ ! This reply was interrupted and is not part of the saved conversation.      │
│ [Retry answer]  [Dismiss draft]                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ [chat ▾] Ask a follow-up…                                               [↑] │
└──────────────────────────────────────────────────────────────────────────────┘

```

Retrying a completed answer leaves the prior answer visible until replacement completes. Editing earlier turns and branching/replacing downstream history is deferred from the alpha.

#### Evidence Variants

```text
DESKTOP — unavailable source                 MOBILE — evidence bottom sheet
┌──────────────────────────────┐             ┌──────────────────────────────┐
│ Evidence                [×] │             │ Evidence                [×] │
│ [2] example.com             │             │ [2] example.com             │
│                              │             │                              │
│ ! Page blocked extraction.  │             │ No excerpt is available.    │
│ Search snippet: …           │             │ Reason: blocked by site.    │
│                              │             │ Search snippet: …           │
│ [Open original]             │             │                              │
└──────────────────────────────┘             │ [Open original]             │
                                             └──────────────────────────────┘
```

Failed sources retain title, URL, rank, snippet, and a safe reason category. They are visually labeled as unavailable and cannot be cited as extracted evidence.

#### Topic Drawer Variants

```text
DESKTOP — rename                             MOBILE — delete confirmation
┌──────────────────────────┐                 ┌──────────────────────────────┐
│ Topics               [×] │                 │ Delete “Composition…”?      │
│ [+ New topic]            │                 │                              │
│                          │                 │ This removes the local topic │
│ [Composition over…    ]  │ ← inline rename │ and its sources permanently.│
│ [Save] [Cancel]          │                 │                              │
│                          │                 │ [Cancel] [Delete topic]      │
└──────────────────────────┘                 └──────────────────────────────┘

DESKTOP/MOBILE — empty drawer content
┌──────────────────────────┐
│ No recent topics yet.    │
│ Questions you research   │
│ with Dorothy Ann appear  │
│ here on this device.     │
│ [+ New topic]            │
└──────────────────────────┘
```

Delete defaults focus to Cancel and does not claim an undo capability.

#### Artifact Workbench Variants

```text
DESKTOP — generating topic report
┌──────────────────────────────────────────────────────────────────────────────┐
│ [← Back to topic]   Dorothy Ann report                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ ✓ collecting completed turns                                                │
│ ◌ drafting the report…                                                      │
│                                                                              │
│ [Cancel generation]                                                         │
└──────────────────────────────────────────────────────────────────────────────┘

DESKTOP — dirty draft on Back
┌──────────────────────────────────────────────────────────────────────────────┐
│ Keep your report edits?                                                     │
│                                                                              │
│ [Stay here]  [Discard edits]  [Keep draft and return]                       │
└──────────────────────────────────────────────────────────────────────────────┘

MOBILE — existing draft / generated-report recovery
┌────────────────────────────────┐  ┌──────────────────────────────┐
│ Resume your report draft?      │  │ This generated report has   │
│ Saved on this device 2h ago.   │  │ no saved draft to restore.  │
│                                │  │                              │
│ [Resume] [Start over]          │  │ [Regenerate] [Back]          │
└────────────────────────────────┘  └──────────────────────────────┘

MOBILE — generation failed / share unavailable
┌────────────────────────────────┐  ┌──────────────────────────────┐
│ Report generation stopped.     │  │ Dorothy Ann report          │
│ Your topic is unchanged.       │  │                              │
│                                │  │ [Copy] [Download]            │
│ [Retry] [Back to topic]        │  │ Share isn't available in    │
└────────────────────────────────┘  │ this browser.                │
                                    └──────────────────────────────┘
```

Copy/download/share results use an inline status region in the workbench header; success toasts may supplement but never replace it. Share cancellation is not rendered as an error.

#### Storage, Import, and Migration Variants

```text
DESKTOP — quota/unavailable banner
┌──────────────────────────────────────────────────────────────────────────────┐
│ ! Changes aren't saved on this device. Current content remains exportable.  │
│ [Download current report] [Export data backup] [Storage help]                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ preserved in-memory topic / answer                                           │
└──────────────────────────────────────────────────────────────────────────────┘

MOBILE — corrupt topic recovery             DESKTOP — import preview
┌────────────────────────────────┐           ┌──────────────────────────────────┐
│ This topic couldn't be loaded. │           │ Import Dorothy Ann backup       │
│ Other topics are still safe.   │           │                                  │
│                                │           │ Add 4 topics                      │
│ [Download recovery data]       │           │ Replace 1 matching topic         │
│ [Delete broken topic]          │           │ Skip 2 invalid records           │
│ [Back to topics]               │           │                                  │
└────────────────────────────────┘           │ [Cancel] [Import]                │
                                             └──────────────────────────────────┘

MOBILE/DESKTOP — migration failure
┌────────────────────────────────────────────┐
│ One topic needs recovery                   │
│ Its original stored record was not changed.│
│ [Download recovery data] [Delete record]  │
└────────────────────────────────────────────┘
```

Storage warnings remain visible until saving succeeds or the user leaves the affected content. When IndexedDB is unavailable, the current session may continue in memory only after clearly stating that reload will lose unexported work.

### New Query

The home screen is search-first rather than a blank chatbot. It contains one prominent query field, a visible route chip, and recent lightweight topics.

```text
┌──────────────────────────────────────────────────────────┐
│ dorothy-ann                                  recent ▾    │
│                                                          │
│ What should we look up?                                  │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ what's the deal with composition over inheritance?  │ │
│ └──────────────────────────────────────────────────────┘ │
│ [ research ▾ ]                         [ ask Dorothy Ann ]│
└──────────────────────────────────────────────────────────┘
```

As input changes, the route chip shows what Enter will do. On a new query, adding a terminal `?` switches `lookup` to `research`; changing the chip pins an explicit override. Unpunctuated input stays on `lookup`, though question-shaped result pages may suggest promotion to Dorothy Ann research. The user must never discover after submission that an unexpected expensive research run was inferred invisibly. Terminal punctuation does not change modes inside an existing topic, where follow-ups default to chat.

### Lookup Result

A lookup should feel like a focused search engine result page, not a failed or abbreviated chat turn:

- show ranked title, URL/domain, and snippet;
- make the top result quick to open from the keyboard;
- avoid source extraction and LLM calls;
- provide a `Research this with Dorothy Ann` action that promotes the query and existing result set into a research thread without repeating the search;
- walk results in rank order until the configured viable-page target is met or candidates are exhausted;
- allow editing/resubmitting the query with `research` selected when the existing results are not useful.

Specialized instant answers such as weather cards are not assumed for the MVP; they depend on structured data from the selected search provider. The baseline promise is fast ranked results.

Promotion preserves the original query, result ranks, and source IDs in the resulting `ResearchRun`. A page is viable only after URL safety checks, successful retrieval, canonical-URL deduplication, and extraction of enough readable text to contribute evidence. Failed, duplicate, blocked, or content-empty candidates do not consume one of the viable-page slots; the orchestrator continues down the ranked result set until it reaches the configured target or exhausts available candidates.

### Research Result and Follow-up

A research submission creates a topic thread immediately. Its response progresses through explicit states:

```text
searching → sources available → reading selected sources → synthesizing → complete
```

Source cards should appear as soon as search completes rather than waiting for synthesis. The answer then streams under the Dorothy Ann identity and begins with “According to my research…” only once evidence exists. After completion, the same composer remains active for follow-ups. Each follow-up has a visible per-turn route:

- **chat** — answer from the existing conversation and attached research context without a new search;
- **research** — perform another bounded search and attach a new `ResearchRun` to that turn.

The default follow-up route should be `chat`; the user can explicitly request fresh research when recency or new evidence matters. Requests such as “research further” or “look more broadly” start another bounded research run using the same deployment-configured three-page target rather than silently increasing one run's scope.

### Responsive Evidence

Evidence uses one information model across layouts:

- desktop: the right-side evidence panel opens automatically as soon as sources arrive, may be collapsed by the user, and stays open through synthesis by default;
- mobile: evidence remains closed until the user opens its bottom sheet from a source summary or citation;
- activating a citation opens the evidence surface if needed and focuses the matching source and bounded excerpt;
- opening the original source is a separate, obvious action;
- search snippets and extracted passages are visually distinct from Dorothy Ann's prose.

### Markdown Export

Export stays close to the content:

- each researched answer offers `Export report`;
- the topic header offers `Export topic`, then `Dorothy Ann report` or `Transcript`;
- topic export opens a compact report/transcript chooser, then navigates to a dedicated full-screen artifact workbench route;
- answer report export skips the chooser and navigates directly to the workbench;
- completion actions are copy, `.md` download, and native share where available;
- there is no arbitrary message/source selection mode in the MVP.

The export contract is explicit:

```ts
type ExportRequest =
  | { format: "dorothy_ann_report"; scope: "answer"; turnId: TurnId }
  | { format: "dorothy_ann_report"; scope: "topic"; threadId: ThreadId }
  | { format: "transcript"; scope: "topic"; threadId: ThreadId };
```

An answer-scoped Dorothy Ann report deterministically renders the question, researched answer, caveats, and message-local numbered sources; it requires no additional model call. A topic-scoped report may use one model call to condense the thread into objective, findings, evidence, decisions, open questions, and next actions. A transcript is always deterministic. Every artifact becomes editable workbench state before copy/download/share, and edits affect only that artifact—not the stored topic. The workbench has its own route beneath the topic so browser Back returns to the preserved conversation position. Refresh reconstructs deterministic exports and restores saved generated/edited `ArtifactDraft` state from IndexedDB.

A lookup-only result does not produce a Dorothy Ann report because Dorothy Ann has not researched it. `Export links` may create a small deterministic Markdown link list without invoking a model, or the user may promote the lookup to research first.

### Application HTTP and Streaming Contract

The browser owns threads in IndexedDB; the backend is an authenticated, stateless orchestration boundary for provider calls and extraction. Requests therefore carry the bounded context or preserved research stage needed for that operation. The backend never becomes an implicit second thread store.

All routes are same-origin, require a valid `AuthContext` except the auth endpoints, accept/return UTF-8 JSON unless streaming, and use a versioned envelope:

```ts
interface ApiEnvelope<T> {
  apiVersion: 1;
  requestId: string;
  data: T;
}

interface ApiErrorEnvelope {
  apiVersion: 1;
  requestId: string;
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    retryAfterSeconds?: number;
  };
}
```

Malformed, unauthorized, oversized, and rate-limited requests fail before a stream opens with normal JSON and status `400`, `401`, `413`, or `429`. Once a stream opens, terminal failures arrive as typed stream events because the HTTP status is already `200`.

#### Lookup

```text
POST /api/lookup
Content-Type: application/json

{
  "apiVersion": 1,
  "requestId": "req_…",
  "query": "life alive"
}

200
{
  "apiVersion": 1,
  "requestId": "req_…",
  "data": {
    "lookupId": "lookup_…",
    "query": "life alive",
    "results": [SearchResult],
    "completedAt": "ISO-8601"
  }
}
```

Result count is deployment-configured; the client cannot request an unbounded limit. `lookupId` identifies UI/request provenance, not server persistence. Promotion sends the returned query/results into research without a second search. The backend still repeats URL safety, size, and canonicalization checks because browser-provided result objects are untrusted.

#### Turn Stream Request

```text
POST /api/turns/stream
Accept: text/event-stream
Content-Type: application/json
```

```ts
interface TurnStreamRequestBase {
  apiVersion: 1;
  requestId: string;
  threadId: ThreadId;
  turnId: TurnId;
  userMessage: UserMessage;
  context: ThreadContextInput;
  knownSources: Array<Pick<SearchResult, "sourceId" | "canonicalUrl">>;
}

type TurnStreamRequest =
  | (TurnStreamRequestBase & {
      operation: "chat";
      replaceAssistantMessageId?: MessageId;
    })
  | (TurnStreamRequestBase & {
      operation: "research";
      runId: ResearchRunId;
      input:
        | { kind: "search"; query: string }
        | {
            kind: "promote_lookup";
            lookupId: string;
            query: string;
            results: SearchResult[];
          };
    })
  | (TurnStreamRequestBase & {
      operation: "retry_research";
      run: ResearchRun;
      resumeFrom: "search" | "extraction" | "synthesis";
      allowPartialSynthesis?: boolean;
    });

interface ThreadContextInput {
  turns: CompletedContextTurn[];
}
```

Only completed assistant messages enter `ThreadContextInput`; interrupted prose and failed extraction content are excluded. The backend reapplies deployment context/token/character limits and returns `413 context_too_large` rather than silently truncating history. The alpha then offers report/transcript export and a new topic; automatic or model-assisted context compaction is deferred.

`allowPartialSynthesis` is accepted only when retrying an extraction failure that preserved one or two viable pages and the user selected `Answer with this evidence`. Normal candidate exhaustion with partial viable evidence does not require this flag.

#### Turn SSE Events

The response uses `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, disables proxy buffering where supported, and emits monotonically increasing sequence numbers. The browser consumes it with `fetch` plus an SSE parser because native `EventSource` cannot POST the request body.

```ts
interface StreamEventBase {
  apiVersion: 1;
  requestId: string;
  sequence: number;
  occurredAt: string;
}

type TurnEvent =
  | (StreamEventBase & {
      type: "turn.started";
      turnId: TurnId;
      mode: "chat" | "research";
    })
  | (StreamEventBase & {
      type: "research.query";
      runId: ResearchRunId;
      query: string;
    })
  | (StreamEventBase & {
      type: "research.sources";
      runId: ResearchRunId;
      sources: SearchResult[];
    })
  | (StreamEventBase & {
      type: "research.extraction";
      runId: ResearchRunId;
      outcome: ExtractionOutcome;
      viableCount: number;
      targetCount: number;
    })
  | (StreamEventBase & {
      type: "research.progress";
      runId: ResearchRunId;
      phase: "searching" | "extracting" | "synthesizing";
    })
  | (StreamEventBase & {
      type: "answer.delta";
      turnId: TurnId;
      part: AssistantContentPart;
    })
  | (StreamEventBase & {
      type: "turn.completed";
      turnId: TurnId;
      assistantMessage: AssistantMessage;
      researchRun?: ResearchRun;
    })
  | (StreamEventBase & {
      type: "turn.failed";
      turnId: TurnId;
      stage: TurnStage;
      code: TurnErrorCode;
      retryable: boolean;
      message: string;
      researchRun?: ResearchRun;
    });

type TurnStage = "search" | "extraction" | "synthesis" | "transport";
```

Wire format uses the `type` as the SSE `event` field and serialized event as `data`; `id` is `<requestId>:<sequence>`. Comment heartbeats may be sent while providers are quiet and are not domain events. Exactly one `turn.completed` or `turn.failed` terminates a normally connected stream. EOF without either marks the turn interrupted.

The client ignores duplicate/out-of-order sequence numbers and events whose `requestId`, `turnId`, or `runId` do not match the active operation. It persists source/extraction events as stages complete, but keeps `answer.delta` transient until `turn.completed`. An `AbortController` implements Stop; no cancellation endpoint is required in the MVP.

The stateless backend cannot promise provider exactly-once execution after a connection loss. Stable request/turn/run IDs prevent duplicate local records, not duplicate external spend. Therefore the client never automatically retries after a stream opened; it shows the stage-aware retry action and waits for user intent.

#### Topic Report Stream

Answer reports and transcripts render entirely in the browser. Only topic-scoped Dorothy Ann report condensation calls the backend:

```text
POST /api/reports/stream
Accept: text/event-stream
Content-Type: application/json
```

```ts
interface TopicReportStreamRequest {
  apiVersion: 1;
  requestId: string;
  draftId: ArtifactDraftId;
  thread: ReportThreadInput;
}

type ReportEvent =
  | (StreamEventBase & { type: "report.started"; draftId: ArtifactDraftId })
  | (StreamEventBase & { type: "report.delta"; draftId: ArtifactDraftId; markdown: string })
  | (StreamEventBase & {
      type: "report.completed";
      draftId: ArtifactDraftId;
      artifact: ExportArtifact;
    })
  | (StreamEventBase & {
      type: "report.failed";
      draftId: ArtifactDraftId;
      code: ReportErrorCode;
      retryable: boolean;
      message: string;
    });
```

`ReportThreadInput` contains completed turns and their normalized sources only, bounded by the same deployment context policy. The client keeps deltas transient, saves `ArtifactDraft` only on `report.completed`, and requires user intent before retrying an opened stream.

#### Retry and Authentication Rules

- Before-stream `401`: open `/unlock`, then replay once only if no provider work began.
- Midstream EOF/terminal auth failure: preserve completed stages and require the user to choose the stage-specific retry.
- Search retry reruns search and replaces that run's prior failed search state.
- Extraction retry sends the preserved `ResearchRun`; the backend retries failed/eligible candidates and never treats browser-provided extracted text as trusted instructions.
- Synthesis retry reuses the frozen viable evidence set and performs no search/extraction.
- Chat retry reuses the user turn ID; replacement of an existing assistant answer occurs only after a new `turn.completed`.
- Report retry reuses the draft ID/source target and replaces no saved draft until `report.completed`.

#### Transport Security and Limits

- Validate every discriminated union and reject unknown fields at the HTTP boundary.
- Bound query length, turn count, message characters, result count, URL count, extracted characters, and output tokens server-side.
- Revalidate every promoted URL; block private/link-local/loopback addresses and unsafe redirects before extraction.
- Delimit all browser-provided conversation/source content from system instructions.
- Apply auth, origin/CSRF, request-rate, and provider-spend limits before starting work.
- Do not log request bodies, SSE data, passphrases, extracted content, or generated prose by default.

Extraction count is explicit application configuration rather than a provider-specific constant:

```ts
interface ResearchPolicy {
  /** Target count of successfully extracted, viable pages. Default: 3. */
  targetViablePages: number;
  maxCharactersPerPage: number;
  maxTotalExtractedCharacters: number;
}
```

Alpha defaults are explicit and server-enforced: query 2,000 characters; 10 search results; at most 200 known topic sources; at most 8 extraction candidates; 3 concurrent fetches; 8 seconds and 2 MB decoded response body per fetch; 5 redirects; 20,000 extracted characters per viable page; 50,000 extracted characters total; 120,000 input-context characters; and 4,096 output tokens. Extraction schedules candidates in rank order, stops scheduling once three viable pages exist, and ignores safe late in-flight results beyond the target.

The runtime adapter loads and validates this server-side deployment configuration. Research requests do not carry an extraction-count override, and the MVP UI exposes no corresponding control. A later user setting may be added if repeated requests for broader research show that it is useful.

## System Abstractions

The domain should depend on small internal interfaces rather than provider-specific payloads.

```ts
interface ChatProvider {
  stream(input: NormalizedChatInput): AsyncIterable<ChatProviderEvent>;
}

interface NormalizedChatInput {
  purpose: "chat" | "research_synthesis" | "topic_report";
  systemInstruction: string;
  turns: CompletedContextTurn[];
  currentUserContent: string;
  evidence?: EvidencePack;
  maxOutputTokens: number;
}

type ChatProviderEvent =
  | { type: "content"; part: AssistantContentPart }
  | { type: "completed"; usage?: UsageMetadata };

interface SearchProvider {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}

interface SearchOptions {
  maxResults: number;
  locale?: string;
  safeSearch?: "off" | "moderate" | "strict";
}

interface ContentExtractor {
  extract(source: SearchResult, limits: ExtractionLimits): Promise<ExtractionOutcome>;
}

/**
 * The exact bounded evidence supplied to a synthesis request. This is an
 * application-owned replay/evaluation boundary, not a provider payload.
 */
interface EvidencePack {
  query: string;
  sources: ContextEvidence[];
  createdAt: IsoTimestamp;
}

interface ExtractionLimits {
  maxCharacters: number;
  timeoutMs: number;
}

interface ThreadStore {
  list(): Promise<ThreadSummary[]>;
  load(threadId: ThreadId): Promise<Thread | null>;
  save(thread: Thread): Promise<void>;
  remove(threadId: ThreadId): Promise<void>;
  exportData(threadIds?: ThreadId[]): Promise<ThreadBackup>;
  inspectImport(backup: ThreadBackup): Promise<ImportPreview>;
  importData(
    backup: ThreadBackup,
    options: { onConflict: "skip" | "replace" },
  ): Promise<ImportReport>;
}

interface Exporter {
  export(request: ExportRequest, thread: Thread): Promise<ExportArtifact>;
}

interface ArtifactDraftStore {
  loadBySourceKey(sourceKey: string): Promise<ArtifactDraft | null>;
  save(draft: ArtifactDraft): Promise<void>;
  remove(draftId: ArtifactDraftId): Promise<void>;
}
```

Provider responses should be normalized at the boundary. Stored threads should not require a particular provider SDK to be read or exported.

### EvidencePack and provider-neutral synthesis

`EvidencePack` is the seam between Dorothy Ann's research pipeline and any chat model. It contains only the bounded, selected evidence that the application is willing to send to a model. It must preserve source boundaries rather than concatenate pages into an undifferentiated prompt:

```text
SOURCE source_1
  rank: 1
  title: …
  url: …
  search snippet: …
  extracted passage: …

SOURCE source_2
  …
```

The application creates an `EvidencePack` only after search results have been normalized, URLs have passed safety checks, canonical URLs have been deduplicated, and extraction outcomes have established viable pages. Search snippets and extracted passages remain visibly distinct in the UI and in the model envelope. A source can remain visible as discovered evidence without becoming eligible for synthesis if extraction failed.

Anthropic receives the `EvidencePack` for `research_synthesis` and topic-report requests; it does not perform search in the initial implementation. The system instruction must say that all evidence is untrusted reference material, that instructions inside retrieved pages have no authority, and that claims may cite only supplied `SourceId` values. The prompt requires citation sentinels in the exact form `[[cite:<SourceId>]]`. The Anthropic adapter incrementally parses these sentinels across arbitrary stream chunk boundaries into `AssistantContentPart[]`; it emits ordinary text unchanged and emits a citation part only when the ID belongs to the request's allowed evidence set. Unknown or malformed sentinels render as non-linked text and produce a validation warning, never a fabricated citation. The parser is provider-adapter code behind `ChatProvider`, and visible citation numbers are still assigned by the application.

Because the pack is deterministic and serializable, completed packs should be usable as replay fixtures for prompt/model evaluation without repeating Brave searches or page extraction. Initial tuning should focus on system instructions, evidence-envelope shape, citation validation, output limits, and model choice—not fine-tuning. Store enough provenance to explain which search results and extracted pages produced each completed answer, while keeping raw provider payloads outside the domain model.

### Core Domain Objects

IDs are opaque strings generated by the application/runtime boundary and preserved through retries and export/import:

```ts
type Brand<T, Name extends string> = T & { readonly __brand: Name };
type ThreadId = Brand<string, "ThreadId">;
type TurnId = Brand<string, "TurnId">;
type MessageId = Brand<string, "MessageId">;
type ResearchRunId = Brand<string, "ResearchRunId">;
type SourceId = Brand<string, "SourceId">;
type ArtifactDraftId = Brand<string, "ArtifactDraftId">;
type IsoTimestamp = Brand<string, "IsoTimestamp">;
```

A turn is an explicit aggregate because a user message, research evidence, failure state, and optional assistant answer must survive independently:

```ts
interface Thread {
  schemaVersion: 1;
  id: ThreadId;
  title: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  modelRef: string;
  searchRef: string;
  turns: Turn[];
}

interface ThreadSummary {
  id: ThreadId;
  title: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  lastTurnPreview?: string;
}

type TurnStatus = "pending" | "running" | "completed" | "failed" | "interrupted";
type TurnMode = "chat" | "research";

interface Turn {
  id: TurnId;
  mode: TurnMode;
  status: TurnStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  userMessage: UserMessage;
  assistantMessage?: AssistantMessage;
  researchRun?: ResearchRun;
  failure?: TurnFailure;
}

interface UserMessage {
  id: MessageId;
  role: "user";
  content: string;
  createdAt: IsoTimestamp;
}

interface AssistantMessage {
  id: MessageId;
  role: "assistant";
  content: AssistantContent;
  createdAt: IsoTimestamp;
  usage?: UsageMetadata;
}

interface UsageMetadata {
  inputTokens?: number;
  outputTokens?: number;
  searches?: number;
  extractedPages?: number;
  estimatedCostUsd?: number;
}
```

Research data remains normalized and separate from generated prose:

```ts
type ResearchRunStatus =
  | "searching"
  | "extracting"
  | "ready"
  | "partial"
  | "insufficient_evidence"
  | "synthesizing"
  | "completed"
  | "failed"
  | "interrupted";

interface ResearchRun {
  id: ResearchRunId;
  origin: "search" | "promoted_lookup";
  status: ResearchRunStatus;
  queries: string[]; // exactly one in MVP; array preserves future compatibility
  lookupId?: string;
  targetViablePages: number;
  sources: SearchResult[];
  extractions: ExtractionOutcome[];
  evidenceSourceIds: SourceId[]; // frozen ordered set used for synthesis
  startedAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  completedAt?: IsoTimestamp;
  failure?: TurnFailure;
}

interface SearchResult {
  sourceId: SourceId;
  rank: number; // one-based within the originating result set
  title: string;
  url: string;
  canonicalUrl: string;
  displayUrl: string;
  snippet?: string;
  publishedAt?: IsoTimestamp;
}

interface ExtractedPage {
  sourceId: SourceId;
  canonicalUrl: string;
  title?: string;
  text: string; // bounded readable text, never raw executable markup
  extractedAt: IsoTimestamp;
  characterCount: number;
}

type ExtractionSkipReason =
  | "duplicate"
  | "unsafe_url"
  | "blocked"
  | "unsupported_content"
  | "empty_content"
  | "limit_reached";

type ExtractionOutcome =
  | { sourceId: SourceId; status: "viable"; page: ExtractedPage }
  | { sourceId: SourceId; status: "skipped"; reason: ExtractionSkipReason }
  | {
      sourceId: SourceId;
      status: "failed";
      code: "fetch_failed" | "timeout" | "extract_failed";
      retryable: boolean;
    };
```

`SourceId` is stable within a topic and its exports. For a turn request, the browser projects every existing topic source into `knownSources`; the server validates that bounded map and reuses its ID when a normalized canonical URL matches, otherwise issuing a new opaque ID before emitting `research.sources`. This keeps later citation events and persisted sources on one ID without client-side stream rewriting. Duplicate canonical URLs in one result set collapse to the highest-ranked result while retaining provenance in extraction metadata.

Failure and transport types are explicit:

```ts
interface TurnFailure {
  stage: TurnStage;
  code: TurnErrorCode;
  message: string;
  retryable: boolean;
  occurredAt: IsoTimestamp;
}

type TurnErrorCode =
  | "search_failed"
  | "no_search_results"
  | "extraction_failed"
  | "insufficient_evidence"
  | "synthesis_failed"
  | "chat_failed"
  | "context_too_large"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "interrupted";

type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden_origin"
  | "payload_too_large"
  | "context_too_large"
  | "rate_limited"
  | "service_unavailable";

type ReportErrorCode =
  | "invalid_report_input"
  | "context_too_large"
  | "generation_failed"
  | "provider_rate_limited"
  | "interrupted";
```

Context and report inputs are projections of the stored domain, not alternate persistence models:

```ts
interface ContextEvidence {
  source: SearchResult;
  page: ExtractedPage;
}

interface CompletedContextTurn {
  userMessage: UserMessage;
  assistantMessage: AssistantMessage;
  evidence?: EvidencePack;
}

interface ReportThreadInput {
  threadId: ThreadId;
  title: string;
  objective?: string;
  turns: CompletedContextTurn[];
  updatedAt: IsoTimestamp;
}

interface ExportArtifact {
  format: "dorothy_ann_report" | "transcript";
  scope: "answer" | "topic";
  filename: string;
  mimeType: "text/markdown";
  markdown: string;
  generatedAt: IsoTimestamp;
  sourceUpdatedAt: IsoTimestamp;
}

interface ThreadBackup {
  backupVersion: 1;
  exportedAt: IsoTimestamp;
  threads: Array<{ schemaVersion: 1; thread: Thread }>;
}

interface ImportIssue {
  threadId?: ThreadId;
  code: "invalid_backup" | "unsupported_version" | "invalid_thread";
  message: string;
}

interface ImportPreview {
  add: number;
  conflicts: number;
  skippedInvalid: number;
  issues: ImportIssue[];
}

interface ImportReport extends ImportPreview {
  added: ThreadId[];
  replaced: ThreadId[];
  skipped: ThreadId[];
}
```

A failed turn remains valid even when it has no assistant message. Flattening completed turns yields the ordered message sequence sent to a chat provider; failed/interrupted assistant buffers are excluded. Sources and extraction outcomes are stored separately from generated prose rather than embedded only inside provider response JSON. This keeps citation rendering, retries, exports, and provider changes tractable.

### Citation Contract

Visible citation numbers are presentation, not identity. Each normalized source receives an opaque stable `SourceId`; canonical-URL deduplication reuses that ID within a topic, and export/import preserves it. Assistant content references those IDs structurally:

```ts
type AssistantContentPart =
  | { type: "text"; markdown: string }
  | { type: "citation"; sourceId: SourceId };

interface AssistantContent {
  parts: AssistantContentPart[];
}
```

The renderer assigns `[1]`, `[2]`, and so on by first citation appearance within each assistant message. Repeated references to the same `SourceId` in one answer reuse the same number. The next assistant answer starts again at `[1]`, even if it cites a source already used elsewhere in the topic.

Citation rules:

- a citation may reference only a source attached to the message's `ResearchRun` or preserved research context;
- provider annotations or textual markers must be normalized to `AssistantContentPart[]` at the adapter/application boundary;
- unknown, malformed, or dangling source references are not rendered as valid citations;
- uncited search results remain visible as discovered evidence but receive no answer citation number;
- activating `[n]` resolves through the message-local number map to the stable source and focuses it in the evidence drawer/sheet;
- answer-level and transcript exports derive the same message-local numbering deterministically and place that answer's numbered source list immediately after its prose, so numbering scope remains unambiguous.

Stored content must not use visible citation numbers as foreign keys. This permits source deduplication, retries, provider changes, and deterministic re-rendering without rewriting generated prose.

### Failure and Retry Contract

Failures preserve successful earlier stages and expose stage-specific recovery:

| Failure | Persisted state | UI behavior | Retry scope |
|---|---|---|---|
| Search fails | user message, failed turn, query | show error and `Retry search`; no Dorothy Ann answer | search onward |
| Some extraction fails, at least one page viable | all results and per-page outcomes | continue synthesis; visibly state that fewer than the configured target were usable | no automatic retry |
| No pages are viable | results and extraction outcomes; `insufficient_evidence` run | show results and explain that research could not be supported; do not say “According to my research…” | extraction or edited/new query |
| Synthesis fails before completion | complete research run; no completed assistant message | keep evidence visible and show `Retry answer` | synthesis only, using preserved evidence |
| Stream/connection is interrupted | last fully persisted stage; interrupted turn | show the transient partial buffer as interrupted, but do not export or treat it as a completed answer | resume if transport supports it; otherwise retry the active stage with the same stable IDs |

Streamed prose is a transient UI buffer until `turn.completed` supplies the normalized assistant message. If synthesis or transport fails, that buffer may remain dimmed for inspection until retry or dismissal, but it is not included in future model context, persistence as a completed message, or export. A retry updates the existing `Turn` and `ResearchRun`; it does not append duplicate user messages or evidence.

If one or two viable pages support synthesis, Dorothy Ann may still answer, but the response must disclose that fewer than the configured three pages were usable. Extraction failures remain inspectable metadata and are never passed to the model as evidence.

## End-to-End Orchestration

```text
lookup:   query → Brave SearchProvider → normalized results → browser
research: query/results → safe extraction until 3 viable pages
          → frozen EvidencePack → Anthropic stream → cited turn
chat:     bounded completed context → Anthropic stream → completed turn
export:   answer report/transcript → deterministic local Markdown
          topic report → one Anthropic condensation → editable local draft
```

Lookup promotion reuses normalized results and does not search again. Research performs one bounded search, one extraction pass, and one synthesis—no autonomous loop. Retries resume only the failed stage from persisted browser state. Partial prose remains transient until a terminal completion event.

## Storage Strategy

The initial storage decision is local-browser-only, not storage-hardcoded. `LocalThreadStore` is the MVP implementation; `ThreadStore` remains the application boundary. There is no synchronization or cross-device continuity in the first deployment. Deterministic backup export/import is required so browser-local data can be backed up, moved manually, and migrated into a future remote store.

The canonical `ThreadStore` contract is defined in `System Abstractions`. It covers list/load/save/remove plus deterministic backup inspection, import, and export while leaving IndexedDB mechanics out of the domain.

Storage requirements:

- persist versioned, provider-neutral domain objects;
- use stable thread, message, research-run, and source IDs;
- keep serialization/migrations inside the storage adapter;
- make writes atomic enough that a refresh cannot leave a half-written thread;
- handle unavailable, full, or corrupted browser storage without losing the current exportable artifact;
- make deletion explicit and transactional;
- avoid assuming all devices share a clock, browser, or storage quota.

`LocalThreadStore` uses IndexedDB through `idb` from the first proof. `idb` is an implementation detail of this adapter and must not appear in application-core interfaces. Thread summary indexes and full normalized thread records are stored separately so listing topics does not deserialize extracted page content. Saving a turn and its updated thread summary occurs in one transaction. IndexedDB schema upgrades own persisted-data migration and must preserve exportability if an individual record cannot be migrated.

Initial database shape:

```ts
interface DorothyAnnDb extends DBSchema {
  threads: {
    key: ThreadId;
    value: StoredThreadEnvelope;
  };
  threadSummaries: {
    key: ThreadId;
    value: ThreadSummary;
    indexes: {
      "by-updated-at": IsoTimestamp;
    };
  };
  artifactDrafts: {
    key: ArtifactDraftId;
    value: ArtifactDraft;
    indexes: {
      "by-source-key": string;
      "by-thread-id": ThreadId;
      "by-updated-at": IsoTimestamp;
    };
  };
}

interface StoredThreadEnvelope {
  schemaVersion: 1;
  thread: Thread;
}

interface ArtifactDraft {
  schemaVersion: 1;
  id: ArtifactDraftId;
  threadId: ThreadId;
  sourceKey: string; // <ThreadId>:answer:<TurnId> | <ThreadId>:topic:<format>
  format: "dorothy_ann_report" | "transcript";
  scope: "answer" | "topic";
  turnId?: TurnId; // required for answer scope
  markdown: string;
  sourceUpdatedAt: IsoTimestamp;
  dirty: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
```

`LocalThreadStore.save` opens a read-write transaction across `threads` and `threadSummaries` and commits both records together. Deletion removes the full record, summary, and associated artifact drafts in one transaction. Database-version upgrades run through `idb`'s `upgrade` callback; domain schema migration remains a separately testable pure function over `StoredThreadEnvelope`.

An `ArtifactDraftStore` backed by the same database owns workbench drafts. The `by-source-key` index is unique, permitting at most one active draft per `sourceKey`; reopening that export offers Resume or Start over. Deterministic and generated artifacts are saved once complete, edits autosave with a short debounce, and Back offers Keep draft, Discard, or Stay when dirty. Copy/download/share does not silently delete a draft. Drafts are excluded from thread backups and topic history, are not listed as durable artifacts, survive refresh/browser restart, and are deleted with their source topic or by explicit discard.

Remote storage and sync are not alpha work. `ThreadStore` intentionally leaves room for a future authenticated `RemoteThreadStore`, but no remote implementation, composition layer, ownership field, or sync status belongs in this plan. Upstash stores limiter counters only and is not the thread database.

## Context Budget

The alpha sends completed turns in order up to a server-enforced request budget. It never silently summarizes or drops turns. If the bounded request is too large, return `413 context_too_large` and offer two explicit exits: export a Dorothy Ann report/transcript, or begin a new topic. Context compaction and hidden memory are deferred.

## Deployment and Portability

Vercel is the committed alpha deployment target. The frontend is a Vite SPA; `/api/*` is handled by a Vercel Node Function that mounts the same Hono app used by the local Node runtime. IndexedDB remains the only thread/artifact store.

```text
browser
  ├── Vite/React SPA
  ├── IndexedDB LocalThreadStore + ArtifactDraftStore
  └── same-origin /api requests
             ↓
      thin Vercel adapter
             ↓
      portable Hono app
        ├── auth + limiter ports
        ├── Brave SearchProvider
        ├── safe ContentExtractor
        └── Anthropic ChatProvider
```

Use one package/repository rather than a monorepo. Directory boundaries provide enough separation for the alpha:

```text
src/
  domain/                 normalized types, schemas, migrations
  application/            orchestration, exports, citation/context policy
  ports/                  provider, auth, limiter, storage interfaces
  adapters/browser/       idb stores, clipboard/download/share
  ui/                     React routes, machines, components, CSS
server/
  app.ts                  provider-neutral Hono routes/middleware
  adapters/               Brave, Anthropic, extraction, auth, Upstash
  runtime/node.ts         local Node entrypoint
api/
  index.ts                thin Vercel entrypoint
```

Portability invariants:

- `src/domain`, `src/application`, and `src/ports` import no React, Hono, Vercel, provider SDK, `idb`, or Node-only package.
- `server/app.ts` depends on injected ports/config and standard Web `Request`/`Response`; it imports no Vercel API.
- only `api/index.ts` translates Vercel runtime/environment details into the Hono app.
- only `server/runtime/node.ts` owns local-server setup.
- only the extraction adapter may use Node DNS/`undici`; replacing it does not alter orchestration or domain values.
- provider payloads are normalized before leaving their adapter and are never persisted.
- browser code receives no provider, session-signing, limiter, or passphrase secret. No secret may use a `VITE_` prefix.
- deterministic exports and domain migrations run without network or Vercel.
- contract tests run the same Hono app through in-memory fake ports; one local smoke test and one deployed smoke test must produce the same API/event shapes.

`vercel.json` selects the Node runtime/API entrypoint and rewrites non-API deep links to the SPA. It may configure duration/region/headers, but may not change domain behavior. A future Cloudflare or other runtime is a new adapter, not alpha work.

Required deployment configuration:

```text
DOROTHY_FIXTURE_MODE           true for local/preview fixtures; false in production
ANTHROPIC_API_KEY               required when fixture mode is false
ANTHROPIC_MODEL                 required when fixture mode is false; deployment-selected
ANTHROPIC_WORKSPACE_ID          optional; only for keys requiring workspace selection
BRAVE_SEARCH_API_KEY            required when fixture mode is false
APP_PASSPHRASE_SCRYPT_HASH     versioned salt/parameters/hash string
SESSION_SIGNING_KEYS           active + optional previous HMAC keys for rotation
LIMITER_KEY_SECRET             HMAC secret for client-IP limiter keys
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
RESEARCH_TARGET_VIABLE_PAGES   default 3
MAX_SEARCH_RESULTS              default 10
MAX_KNOWN_SOURCES               default 200
MAX_EXTRACTION_CANDIDATES       default 8
EXTRACTION_CONCURRENCY          default 3
EXTRACTION_TIMEOUT_MS           default 8000
MAX_FETCH_BYTES                 default 2000000
MAX_REDIRECTS                   default 5
MAX_EXTRACTED_CHARS_PER_PAGE    default 20000
MAX_EXTRACTED_CHARS_TOTAL       default 50000
MAX_CONTEXT_CHARS               default 120000
MAX_OUTPUT_TOKENS               default 4096
LOGIN_ATTEMPTS_PER_15_MIN       default 5
GLOBAL_LOGIN_ATTEMPTS_PER_HOUR  default 100
```

Startup validates server configuration and fails closed with names—not values—of missing/invalid variables. Local fixture mode uses fake providers and the in-memory limiter; live local mode reads the same variable names as Vercel. Provider credentials and prompts are never logged.

## Authentication and Access Boundary

The first deployment is personal and single-owner, but passphrase handling must remain an adapter rather than an application-core dependency:

```ts
interface AuthSession {
  subject: "owner";
  method: "passphrase";
  expiresAt: IsoTimestamp;
  absoluteExpiresAt: IsoTimestamp;
}

interface AuthClient {
  getSession(): Promise<AuthSession | null>;
  login(input: { passphrase: string }): Promise<AuthSession>;
  logout(): Promise<void>;
}

interface RequestAuthenticator {
  authenticate(request: Request): Promise<AuthContext | null>;
}

interface AuthContext {
  subject: string; // "owner" in the initial deployment
  method: string;  // "passphrase" initially
}
```

Protected lookup, research, extraction, model, and configuration handlers receive `AuthContext`; they do not parse cookies, verify passphrases, or import a concrete auth implementation. The runtime adapter mounts the concrete login/session routes. A future OAuth session, passkey flow, or trusted identity header can replace both auth adapters without changing research orchestration.

### Unlock Interaction

An unauthenticated visit shows a dedicated `/unlock` page before loading topic content:

```text
open app or deep link
        ↓
GET /api/auth/session
        ├── authenticated → render requested route
        └── unauthenticated → /unlock?returnTo=<local path>
                                  ↓
                           enter passphrase
                                  ↓
                    POST /api/auth/passphrase
                                  ↓
                  secure session cookie + return
```

The unlock form uses a password input compatible with password managers. The passphrase exists only long enough to submit over HTTPS; it is never written to localStorage, IndexedDB, frontend configuration, logs, analytics, URLs, or exported artifacts. `returnTo` accepts only validated same-origin paths. The profile menu exposes `Lock / sign out`.

If authentication expires during a turn, the client preserves the local user turn and last completed research stage, opens the unlock flow, and retries only the interrupted stage after authentication succeeds.

### Initial Auth HTTP Contract

```text
GET  /api/auth/session
  200 { authenticated: false }
  200 { authenticated: true, session: { subject, method, expiresAt, absoluteExpiresAt } }

POST /api/auth/passphrase
  body: { passphrase: string }
  200 { authenticated: true, session: { subject, method, expiresAt, absoluteExpiresAt } }
      + Set-Cookie: __Host-dorothy-ann-session=…;
        HttpOnly; Secure; SameSite=Lax; Path=/
  400 malformed request
  401 invalid passphrase
  429 rate limited

POST /api/auth/logout
  204 + expired __Host-dorothy-ann-session cookie
```

The initial Node auth adapter verifies `APP_PASSPHRASE_SCRYPT_HASH` with `node:crypto` `scrypt` and `timingSafeEqual`; the versioned secret string contains algorithm parameters, salt, and derived hash, never the passphrase. It issues an HMAC-SHA-256 signed cookie containing only key ID, subject `owner`, method, issued-at, idle-expiry, and absolute-expiry claims. The session has a rolling seven-day idle expiry and a non-extendable 30-day absolute expiry measured from initial authentication. The adapter may refresh the cookie after authenticated activity without moving the absolute deadline. `SESSION_SIGNING_KEYS` supports one active key and previous verification keys for rotation without changing the passphrase. Login attempts pass through a `LoginAttemptLimiter` adapter; process-local counters are not sufficient in serverless runtimes.

```ts
interface LoginAttemptLimiter {
  consume(key: string): Promise<{
    allowed: boolean;
    retryAfterSeconds?: number;
  }>;
  reset(key: string): Promise<void>;
}
```

The Vercel adapter uses Upstash Redis through `@upstash/ratelimit`; local development uses an in-memory implementation with the same behavior. The Vercel runtime derives limiter keys from trusted platform client-IP metadata and HMACs them with a dedicated limiter-key secret before Redis sees them. Store only expiring per-IP and small global login counters—never raw IPs, passphrases, session cookies, prompts, sources, or thread data. The alpha permits five failed attempts per HMAC-derived IP key per 15 minutes plus a 100-attempt global hourly safety bucket. Consume both before passphrase verification; reset only the per-IP bucket after a successful unlock. These values remain deployment configuration. Disable optional analytics for the MVP to minimize stored metadata and commands.

As of 2026-09-05, Upstash's published Redis free tier includes one database, 500,000 commands/month, 256 MB data, and 10 GB bandwidth. A personal unlock flow should remain far below those limits, so expected limiter cost is **$0/month**. If upgraded to pay-as-you-go, current command pricing is $0.20 per 100,000 commands, storage is $0.25/GB-month with the first 1 GB free, and bandwidth is free through 200 GB/month; configure a monthly budget cap before enabling paid usage. Pricing is external and must be rechecked at implementation/deployment time: <https://upstash.com/pricing/redis>.

`Lock / sign out` expires the cookie in the current browser only. Because the initial session is stateless, emergency all-session revocation is an operator action that rotates the deployment signing secret. Server-side per-session revocation and a “sign out everywhere” UI are deferred until there is a durable session store.

The browser app shell must not read or display IndexedDB topic content until authentication succeeds. This gate protects access through the app, not against someone who already controls the local browser profile or device; local thread encryption is outside MVP scope.

## Security Constraints

- Authenticate access to all conversation and configuration routes.
- Keep provider credentials out of browser JavaScript and application logs.
- Treat search results and extracted pages as untrusted input.
- Delimit retrieved content from system and user instructions.
- Sanitize rendered model output.
- Bound searches, fetched pages, extracted characters, context size, and output tokens.
- Prevent content extraction from reaching private or local network addresses.
- Restrict redirect behavior during extraction.
- Give retrieved content no executable tools or authority.
- Avoid prompt and conversation telemetry by default.

## Cost Controls

The alpha stores provider-reported token/search/extraction counts on each completed turn and enforces deployment-configured request limits. It does not build billing-period aggregation, estimated-cost dashboards, budgets, or user-facing tuning controls. Provider dashboards remain the billing source of truth.

## Explicit Non-Goals

- Coding-agent execution inside the web/mobile app (pi.dev remains the execution environment).
- Filesystem or shell access from the web/mobile app.
- General tool/plugin ecosystems.
- Vector databases or semantic memory.
- Automatic permanent memory.
- Document-library management.
- Native mobile applications.
- Collaboration or multi-user accounts.
- Remote thread storage, sync, or cross-device continuity.
- Topic archiving and edit-and-resend history branching.
- Autonomous open-ended research loops or context compaction.
- A second provider implementation in the alpha.
- Rich editors, syntax highlighting, rich weather/search widgets, or PDF/JavaScript rendering.
- Usage dashboards or user-facing model/provider/research-depth settings.
- Integration with every notes platform.

The application may later become installable as a PWA, but offline support should not block validation of the core chat-search-export loop.

## Implementation Plan

1. **Scaffold the portable single-package application.** Create the React/Vite SPA, strict TypeScript configuration, CSS foundations, provider-neutral Hono `createApp(dependencies)` factory, local Node entrypoint, thin Vercel entrypoint, SPA rewrites, validated configuration, and fixture mode. Keep the directory/import boundaries in `Deployment and Portability`. **Verify:** `npm ci`, lint, typecheck, unit test, production build, local auth-session request, and Vercel build all pass without live provider credentials in fixture mode.

2. **Implement normalized domain schemas and pure policies.** Add branded IDs, thread/turn/research/source/artifact types, Zod boundary schemas, deterministic query routing/title generation, canonical source reconciliation, evidence-pack construction, citation sentinel parsing/numbering, context projection, and deterministic answer-report/transcript rendering. **Verify:** table-driven tests cover valid/invalid transitions and schemas, chunk-split/malformed/unknown citations, duplicate canonical URLs, lookup-vs-research routing, stable export output, and no provider payload in serialized fixtures.

3. **Implement IndexedDB storage and backup recovery.** Build `LocalThreadStore` and `ArtifactDraftStore` with `idb`, atomic thread/summary updates, unique draft source keys, schema migration, deterministic backup inspect/import/export, conflict policy, quota/unavailable/corrupt-record recovery, and topic deletion cleanup. **Verify:** `fake-indexeddb` tests cover transactions, failed writes, migrations, round-trip backup, conflict skip/replace, draft resume/discard, and deletion of related drafts.

4. **Implement portable owner authentication.** Add `AuthClient`, `RequestAuthenticator`, scrypt hash-generation script, passphrase verification, HMAC session cookies, expiry/key rotation, origin checks, in-memory limiter, and Upstash limiter adapter. Mount only the three specified auth routes. **Verify:** Hono contract tests cover malformed/invalid/rate-limited login, seven-day idle/30-day absolute expiry, cookie flags, current-browser logout, previous signing-key verification, no secret values in errors/logs, and parity between limiter adapters.

5. **Implement Brave lookup behind `SearchProvider`.** Normalize Brave results, enforce deployment limits, assign opaque source IDs, and expose `POST /api/lookup`; retain raw payloads only inside the adapter call. **Verify:** fixture contract tests cover ranked results, empty results, provider errors/rate limits, malformed payloads, canonical URL handling, auth/origin/size rejection, and confirm lookup never invokes Anthropic or extraction.

6. **Implement the safe Node content extractor.** Build validated/pinned DNS connection handling, manual safe redirects, byte/time/content-type bounds, `linkedom` + Readability normalization, and typed outcomes. **Verify:** fixture/integration tests cover public HTML/plain text, malformed HTML, duplicate canonical URLs, timeout, oversized/decompression body, unsupported PDF, empty content, direct and redirected private IPv4/IPv6/link-local destinations, and DNS-rebinding simulation.

7. **Implement Anthropic chat/synthesis behind `ChatProvider`.** Construct delimited provider-neutral prompts for chat, research synthesis, and topic reports; stream normalized text/citation parts; validate citation IDs; and capture normalized usage. `ANTHROPIC_MODEL` is required deployment configuration. **Verify:** replay fixtures cover ordinary chat, three/partial-source research, prompt-injection text inside evidence, citations split across chunks, unknown citations, provider interruption/rate limiting, and absence of Anthropic payloads in persisted values.

8. **Implement research orchestration and streaming routes.** Compose search, ranked concurrent extraction, frozen evidence, synthesis, stage persistence events, retry semantics, report generation, SSE sequencing/heartbeats, and request bounds in the Hono application. **Verify:** contract tests cover new research, promoted lookup without a second Brave call, three-page stop, one/two-page caveat, zero-evidence refusal, each stage failure/retry, Stop/EOF behavior, transient prose, duplicate/out-of-order event rejection, and exactly one terminal event on normal completion.

9. **Build the responsive authenticated shell and lookup flow.** Implement React Router routes, `authMachine`, unlock/expiry flow, closed topic drawer, recent topics, deterministic query mode chip, lookup loading/results/empty/error states, keyboard-first result navigation, and lookup promotion. Use React Aria and CSS Modules only at the UI boundary. **Verify:** React Testing Library covers focus/live-region/keyboard behavior and MSW states; Playwright verifies desktop/mobile unlock → lookup → open/promote paths and deep-link restoration.

10. **Build research, chat, and evidence interactions.** Implement `turnMachine`, research progress, desktop auto-open evidence panel, mobile evidence sheet, citations, source excerpts/failures, follow-up chat/research switch, Stop, copy, and stage-specific recovery using the accepted state matrix. **Verify:** component tests exercise every machine state; Playwright covers full/partial/zero-evidence research, citation focus restoration, chat retry, stream interruption, reload from committed stages, and no export/context use of partial prose.

11. **Build Dorothy Ann reports, transcripts, and local recovery.** Implement deterministic answer reports/transcripts, `reportMachine`, one-call topic report generation, full-screen Edit/Preview workbench, autosaved drafts, resume/start-over, dirty Back confirmation, copy/download/share fallbacks, and data backup import/export UI. **Verify:** snapshot/property tests confirm deterministic Markdown and message-local citations; component/E2E tests cover generation retry, refresh/resume, dirty navigation, unsupported clipboard/share, `.md` download, and backup round trip.

12. **Harden and deploy the alpha.** Apply security headers, production request/body/output limits, redacted logging, secret validation, accessibility checks, responsive polish, and Vercel environment/function configuration. Run live Brave/Anthropic/Upstash smoke tests and verify local/Vercel contract parity. **Verify:** all quality commands pass; Playwright desktop Chromium/mobile WebKit happy and representative recovery paths pass; axe reports zero serious/critical violations; built frontend contains no server secret; deployed `weather` performs no model call; promoted research performs no duplicate search; and the Vercel function cannot fetch private-network targets.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` done and verified, `[!]` blocked.

- [x] 1. Portable scaffold — deliverable: single-package React/Vite/Hono app with Node and Vercel adapters plus fixture mode; verify: `npm ci`, lint, typecheck, test, build, and local health/session/lookup smoke checks passed.
- [x] 2. Domain and policies — deliverable: normalized schemas, routing, evidence, citations, context, deterministic exports; verify: table/replay tests, citation chunk-boundary tests, source dedupe tests, and lint/typecheck/build passed.
- [~] 3. IndexedDB storage — deliverable: thread/summary/draft stores, migrations, backup import/export; verify: `fake-indexeddb` transaction, failure, migration, conflict, and round-trip tests.
- [ ] 4. Owner auth — deliverable: scrypt passphrase, signed sessions, auth routes, in-memory/Upstash limiters; verify: auth/expiry/cookie/rotation/limiter contract tests.
- [ ] 5. Brave lookup — deliverable: normalized `SearchProvider` and `/api/lookup`; verify: fixture/error/bounds tests and zero Anthropic/extraction calls.
- [ ] 6. Safe extraction — deliverable: SSRF-safe bounded Node extractor with Readability; verify: content, redirect, IP, rebinding, timeout, oversized, and unsupported-type tests.
- [ ] 7. Anthropic adapter — deliverable: chat/research/report streaming with validated citation sentinels; verify: replay, injection, chunk boundary, unknown citation, interruption, and persistence-boundary tests.
- [ ] 8. Orchestration/SSE — deliverable: turn/report streams, bounded extraction, stage-aware retry; verify: Hono end-to-end contract matrix and terminal-event assertions.
- [ ] 9. Shell and lookup UI — deliverable: auth shell, drawer, mode routing, lookup/promotion states; verify: RTL/MSW plus desktop/mobile Playwright paths.
- [ ] 10. Research/chat/evidence UI — deliverable: accepted turn/evidence states and recovery interactions; verify: machine-state components plus full/partial/failure/reload E2E paths.
- [ ] 11. Reports and recovery UI — deliverable: Markdown workbench, drafts, export/share, data backup; verify: deterministic export tests and workbench/backup E2E paths.
- [ ] 12. Hardened Vercel alpha — deliverable: configured secure deployment; verify: full CI commands, axe, secret scan, live provider smoke, portability parity, and SSRF probes.

## Verification

Required local commands (scripts created in step 1):

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Alpha acceptance assertions:

- `weather` and `life alive` call Brave only and render keyboard-navigable ranked links.
- A terminal-`?` query performs at most one Brave search, bounded extraction to three viable pages, and one Anthropic synthesis.
- Promoting lookup results performs no second search.
- Retrieved instructions cannot gain authority; only viable bounded pages enter `EvidencePack`.
- Every rendered citation resolves to an allowed stable source ID; visible numbering restarts per answer and exports identically.
- One/two viable pages produce a visible caveat; zero viable pages never produce “According to my research…”.
- Interrupted prose is absent from persistence, future context, and exports; retry resumes the failed stage without duplicate local turns.
- Threads and report drafts survive reload in the same browser; another browser/device has no data.
- Answer reports and transcripts are deterministic/local; topic report generation is one bounded Anthropic call and remains editable.
- All drawers, sheets, dialogs, progress, failures, and workbench actions are keyboard/screen-reader usable on desktop and mobile layouts.
- Provider adapters can be replaced by test doubles without changing domain, orchestration, UI, storage, or artifact formats.
- The local Node and Vercel adapters expose identical versioned API/event contracts.

## Operator Setup and Secret Handoff

Implementation works in fixture mode without accounts or secrets. The operator supplies live services incrementally; secrets never go in chat, git, issue text, screenshots, browser configuration, or a `VITE_*` variable. The repository will provide a committed `.env.example` containing names/defaults only and a gitignored `.env.local` for live local development.

### What Jonny needs to obtain

| Item | When needed | Operator action | Dorothy Ann receives it as |
|---|---|---|---|
| Brave Search API key | Ledger step 5/live lookup | Create a Brave Search API account, activate an API plan, create a descriptively named key in the API dashboard, and keep it server-side. Official setup: <https://api-dashboard.search.brave.com/documentation/quickstart>. | `BRAVE_SEARCH_API_KEY` secret |
| Anthropic API key | Ledger step 7/live chat/research | In Claude Console, create a personal key for private development or service-account key for the deployed workload, choose an expiration, copy the one-time value, and fund API billing. Claude web/desktop paid plans do not include API usage. Official setup: <https://platform.claude.com/docs/en/get-api-key>; billing separation: <https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console>. | `ANTHROPIC_API_KEY` secret |
| Anthropic model ID | Ledger step 7/live chat/research | Choose a current model ID from Anthropic's model documentation/Models API. Start with the current Sonnet-class model for the speed/quality balance, but keep it configuration rather than code. | `ANTHROPIC_MODEL` config |
| Optional Anthropic workspace ID | Only if the key can address multiple workspaces | Copy the workspace ID required by the selected key; omit otherwise. | `ANTHROPIC_WORKSPACE_ID` secret/config |
| Vercel account and project | Ledger step 1 for build; step 12 for live deploy | Connect the git repository as a Vite project, retain the generated preview/production flow, and redeploy after adding environment variables. Official Vite guide: <https://vercel.com/docs/frameworks/frontend/vite>. | Project/deployment, not an application secret |
| Upstash Redis database | Ledger step 4/live rate limiting | Install the Upstash integration in Vercel, create/link one free Redis database, connect it to the Dorothy Ann project, and redeploy. Official integration: <https://upstash.com/docs/redis/howto/vercelintegration>. | `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` secrets |
| Personal unlock passphrase | Ledger step 4 or before first live deploy | Choose a unique high-entropy passphrase and run `npm run auth:hash`; enter it only at the no-echo prompt. Keep the passphrase in a password manager. | Only the generated `APP_PASSPHRASE_SCRYPT_HASH`; never the passphrase |
| Session signing keys | Ledger step 4 | Run `npm run secrets:generate`; retain the generated active key. Future rotations add a new active key while temporarily retaining the old verification key. | `SESSION_SIGNING_KEYS` secret |
| Limiter-key secret | Ledger step 4 | Generated by the same script; it must be independent from session signing. | `LIMITER_KEY_SECRET` secret |

The generated scripts must print shell-safe values but never write live secrets into tracked files. `auth:hash` reads from an interactive no-echo prompt, confirms the passphrase, generates a random salt, and prints the versioned scrypt hash. `secrets:generate` uses cryptographically secure random bytes and prints distinct session/limiter values.

### How to provide values locally

After Ledger step 1 creates `.env.example`, copy it without committing the result:

```bash
cp .env.example .env.local
```

Use fixture mode until a live adapter is being exercised:

```dotenv
DOROTHY_FIXTURE_MODE=true
```

For live local testing, set these in `.env.local`:

```dotenv
DOROTHY_FIXTURE_MODE=false
BRAVE_SEARCH_API_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
# ANTHROPIC_WORKSPACE_ID=  # only when required
APP_PASSPHRASE_SCRYPT_HASH=
SESSION_SIGNING_KEYS=
LIMITER_KEY_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Node 22 local scripts load `.env.local`; Vite receives no secret values. `.gitignore` must cover `.env`, `.env.*`, and permit only `.env.example`. Before every commit/deploy, `git status` and the built `dist/` secret scan must remain clean.

### How to provide values to Vercel

Use Vercel Project → Settings → Environment Variables or the interactive CLI. Mark API keys, hashes, signing keys, limiter secrets, and Upstash credentials as **Secret**. Add them to Production and Preview only when those environments should make live paid calls; Development is optional if `.env.local` is the local source of truth. Vercel applies environment changes only to new deployments, so redeploy afterward. Official environment guide: <https://vercel.com/docs/environment-variables>.

CLI shape (the command prompts for each value; do not put the value on the command line):

```bash
vercel link
vercel env add DOROTHY_FIXTURE_MODE production     # enter false
vercel env add BRAVE_SEARCH_API_KEY production
vercel env add ANTHROPIC_API_KEY production
vercel env add ANTHROPIC_MODEL production
vercel env add APP_PASSPHRASE_SCRYPT_HASH production
vercel env add SESSION_SIGNING_KEYS production
vercel env add LIMITER_KEY_SECRET production
# Upstash integration normally injects its two variables automatically.
vercel --prod
```

Preview deployments default to `DOROTHY_FIXTURE_MODE=true`: provide preview auth/session/Upstash secrets so the real unlock flow works, but omit Brave/Anthropic keys to prevent accidental provider spend. Production uses `DOROTHY_FIXTURE_MODE=false` with all live secrets. Switch previews to live providers only as an explicit later choice. `vercel env pull .env.local` is optional when Vercel should be the source of local development values; review the resulting file and keep it gitignored. Official CLI reference: <https://vercel.com/docs/cli/env>.

### Recommended ownership and rotation

- Use separate Brave and Anthropic keys named for Dorothy Ann; do not reuse keys from pi.dev or unrelated projects.
- Prefer an Anthropic service-account key for a long-lived deployment when available; a personal key is acceptable for private development.
- Set key expiration/usage alerts in provider consoles where supported.
- Rotate one provider at a time, add the replacement to Vercel, redeploy, smoke test, then revoke the old key.
- Rotate `SESSION_SIGNING_KEYS` by deploying a new active key plus the old verification key; after the 30-day absolute session window, remove the old key.
- Rotating `LIMITER_KEY_SECRET` abandons old limiter buckets, which is acceptable during an intentional rotation.
- Never place thread content in Upstash; it remains in browser IndexedDB.

### Operator readiness checklist

- [ ] Brave account, active API plan, and Dorothy Ann key created.
- [ ] Anthropic Console/API billing available and Dorothy Ann key created.
- [ ] Current Anthropic model ID selected.
- [ ] Vercel account/project linked to the repository.
- [ ] Upstash Redis created/linked to the Vercel project.
- [ ] Personal passphrase stored in a password manager; scrypt hash generated.
- [ ] Session and limiter secrets generated independently.
- [ ] Production secrets added to Vercel and deployment recreated.
- [ ] Preview configured with fixture providers; production configured with live providers.
- [ ] Local fixture flow passes before any live credentials are added.
- [ ] Live smoke passes: unlock, cheap lookup, research, follow-up chat, report export.
- [ ] Provider usage/billing dashboards checked after the first smoke test.

Missing live inputs block only the corresponding adapter smoke/deployment step, not fixture-mode implementation.

## Open Questions

None for alpha implementation. Revisit deferred scope only after the browser lookup → research → chat → report loop is deployed and used.
