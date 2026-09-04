# Lightweight Research Chat → Pi Artifact Workbench

## Current State

- Status: planning
- Last updated: 2026-05-12
- Current focus: choosing a deployment shape that validates the browser → research → pi artifact loop without prematurely building a full backend
- Handoff lives in: [`## Handoff`](#handoff)
- Next action: choose whether the initial phase is a static/local proof or a cross-device hosted MVP

## Handoff

The core abstractions remain intentionally small: normalized chat, search, extraction, thread storage, and export boundaries. The important product clarification is that this is not merely a lightweight research chat: it should become a practical personal search surface for desktop and mobile browsers, with a fast path from web evidence to editable artifacts that pi.dev can consume. The key deployment question is now whether to validate the interaction as a static GitHub Pages app first or include hosted persistence immediately. Continue by defining the smallest end-to-end browser → research thread → Markdown artifact → pi workflow and making the deployment trade-off explicit.

## Goal

Build a self-deployed, mobile-friendly web client that can become the user's default search surface for exploratory questions. It should support ordinary chat, explicit web research, lightweight topic sessions, and clean, editable artifacts that move useful context from the browser into pi.dev for coding, planning, investigation, or handoff.

The product is intentionally an ephemeral thinking surface—not a knowledge base, coding agent, or permanent memory system. Its durable output is the artifact the user chooses to export, not an invisible memory layer.

## Product Shape

> An ephemeral, source-aware chat client with clean exits.

```text
ask / discuss
     │
     ├── optional web search
     │      └── inspectable results and source content
     │
     ├── streamed answer with citations
     │
     └── lightweight topic thread
                  │
                  └── export Markdown
                           ↓
                durable notes / repo / desktop handoff
```

The core value is not generic LLM chat. It is the combination of:

1. A browser-search entry point that is useful enough to replace the default search habit for research-heavy questions.
2. Search results and extracted evidence that remain visible and inspectable.
3. Lightweight, topic-oriented conversations rather than a permanent knowledge base.
4. A high-signal, editable artifact export as a first-class completion action.
5. A low-friction bridge into pi.dev: selected context should arrive with sources, decisions, open questions, and next actions intact.
6. User-controlled deployment and credentials.

## Core Requirements

### Chat

- Stream model responses.
- Render Markdown and code safely.
- Support stop, retry, edit-and-resend, and copy.
- Remain comfortable on desktop and narrow mobile screens.
- Allow a model to be selected per thread without coupling stored conversations to one provider's response format.

### Research

Each user turn has an explicit research mode:

```text
[ off | auto | search ]  ask anything…
```

- **off** — ordinary conversation without web access.
- **auto** — the system may search when current or external information would help.
- **search** — the system must perform web research before answering.

The initial version may simplify this to a single explicit `web search` toggle. Predictability is more important than autonomous behavior in the MVP.

When research occurs, the interface should show both:

1. The result set returned by the search layer.
2. The model's synthesized answer with citations linked to those sources.

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

### Artifact Export and Pi.dev Handoff

Export is a primary workflow, not a miscellaneous settings action. The user should be able to turn either a whole thread or a selected slice of research into an artifact without cleaning up provider-specific JSON or losing source provenance.

Support:

- download as `.md`;
- copy as Markdown;
- invoke the platform share action where available;
- export only selected messages, sources, or answer sections;
- choose a durable transcript or a concise pi.dev handoff;
- preview and edit the artifact before it leaves the application.

The initial pi.dev integration should be file/protocol-level rather than a deep API integration: produce predictable Markdown that can be pasted, downloaded, shared, or placed into the working context of a pi session. Avoid coupling the web app to pi internals until the artifact contract proves useful.

A pi.dev handoff should optimize for actionability rather than transcript completeness. It should preserve:

- the user's objective and relevant constraints;
- conclusions and claims, separated from evidence;
- source links and optionally bounded source excerpts;
- decisions made and decisions still open;
- concrete next actions or an implementation prompt;
- an explicit note that the content is research context, not executed or verified work.

Two useful export forms:

1. **Transcript** — complete conversation with sources and metadata.
2. **Handoff** — concise context, conclusions, decisions, unresolved questions, sources, and suggested next actions.

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

## System Abstractions

The domain should depend on small internal interfaces rather than provider-specific payloads.

```ts
interface ChatProvider {
  stream(input: ChatInput): Promise<ChatStream>;
}

interface SearchProvider {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

interface ContentExtractor {
  extract(urls: string[]): Promise<ExtractedPage[]>;
}

interface ThreadStore {
  list(): Promise<ThreadSummary[]>;
  load(threadId: string): Promise<Thread>;
  save(thread: Thread): Promise<void>;
  archive(threadId: string): Promise<void>;
  remove(threadId: string): Promise<void>;
}

interface Exporter {
  export(thread: Thread, format: ExportFormat): Promise<ExportArtifact>;
}
```

Provider responses should be normalized at the boundary. Stored threads should not require a particular provider SDK to be read or exported.

### Core Domain Objects

```text
Thread
  ├── metadata
  ├── model configuration reference
  ├── search configuration reference
  └── Messages[]

Message
  ├── role
  ├── content
  ├── usage metadata
  └── ResearchRun?

ResearchRun
  ├── query or queries
  ├── SearchResult[]
  └── extraction metadata

SearchResult
  ├── stable source ID
  ├── rank
  ├── title
  ├── URL
  ├── snippet
  └── extracted content?
```

Sources should be stored separately from generated prose rather than embedded only inside provider response JSON. This keeps citation rendering, retries, exports, and provider changes tractable.

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
optionally extract bounded content from top results
        ↓
construct research context with stable source IDs
        ↓
stream synthesis through ChatProvider
        ↓
render citations against source IDs
        ↓
persist assistant message + ResearchRun + usage metadata
```

The first implementation should avoid an autonomous multi-step research loop. A bounded sequence—search, optional extraction, one synthesis—is sufficient to validate the product.

### Auto Research Turn

```text
user submits message in auto mode
        ↓
small routing decision: search or chat directly
        ├── no search → ordinary chat flow
        └── search    → explicit research flow
```

Auto mode is optional and should come after the explicit flow is reliable. The routing decision and any generated queries should remain visible for inspection.

### Export Flow

```text
user chooses export format
        ↓
load normalized thread and attached sources
        ↓
transcript export?
        ├── yes → deterministic Markdown rendering
        └── no  → model-assisted handoff synthesis
        ↓
preview artifact
        ↓
copy / download / share
```

Transcript export should not require a model call. Handoff export may use one, but the generated artifact must be editable before leaving the application.

## Storage Strategy

The initial storage decision is local-first, not storage-hardcoded. `LocalThreadStore` is the MVP implementation; `ThreadStore` remains the application boundary.

The storage contract should cover the operations the UI actually needs while leaving backend mechanics out of the domain:

```ts
interface ThreadStore {
  list(): Promise<ThreadSummary[]>;
  load(threadId: ThreadId): Promise<Thread | null>;
  save(thread: Thread): Promise<void>;
  archive(threadId: ThreadId): Promise<void>;
  remove(threadId: ThreadId): Promise<void>;
  exportData(threadIds?: ThreadId[]): Promise<ThreadArchive>;
  importData(archive: ThreadArchive): Promise<ImportReport>;
}
```

Storage requirements:

- persist versioned, provider-neutral domain objects;
- use stable thread, message, research-run, and source IDs;
- keep serialization/migrations inside the storage adapter;
- make writes atomic enough that a refresh cannot leave a half-written thread;
- handle unavailable, full, or corrupted browser storage without losing the current exportable artifact;
- keep archived/deleted semantics explicit rather than relying on UI filtering;
- avoid assuming all devices share a clock, browser, or storage quota.

`LocalThreadStore` may begin with `localStorage` for the smallest proof. If thread size grows because of extracted source content, move that implementation to IndexedDB without changing the rest of the app. `RemoteThreadStore` can later map the same normalized objects to authenticated API calls and server persistence. The UI should not branch on local versus remote storage; synchronization status, if eventually added, should be an adapter-provided capability/state.

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

### Option A: static GitHub Pages proof

```text
GitHub Pages static app
        ├── browser-local ThreadStore implementation
        ├── browser UI and Markdown export
        └── calls to an external/proxy research service (if any)
```

This is inexpensive and fast for validating the interaction, responsive layout, export UX, and artifact shape. It does **not** provide cross-device continuity: `localStorage` belongs to one browser profile on one device, and a static client cannot safely contain provider credentials. Direct calls to model/search APIs may also fail because of CORS, expose secrets, or create uncontrolled spend.

The local-only choice should not leak into the rest of the application. The UI and domain services should depend on the existing asynchronous `ThreadStore` interface, not on `localStorage`, IndexedDB, serialization details, or browser APIs. The first implementation can be `LocalThreadStore`; a later `RemoteThreadStore` can satisfy the same contract without changing chat, research, export, or thread UI behavior.

Therefore a static deployment is safe only if either:

- the first proof uses mocked/fixture providers; or
- it calls a separately hosted backend/proxy whose credentials and limits are server-side.

### Secret placement for the static proof

The LLM and search provider keys must never be placed in the GitHub Pages bundle, HTML, JavaScript, source maps, browser storage, or request parameters. Anything shipped to the browser should be treated as public and recoverable by the user or an attacker.

The minimum safe architecture is:

```text
GitHub Pages frontend
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

1. **local/static proof:** GitHub Pages or equivalent frontend, `LocalThreadStore`, fixture or proxied providers, deterministic export. Validate the core interaction in roughly 1–3 focused days of implementation time.
2. **cross-device upgrade, only if earned:** keep the same domain and UI contracts, implement `RemoteThreadStore` behind a small authenticated backend, and add sync/import migration. Estimate roughly 3–7 focused days after the proof, depending on the chosen hosting/auth/database services.

The prototype should include an explicit export/import path even if remote storage is not planned. This protects the user's local threads from a future storage change and gives the product a useful manual cross-device escape hatch: export a thread or archive on one device, import it on another.

These are estimates for a narrow single-user build, not a commitment. The main schedule risk is provider integration and authentication—not the chat UI or Markdown export. If cross-device usage is a prerequisite for judging the product, skip Option A as a product milestone and build Option B directly; the likely initial phase becomes roughly 1–2 weeks of focused implementation including deployment hardening and testing.

Credentials should be deployment secrets and remain server-side. Even in the static proof, the browser should never receive long-lived provider credentials. The initial product is single-user; it should avoid building general account management, while still keeping an authentication boundary around private threads and provider routes.

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
- [ ] **Phase 1 — validate the pi artifact loop:** selected research → editable handoff preview → copy/download/shareable Markdown with sources, decisions, and next actions. Target: included in the same 1–3 day proof if the artifact format stays narrow.
- [ ] **Phase 2 — add lightweight persistence:** topic list, rename/archive/delete, normalized messages and sources. Target: part of the static proof locally, then moved behind the store boundary.
- [ ] **Phase 3 — add cross-device continuity:** authenticated server-side `ThreadStore`, server-side provider calls, and synchronized desktop/mobile access so the tool can plausibly become the default search surface across devices. Target: roughly 3–7 additional focused implementation days, or 1–2 weeks total if this is required from the start.
- [ ] **Improve handoff:** handoff export, context compaction, source selection, and usage visibility.
- [ ] **Test the abstractions:** add a second implementation behind the chat and search boundaries without changing domain storage, artifact format, or UI behavior.

## Open Questions for the Next Session

1. **Persistence boundary:** use `LocalThreadStore` for the static/local proof. Keep the application dependent on the abstract `ThreadStore`, with versioned export/import so a later `RemoteThreadStore` can be composed or swapped in without rewriting the product.
2. **Default-search behavior:** should the home screen always perform web search, or offer chat/search as an explicit mode while the product is being validated?
3. **Research mode:** is `auto` important for the MVP, or should search remain fully explicit and predictable?
4. **Extraction policy:** should source extraction be required for every researched turn, selectively triggered for the top results, or user-triggered per source?
5. **Pi artifact contract:** is a downloadable/copyable Markdown handoff sufficient initially, or should the MVP target a specific pi.dev import/paste convention?
6. **Artifact scope:** should users export a whole thread, selected messages/sources, or both?
7. **Handoff shape:** fixed template first, user-configurable templates, or fixed required sections plus optional customization?
8. **Citation contract:** what is the smallest source-ID/citation format that remains reliable across chat implementations and exports?
9. **Failure behavior:** how should failed or partial streamed responses appear and persist?
10. **Deployment boundary:** is the initial deployment strictly personal, or should the architecture preserve a future multi-user boundary?

## Next

Decide whether cross-device continuity is required to evaluate the product. If not, build the static/local proof first; if yes, start with the small hosted personal app. Then define the browser interaction, normalized TypeScript domain types, and deployment contract before selecting concrete infrastructure or external providers.
