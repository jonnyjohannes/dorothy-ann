# dorothy-ann: Search, Research Chat, and Pi Artifact Workbench

## Current State

- Status: planning
- Last updated: 2026-09-05
- Current focus: selecting test tools, extraction implementation, and a durable login limiter
- Handoff lives in: [`## Handoff`](#handoff)
- Next action: choose the verification stack, then finish extraction/limiter packages and the Implementation Plan/Plan Ledger

## Handoff

The product is now named **dorothy-ann**. It is a personal browser search surface whose defining agent flow is inspired by Dorothy Ann from *The Magic School Bus*: for substantive questions, Dorothy Ann researches the web and responds, “According to my research…” with inspectable evidence. Not every query deserves that flow. Navigational and utility lookups such as `weather` or `life alive` should return ordinary search results quickly and without model synthesis; full questions should enter a source-aware research thread with chat immediately available for follow-ups. Vercel is the committed deployment target, while application core, Hono routes, provider adapters, and persisted formats remain portable. New-query routing is settled: keyword-like and unpunctuated input takes the cheap lookup path; a terminal `?` chooses research; question-shaped lookup results may suggest `Research this with Dorothy Ann` without automatically incurring model cost; and a visible route chip can always override the route. The MVP adds no slash commands or bang aliases. Inside an existing thread, punctuation does not trigger fresh research: follow-ups default to chat and the user explicitly selects research when new evidence is needed. Lookup promotion is also settled: reuse the existing ranked result set without another search, walk it in rank order until the configured number of viable pages has been extracted, and synthesize from those pages. The initial extraction target is three viable pages. It is deployment configuration only—there is no user-facing or per-request control in the MVP. The user can ask Dorothy Ann to research further or more broadly in a later turn. Citation identity is settled: source identity is stable internally across the topic and exports, while visible citation numbers restart for each assistant answer in first-citation order. Failure handling is stage-aware: preserve every completed stage, synthesize with a caveat when at least one viable page exists, never produce the Dorothy Ann research claim with zero viable pages, and retry only the failed stage where possible. Partial streamed prose is not persisted as a completed answer. The MVP persistence milestone is settled: threads live only in the current browser profile, with deterministic export/import as the continuity and migration escape hatch; cross-device remote storage is deferred. `LocalThreadStore` uses IndexedDB through the small `idb` promise/schema wrapper from the start so extracted source content, transactional writes, and schema migration do not depend on localStorage's synchronous size-constrained model. `idb` remains private to the infrastructure adapter. The hosted app is personal/single-owner and uses a portable passphrase auth adapter: a dedicated `/unlock` screen exchanges the entered passphrase for a signed secure session cookie with a seven-day idle and 30-day absolute expiry, while protected application routes depend only on normalized `AuthContext`. MVP export scope is also settled: export one researched answer or a whole topic as an editable **Dorothy Ann report**, and export a whole topic as a deterministic transcript; arbitrary message/source selection and direct pi integration are deferred. Before transport work continues, complete and agree on the browser state matrix and paired desktop/mobile layouts described in `Browser Interaction Design`. A happy-path matrix and wireframe set are now drafted. Topic navigation is settled as a closed-by-default drawer on desktop and mobile, leaving only main content plus optional evidence visible. On desktop, the evidence panel opens automatically when research sources arrive, remains user-collapsible, and reopens/focuses when a citation is activated; mobile evidence remains an on-demand bottom sheet. Export uses a compact format-choice modal followed by a dedicated full-screen artifact workbench route on desktop and mobile. The happy-path shell is now agreed and the exhaustive MVP transition matrix is drafted. The exhaustive loading, empty, partial, error, and recovery variants are now drafted. Export-draft recovery is settled through an IndexedDB `artifactDrafts` store: generated and edited workbench content autosaves independently from topics, can be resumed or explicitly discarded, and does not become a general artifact library. The browser interaction baseline is accepted. Exact lookup, turn, retry, and topic-report HTTP/SSE contracts are drafted around a stateless authenticated backend and browser-owned threads. Every referenced ID, thread, turn, message, source, extraction, context, error, archive, report, and provider-boundary type is now defined in the normalized domain model. The concrete shell is now Vite + TypeScript for the frontend, Hono over standard Web APIs for the backend, a thin Vercel deployment adapter as the committed target, and a thin Node adapter for local execution. React is selected as the Vite UI framework. React Router owns browser routes. XState models only the interruption-heavy auth, lookup/research turn, and topic-report workflows; ordinary disclosure, focus, and form state remains local React state, with no global client store. React Aria Components supplies accessible dialogs, modals, menus, buttons, fields, and focus behavior; topic drawers and mobile evidence sheets are styled `Dialog`/`Modal` variants rather than custom focus traps. Markdown rendering uses `react-markdown` + `remark-gfm` + `rehype-sanitize`; the artifact workbench uses a plain autosaving textarea with an Edit/Preview toggle and no rich-editor dependency. Styling uses CSS Modules plus global CSS custom-property design tokens, with no runtime CSS-in-JS or utility framework. Continue by choosing test packages plus extraction implementation and the durable login limiter, then replace the coarse build sequence with an atomic Implementation Plan and mirrored Plan Ledger.

## Goal

Build **dorothy-ann**, a self-deployed, mobile-friendly web client that can become the user's default search surface. It should handle cheap everyday web lookups, source-aware Dorothy Ann research, conversational follow-ups, lightweight topic sessions, and clean, editable artifacts that move useful context from the browser into pi.dev for coding, planning, investigation, or handoff.

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
6. A low-friction bridge into pi.dev: selected context should arrive with sources, decisions, open questions, and next actions intact.
7. User-controlled deployment and credentials.

## Core Requirements

### Chat

- Stream model responses.
- Render Markdown and code safely.
- Support stop, retry, edit-and-resend, and copy.
- Remain comfortable on desktop and narrow mobile screens.
- Allow a model to be selected per thread without coupling stored conversations to one provider's response format.

### Query Paths

A new query must take one of two visibly different paths:

- **lookup** — call the search provider and render ranked results without extraction or model synthesis. This is the low-cost, low-latency path for navigational and utility queries such as `weather` or `life alive`.
- **research** — search, extract up to the deployment-configured number of viable pages (three by default), and stream a Dorothy Ann synthesis with citations. The resulting page is already a chat thread, so the user can ask follow-up questions without entering another mode or moving elsewhere.

Routing should be predictable and reversible. The current recommendation is a deterministic browser-side router with a visible mode chip:

- ordinary keyword-like input defaults to `lookup`;
- a query ending in `?` explicitly selects `research`;
- an explicit `lookup` / `research` control always overrides inference;
- the selected path is visible before submission and can be changed with the keyboard or pointer;
- unpunctuated input remains on the cheap lookup path, but question-shaped results may offer a non-blocking `Research this with Dorothy Ann` action;
- no model call is required merely to decide which path to use.

The punctuation rule and visible route chip are the only MVP routing controls; slash commands and bang aliases are deferred. The punctuation rule applies only to new queries. Inside an existing topic, follow-up questions default to contextual chat even when they end in `?`; fresh research requires an explicit per-turn selection.

When research occurs, the interface should show both:

1. The result set returned by the search layer.
2. Dorothy Ann's synthesized answer with citations linked to those sources.

The product must preserve the distinction between retrieved evidence and model synthesis.

### Topic Sessions

A thread needs only:

- title;
- created and updated timestamps;
- optional system instruction;
- selected model configuration;
- selected search configuration;
- ordered messages;
- research runs and sources attached to the relevant turn.

Required actions:

- create;
- rename;
- archive;
- delete;
- export.

Folders, tags, embeddings, semantic retrieval, and cross-thread memory are outside the initial scope.

### Dorothy Ann Reports, Transcripts, and Pi.dev Handoff

Export is a primary workflow, not a miscellaneous settings action. The user should be able to turn either a whole thread or a selected slice of research into an artifact without cleaning up provider-specific JSON or losing source provenance.

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

- **deployment target:** Vercel for production and preview deployments;
- **frontend UI/build:** React + Vite + TypeScript;
- **routing:** React Router with `/unlock`, `/`, `/topics/:threadId`, and `/topics/:threadId/export/:draftId` routes;
- **workflow state:** XState for auth, lookup/research turn, and topic-report actors only; local React state for ordinary UI state; no global store;
- **accessible primitives:** React Aria Components, styled locally; topic drawer/evidence sheet use modal/dialog primitives;
- **Markdown:** `react-markdown` + `remark-gfm` + `rehype-sanitize`; raw HTML disabled;
- **report editor:** autosaving native textarea with Edit/Preview toggle; no rich editor in MVP;
- **styling:** CSS Modules for components plus global CSS custom-property tokens; no CSS-in-JS or utility framework;
- **backend HTTP layer:** Hono using standard Web `Request`/`Response` and SSE-compatible streaming;
- **portability boundary:** Hono application/orchestration code contains no Vercel imports; a thin Vercel function entrypoint binds environment, secrets, limits, and platform request lifecycle;
- **local runtime:** a thin Node adapter runs the same Hono application and API contracts used on Vercel;
- **browser persistence:** IndexedDB through `idb`.

React is the selected UI framework. It is used as a client-side Vite SPA, not through Next.js or another full-stack React framework. React Router owns URL parsing, deep links, browser Back behavior, and restoration hooks. XState machines live outside React components and consume normalized application events:

- `authMachine` — checking, locked, unlocking, authenticated, limited, unavailable, expired;
- `turnMachine` — lookup, search, extraction, synthesis/chat streaming, completed, stopped, failed, interrupted, and stage-specific retry;
- `reportMachine` — choosing, deterministic render or generation, clean/dirty workbench, save failure, and retry.

Machines do not become a second persistence model. Completed stages are written through `ThreadStore`/`ArtifactDraftStore`; on reload, machines initialize from persisted domain objects and route state. Drawer visibility, evidence collapse, field drafts, and other short-lived UI details remain local React state unless the interaction contract explicitly requires restoration. There is no Zustand/Redux-style global store.

React Aria Components owns low-level accessible interaction semantics for buttons, links, fields, menus, dialogs, modals, and focus restoration. The desktop topic drawer and mobile evidence sheet are presentation variants of the same dialog/modal primitives. Status announcements use explicit ARIA live regions; visual toasts never carry unique information. Component styling remains application-owned, and React Aria objects do not enter domain or storage types.

Assistant answers, report previews, and transcripts render through one Markdown pipeline: structural `AssistantContentPart` citations are first projected into message-local Markdown links, then `react-markdown` applies `remark-gfm` and `rehype-sanitize`. Raw HTML remains disabled; do not add `rehype-raw`. External links receive safe target/rel behavior, and code renders as semantic `pre`/`code` without a syntax-highlighting dependency in the MVP.

The artifact workbench has mutually exclusive Edit and Preview modes. Edit is a controlled native textarea bound to the current `ArtifactDraft`; changes autosave through `ArtifactDraftStore` after a short debounce and flush on route exit where possible. Preview uses the same sanitized renderer as answers. The textarea preserves plain Markdown exactly, remains usable on mobile, and is the source of downloaded/copied content.

Styling is split into global design foundations and local component ownership:

```text
src/ui/styles/tokens.css    color, type, spacing, radii, elevation, motion
src/ui/styles/global.css    reset, document defaults, focus and reduced-motion rules
*.module.css                component layout and visual states
```

React Aria and XState status/data attributes drive CSS Module selectors; components do not construct ad hoc global class names. Responsive behavior uses content-driven media/container queries, mobile safe-area insets, and the agreed drawer/panel/sheet layouts. Status never depends on color alone. Tokens preserve a future theme seam, but multiple themes are not an MVP requirement.

Domain types, research orchestration, export rendering, and storage adapters remain plain TypeScript rather than React-specific modules. React owns rendering, focus/overlay behavior, and composition around those boundaries. Vercel remains the target; SPA deep-link rewrites belong only in `vercel.json`.

## Initial Provider Strategy

The first provider should optimize for the user's existing workflow and API access before optimizing for a provider's branded research product. The product is not meant to recreate Perplexity's consumer interface. Its value is a user-controlled research-and-handoff layer: local threads, inspectable evidence, a distinctive “according to my research…” report, and editable artifacts for pi.dev.

Perplexity remains a viable optional adapter, especially if its API research behavior is useful, but it should not be the architectural recommendation or product dependency. A Perplexity Pro subscription and Perplexity API access are separate concerns; the existing subscription should not be assumed to provide the API key or API credits.

For the first real prototype, use **Brave Search API** as the `SearchProvider` and **Anthropic API** as the `ChatProvider`. This gives the personal pi.dev workflow and dorothy-ann a common LLM vendor while keeping web retrieval independent and application-controlled. Use separate Anthropic API keys for pi.dev and dorothy-ann when the account supports it; keep them under the same personal billing relationship to preserve one vendor/payment surface while limiting credential blast radius and making usage attributable.

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

Do not store raw provider payloads as the domain model. Candidate replacement search adapters include Tavily or Exa; candidate replacement chat adapters include OpenAI or Gemini. A second provider should be added after the first end-to-end workflow works, primarily to replay the same `EvidencePack` through another chat/search implementation and test whether the domain and exports remain provider-neutral. Provider choice remains configurable per deployment, not user-configurable in the first UI.

## Browser Interaction Design

### TODO: Complete the Browser State Layouts

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
| Chat follow-up | idle composer, contextual chat streaming/completed, explicit fresh-research selection, stop, retry, edit-and-resend |
| Evidence | inline source summary, desktop drawer, mobile bottom sheet, citation focus, extracted excerpt, original-source exit, blocked/failed source |
| Topics | recent-topic list, active topic, rename, archive, delete confirmation, empty/archive views |
| Export | answer report, topic report/transcript choice, report generation, editable preview, copy/download/native share, unsupported-share fallback, export failure |
| Storage | initial load, save in progress if surfaced, quota/unavailable/corrupt record, archive export/import, migration failure with recovery export |

For each state, the agreed design should make these details explicit:

- responsive information hierarchy and which elements disappear, collapse, or move between desktop and mobile;
- primary and secondary actions, keyboard behavior, focus destination, and cancellation path;
- transitions into and out of the state;
- what persists locally if the page reloads or an operation fails;
- which backend response or stream event drives the state;
- accessible labels and non-color-only status cues.

The wireframes may group states that share a shell, but loading, empty, partial, error, and recovery variants must be shown rather than implied. This TODO is a planning deliverable, not implementation work.

### Draft Happy-Path State Transition Matrix

This first matrix establishes the main route through the product. The exhaustive pass will add every alternate/error transition and stable state listed above.

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
| C0 | edit prior user message | C0-edit | create editable copy; original history remains until resubmit confirmation |
| C0-edit | resubmit | C1 or R0 | branch by replacing downstream turns only after explicit confirmation; preserve an exportable pre-edit snapshot until save succeeds |
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
| T0 | Archive | T0 recent list updated | set explicit archive state transactionally; offer undo announcement |
| T0 | Archived | T2 archive view | list archived summaries; restore returns item to recent |
| T0/T2 | Delete | T3 confirm delete | name topic and explain local permanence; default focus Cancel |
| T3 | confirm | T0/T2 or H0 if active | delete full + summary records transactionally; no silent undo promise |
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
| app after auth | IndexedDB unavailable | S1 storage unavailable | keep current session in memory; prominently offer artifact/archive download; explain reload risk |
| any atomic save | success | originating state | update UI only from committed normalized record where practical |
| any atomic save | quota exceeded | S2 quota | retain current exportable state in memory; offer archive/export and storage cleanup; do not report saved |
| topic load/migration | one record corrupt | S3 corrupt record | isolate record; keep app usable; offer raw recovery export and deletion |
| database upgrade | envelope migration succeeds | requested state | commit upgraded envelope; preserve IDs/timestamps |
| database upgrade | envelope migration fails | S4 migration recovery | do not overwrite source record; offer recovery export; block only affected topic |
| settings/topic drawer | Export archive | S5 archive creating | deterministic local serialization; download on success; report excluded/corrupt records explicitly |
| settings/topic drawer | Import archive selected | S6 import preview | validate version/content before writes; report add/replace/skip counts |
| S6 | confirm import | prior app state | transactionally add/replace according to explicit conflict policy; return `ImportReport` |
| S6 | cancel/invalid archive | prior state/S6 error | no writes |

#### Global Interaction Rules

- Every async state has an announced text label, not a spinner/color alone.
- `Escape` cancels the smallest active overlay first; it never silently deletes a draft or persisted turn.
- Stop is best-effort: the client aborts transport, marks the existing turn interrupted, and ignores late events that do not match the active request ID.
- A page reload reconstructs only committed turns. Transient model prose is never promoted to completed content after reload.
- Auth and storage failures supersede the current visual state but retain the local recoverable payload described above.
- Only one modal surface is active: topic drawer, evidence sheet, confirmation dialog, export chooser, or mobile workbench transition.

### Draft Responsive Shell

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
│ [Archived]               │                                                            │
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

### Draft Happy-Path Wireframes

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

### Draft Loading, Error, and Recovery Wireframes

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

#### Chat Edit, Retry, and Interruption Variants

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

MOBILE — edit-and-resend confirmation
┌────────────────────────────────┐
│ Edit your earlier question     │
│ ┌────────────────────────────┐ │
│ │ revised question…          │ │
│ └────────────────────────────┘ │
│ Later replies will be replaced │
│ after the new reply succeeds.  │
│                                │
│ [Cancel] [Resend and replace]  │
└────────────────────────────────┘
```

Retrying a completed answer leaves the prior answer visible until replacement completes. Edit-and-resend must not destroy downstream turns before the replacement is safely stored.

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
DESKTOP — rename / archive views             MOBILE — delete confirmation
┌──────────────────────────┐                 ┌──────────────────────────────┐
│ Topics               [×] │                 │ Delete “Composition…”?      │
│ [+ New topic]            │                 │                              │
│                          │                 │ This removes the local topic │
│ [Composition over…    ]  │ ← inline rename │ and its sources permanently.│
│ [Save] [Cancel]          │                 │                              │
│                          │                 │ [Cancel] [Delete topic]      │
│ Archived (2)             │                 └──────────────────────────────┘
│ • old topic       [Restore]
└──────────────────────────┘

DESKTOP/MOBILE — empty drawer content
┌──────────────────────────┐
│ No recent topics yet.    │
│ Questions you research   │
│ with Dorothy Ann appear  │
│ here on this device.     │
│ [+ New topic]            │
└──────────────────────────┘
```

Delete defaults focus to Cancel. Archive offers an announced undo action; permanent delete does not claim an undo capability.

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
│ [Download current report] [Export archive] [Storage help]                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ preserved in-memory topic / answer                                           │
└──────────────────────────────────────────────────────────────────────────────┘

MOBILE — corrupt topic recovery             DESKTOP — import preview
┌────────────────────────────────┐           ┌──────────────────────────────────┐
│ This topic couldn't be loaded. │           │ Import Dorothy Ann archive       │
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

An answer-scoped Dorothy Ann report deterministically renders the question, researched answer, caveats, and message-local numbered sources; it requires no additional model call. A topic-scoped report may use one model call to condense the thread into objective, findings, evidence, decisions, open questions, and next actions. A transcript is always deterministic. Every artifact becomes editable workbench state before copy/download/share, and edits affect only that artifact—not the stored topic. The workbench has its own route beneath the topic so browser Back returns to the preserved conversation position. Refresh reconstructs deterministic exports; handling refresh during a generated or edited draft belongs to the exhaustive storage/error-state pass.

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
  visibleSummary?: string;
}
```

Only completed assistant messages enter `ThreadContextInput`; interrupted prose and failed extraction content are excluded. The backend reapplies deployment context/token/character limits and returns `413 context_too_large` rather than silently dropping recent user content. A future explicit compaction flow may supply `visibleSummary`.

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
  list(options?: { archived?: boolean }): Promise<ThreadSummary[]>;
  load(threadId: ThreadId): Promise<Thread | null>;
  save(thread: Thread): Promise<void>;
  archive(threadId: ThreadId): Promise<void>;
  remove(threadId: ThreadId): Promise<void>;
  exportData(threadIds?: ThreadId[]): Promise<ThreadArchive>;
  inspectImport(archive: ThreadArchive): Promise<ImportPreview>;
  importData(
    archive: ThreadArchive,
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

Anthropic receives the `EvidencePack` for `research_synthesis` and topic-report requests; it does not perform search in the initial implementation. The system instruction must say that all evidence is untrusted reference material, that instructions inside retrieved pages have no authority, and that claims may cite only supplied `SourceId` values. The adapter converts model citation references into normalized `AssistantContentPart[]`; visible citation numbers are still assigned by the application.

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
  archivedAt?: IsoTimestamp;
  systemInstruction?: string;
  modelRef: string;
  searchRef: string;
  visibleContextSummary?: string;
  turns: Turn[];
}

interface ThreadSummary {
  id: ThreadId;
  title: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  archivedAt?: IsoTimestamp;
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

`SourceId` is stable within a topic and its exports. The client reconciles new results by canonical URL against existing topic sources and reuses the existing ID; otherwise it preserves the server-issued opaque ID. Duplicate canonical URLs in one result set collapse to the highest-ranked result while retaining provenance in extraction metadata.

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

interface ThreadArchive {
  archiveVersion: 1;
  exportedAt: IsoTimestamp;
  threads: Array<{ schemaVersion: 1; thread: Thread }>;
}

interface ImportIssue {
  threadId?: ThreadId;
  code: "invalid_archive" | "unsupported_version" | "invalid_thread";
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

## Proposed System Flow

### Ordinary Chat Turn

```text
user submits message
        ↓
persist user message
        ↓
build bounded conversation context
        ↓
stream request through ChatProvider
        ↓
render partial response
        ↓
persist completed assistant message and usage metadata
```

### Explicit Research Turn

```text
user submits message with search enabled
        ↓
persist user message
        ↓
derive one or more search queries
        ↓
SearchProvider returns ranked results
        ↓
show result cards immediately
        ↓
extract ranked candidates until targetViablePages (default 3)
or the result set is exhausted
        ↓
construct research context with stable source IDs
        ↓
stream synthesis through ChatProvider
        ↓
render citations against source IDs
        ↓
persist assistant message + ResearchRun + usage metadata
```

The first implementation should avoid an autonomous multi-step research loop. A bounded sequence—one search, extraction up to the configured viable-page target, and one synthesis—is sufficient to validate the product.

### Lookup Promotion

```text
user selects “Research this with Dorothy Ann”
        ↓
create ResearchRun from the existing query and SearchResult[]
        ↓
walk results in rank order, skipping non-viable pages
        ↓
stop at targetViablePages (default 3) or exhaustion
        ↓
stream one cited synthesis through ChatProvider
```

Promotion never repeats the initial search. If the existing results are weak, the user can edit the query and deliberately submit a new research turn.

### Export Flow

```text
user chooses export format
        ↓
load normalized thread and attached sources
        ↓
transcript export?
        ├── yes → deterministic Markdown rendering
        └── no  → Dorothy Ann report
                    ├── answer scope → deterministic rendering
                    └── topic scope  → one model-assisted condensation
        ↓
preview artifact
        ↓
copy / download / share
```

Transcript and answer-scoped Dorothy Ann report export must not require a model call. Topic-scoped Dorothy Ann report export may use one, but the generated artifact must be editable before leaving the application.

## Storage Strategy

The initial storage decision is local-browser-only, not storage-hardcoded. `LocalThreadStore` is the MVP implementation; `ThreadStore` remains the application boundary. There is no synchronization or cross-device continuity in the first deployment. Deterministic archive export/import is required so browser-local data can be backed up, moved manually, and migrated into a future remote store.

The canonical `ThreadStore` contract is defined in `System Abstractions`. It covers list/load/save/archive/remove plus deterministic archive inspection, import, and export while leaving IndexedDB mechanics out of the domain.

Storage requirements:

- persist versioned, provider-neutral domain objects;
- use stable thread, message, research-run, and source IDs;
- keep serialization/migrations inside the storage adapter;
- make writes atomic enough that a refresh cannot leave a half-written thread;
- handle unavailable, full, or corrupted browser storage without losing the current exportable artifact;
- keep archived/deleted semantics explicit rather than relying on UI filtering;
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

`LocalThreadStore.save` opens a read-write transaction across `threads` and `threadSummaries` and commits both records together. Archive state remains explicit in normalized thread data; deletion removes the full record, summary, and associated artifact drafts in one transaction. Database-version upgrades run through `idb`'s `upgrade` callback; domain schema migration remains a separately testable pure function over `StoredThreadEnvelope`.

An `ArtifactDraftStore` backed by the same database owns workbench drafts. The `by-source-key` index is unique, permitting at most one active draft per `sourceKey`; reopening that export offers Resume or Start over. Deterministic and generated artifacts are saved once complete, edits autosave with a short debounce, and Back offers Keep draft, Discard, or Stay when dirty. Copy/download/share does not silently delete a draft. Drafts are excluded from thread archives and topic history, are not listed as durable artifacts, survive archive/refresh/browser restart, and are deleted with their source topic or by explicit discard.

`RemoteThreadStore` can later map the same normalized objects to authenticated API calls and server persistence. The UI should not branch on local versus remote storage; synchronization status, if eventually added, should be an adapter-provided capability/state.

## Context Management

Short threads can send the complete transcript. As a thread approaches a configurable context budget, the interface should make that state visible and offer explicit choices:

```text
thread approaches context budget
        ├── compact earlier messages into a visible summary
        ├── export and begin a new thread
        └── continue with higher cost or reduced history
```

Compaction must not create hidden memory. Store and display the generated context summary as part of the thread so the user can inspect what future responses receive.

## Deployment and Credential Boundary

There are two legitimate initial deployment shapes:

### Option A: static frontend plus server-side proxy

```text
static frontend host
        ├── browser-local ThreadStore implementation
        ├── browser UI and Markdown export
        └── calls same-origin or proxied requests
                 ↓
        edge function / serverless proxy
                 └── provider calls with server-side secrets
```

GitHub Pages can host the static frontend, but it provides no special advantage once a backend proxy is required. It remains useful if free static hosting, GitHub-based deployment, or familiarity are priorities. The trade-off is two separately configured deployments, cross-origin/auth configuration, and potentially separate domains.

Vercel + Functions is the committed deployment target because it offers convenient frontend hosting, previews, serverless functions, and secret configuration. This is a product/deployment decision, not an application-core dependency. Cloudflare Pages + Workers remains a possible future adapter and portability check, not an alternate MVP target.

This deployment does **not** provide cross-device continuity: IndexedDB belongs to one browser profile on one device. It does provide safe provider-key storage when the proxy keeps credentials server-side. Direct calls to model/search APIs from the browser may fail because of CORS, expose secrets, or create uncontrolled spend.

The local-only choice should not leak into the rest of the application. The UI and domain services should depend on the existing asynchronous `ThreadStore` interface, not on `localStorage`, IndexedDB, serialization details, or browser APIs. The first implementation can be `LocalThreadStore`; a later `RemoteThreadStore` can satisfy the same contract without changing chat, research, export, or thread UI behavior.

## Portability and Deployment Boundaries

No hosting platform should be structurally critical to the application. The deployable system should have three independently replaceable layers:

```text
application core
  ├── normalized domain types
  ├── chat/search/extraction/export interfaces
  ├── research orchestration
  └── thread and artifact behavior
          │
          ├── runtime adapter
          │     ├── local HTTP server
          │     ├── Vercel Function (initial target)
          │     └── Cloudflare Worker / other serverless adapter
          │
          └── infrastructure adapters
                ├── LocalThreadStore
                ├── RemoteThreadStore
                ├── provider implementations
                └── secret/configuration bindings
```

Portability invariants:

- application-core code imports no Vercel, Cloudflare, framework, or browser-storage package;
- provider adapters consume a small configuration object and return normalized domain values;
- runtime adapters translate platform-specific request/response objects to standard Web `Request`/`Response` behavior;
- secrets enter only through runtime configuration and are never represented in frontend configuration;
- storage implementations satisfy `ThreadStore`; the UI does not know whether data is local, remote, relational, or object-backed;
- export rendering is deterministic and runnable locally without a hosted platform;
- a local command can exercise the same HTTP API used by the deployed frontend;
- deployment-specific conveniences may be used in adapters, but they must not change domain behavior or data formats.

The initial target may use Vercel conveniences—preview deployments, project environment variables, function routing, and observability—without making Vercel APIs part of the application core. A second runtime adapter should be a verification exercise, not a rewrite.

Therefore a static deployment is safe only if either:

- the first proof uses mocked/fixture providers; or
- it calls a separately hosted backend/proxy whose credentials and limits are server-side.

### Secret placement for the static proof

The LLM and search provider keys must never be placed in the GitHub Pages bundle, HTML, JavaScript, source maps, browser storage, or request parameters. Anything shipped to the browser should be treated as public and recoverable by the user or an attacker.

The minimum safe architecture is:

```text
static frontend host
        │ public HTTPS request
        ▼
small server-side proxy / edge function
        ├── provider keys in encrypted deployment secrets
        ├── request validation and limits
        ├── provider API calls
        └── normalized response back to browser
```

For a personal proof, a separately deployed edge/serverless function is sufficient. Its provider keys live in the platform's secret manager/environment, never in the repository or client bundle. The proxy should allow only the operations needed by the app, enforce bounded input/output, apply rate limits, and avoid logging prompts or credentials.

The proxy itself still needs an access boundary. A token embedded in the frontend is not a secret; it can prevent casual misuse but cannot stop extraction. Prefer an access layer such as a private deployment gate, Cloudflare Access/OAuth, or a user-entered rotating app token sent only to the proxy. If the proof is intentionally public, use fixtures or a zero-cost/delegated provider rather than exposing a paid provider key.

### Option B: small hosted personal app

```text
static web client / hosted frontend
        ↓ authenticated request
small application backend
        ├── server-side provider credentials
        ├── RemoteThreadStore implementation
        ├── chat provider adapter
        ├── search provider adapter
        └── content extraction adapter
```

This supports cross-device use, secrets, rate limits, and a real default-search workflow. It does not require a large platform: a small serverless/API deployment plus managed or embedded database is enough for the single-user MVP.

### Recommended rollout

Use a two-stage rollout with one domain model and a swappable storage boundary:

1. **local/static proof:** a static frontend host (GitHub Pages is optional), `LocalThreadStore`, fixture or proxied providers, deterministic export. Validate the core interaction in roughly 1–3 focused days of implementation time.
2. **cross-device upgrade, only if earned:** keep the same domain and UI contracts, implement `RemoteThreadStore` behind a small authenticated backend, and add sync/import migration. Estimate roughly 3–7 focused days after the proof, depending on the chosen hosting/auth/database services.

The prototype should include an explicit export/import path even if remote storage is not planned. This protects the user's local threads from a future storage change and gives the product a useful manual cross-device escape hatch: export a thread or archive on one device, import it on another.

These are estimates for a narrow single-user build, not a commitment. The main schedule risk is provider integration and authentication—not the chat UI or Markdown export. If cross-device usage is a prerequisite for judging the product, skip Option A as a product milestone and build Option B directly; the likely initial phase becomes roughly 1–2 weeks of focused implementation including deployment hardening and testing.

Credentials should be deployment secrets and remain server-side. Even in the static proof, the browser should never receive long-lived provider credentials. The initial product is single-user; it should avoid building general account management, while still keeping an authentication boundary around private threads and provider routes.

## Authentication and Access Boundary

The first deployment is personal and single-owner, but passphrase handling must remain an adapter rather than an application-core dependency:

```ts
interface AuthClient {
  getSession(): Promise<AuthSession | null>;
  beginLogin(returnTo: string): Promise<void>;
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
  200 { authenticated: true, session: { subject, method, expiresAt } }

POST /api/auth/passphrase
  body: { passphrase: string }
  200 { authenticated: true, session: { subject, method, expiresAt } }
      + Set-Cookie: __Host-dorothy-ann-session=…;
        HttpOnly; Secure; SameSite=Lax; Path=/
  400 malformed request
  401 invalid passphrase
  429 rate limited

POST /api/auth/logout
  204 + expired __Host-dorothy-ann-session cookie
```

The initial server auth adapter verifies the submitted passphrase against a strong password hash stored in deployment secrets and issues a signed session for `subject: "owner"`. The session has a rolling seven-day idle expiry and a non-extendable 30-day absolute expiry measured from initial authentication. The adapter may refresh the cookie after authenticated activity without moving the absolute deadline. A separate signing secret permits session invalidation/rotation without changing the passphrase. Login attempts pass through a `LoginAttemptLimiter` adapter backed by a deployment-appropriate durable limiter; process-local counters are not sufficient in serverless runtimes.

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

Cost is relevant but not the primary constraint. The system should make usage understandable rather than aggressively optimize every request.

Track per turn, thread, and billing period where available:

- model input and output tokens;
- searches performed;
- pages extracted;
- estimated model cost;
- estimated research cost.

Support configurable limits for:

- output tokens;
- searches per turn;
- extracted pages and characters;
- context budget;
- soft monthly spend warning.

## Explicit Non-Goals

- Coding-agent execution inside the web/mobile app (pi.dev remains the execution environment).
- Filesystem or shell access from the web/mobile app.
- General tool/plugin ecosystems.
- Vector databases or semantic memory.
- Automatic permanent memory.
- Document-library management.
- Native mobile applications.
- Collaboration or multi-user accounts.
- Autonomous open-ended research loops.
- Integration with every notes platform.

The application may later become installable as a PWA, but offline support should not block validation of the core chat-search-export loop.

## Proposed Build Sequence

- [ ] **Phase 1 — validate the browser loop:** mobile/desktop query entry, one chat adapter, one search adapter, explicit research, visible result/source evidence, streamed synthesis, and deterministic Markdown export. Target: roughly 1–3 focused implementation days with fixture or proxied providers.
- [ ] **Phase 1 — validate the pi artifact loop:** researched answer or whole topic → editable Dorothy Ann report preview → copy/download/shareable Markdown with sources, decisions, and next actions. Target: included in the same 1–3 day proof.
- [ ] **Phase 2 — add lightweight persistence:** topic list, rename/archive/delete, normalized messages and sources. Target: part of the static proof locally, then moved behind the store boundary.
- [ ] **Phase 3 — add cross-device continuity:** authenticated server-side `ThreadStore`, server-side provider calls, and synchronized desktop/mobile access so the tool can plausibly become the default search surface across devices. Target: roughly 3–7 additional focused implementation days, or 1–2 weeks total if this is required from the start.
- [ ] **Improve reports:** arbitrary source/message selection, context compaction, optional report customization, and usage visibility.
- [ ] **Test the abstractions:** add a second implementation behind the chat and search boundaries without changing domain storage, artifact format, or UI behavior.

## Open Questions for the Next Session

The browser interaction decisions, React + Vite + Hono + Vercel deployment stack, React Router routes, selective XState workflow boundaries, and initial provider split are settled: Brave Search for ranked discovery, application-controlled extraction, and Anthropic for chat/synthesis. Remaining implementation-level choices are test packages, extraction implementation details, and the durable login-attempt limiter behind the Vercel adapter.

## Next

Replace the coarse build sequence with atomic implementation steps and a mirrored Plan Ledger. Each step must name its deliverable, touched boundary, dependency, and verification method; then settle the remaining concrete provider/framework/limiter choices.
