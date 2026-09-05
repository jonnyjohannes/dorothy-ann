# dorothy-ann: Search, Research Chat, and Pi Artifact Workbench

## Current State

- Status: planning
- Last updated: 2026-09-05
- Current focus: completing exact lookup, research, retry, and SSE request/response contracts
- Handoff lives in: [`## Handoff`](#handoff)
- Next action: define the remaining application HTTP contracts, then align normalized domain types and the Plan Ledger

## Handoff

The product is now named **dorothy-ann**. It is a personal browser search surface whose defining agent flow is inspired by Dorothy Ann from *The Magic School Bus*: for substantive questions, Dorothy Ann researches the web and responds, “According to my research…” with inspectable evidence. Not every query deserves that flow. Navigational and utility lookups such as `weather` or `life alive` should return ordinary search results quickly and without model synthesis; full questions should enter a source-aware research thread with chat immediately available for follow-ups. The application remains platform-neutral, with Vercel only as the first convenient deployment target. New-query routing is settled: keyword-like and unpunctuated input takes the cheap lookup path; a terminal `?` chooses research; question-shaped lookup results may suggest `Research this with Dorothy Ann` without automatically incurring model cost; and a visible route chip can always override the route. The MVP adds no slash commands or bang aliases. Inside an existing thread, punctuation does not trigger fresh research: follow-ups default to chat and the user explicitly selects research when new evidence is needed. Lookup promotion is also settled: reuse the existing ranked result set without another search, walk it in rank order until the configured number of viable pages has been extracted, and synthesize from those pages. The initial extraction target is three viable pages. It is deployment configuration only—there is no user-facing or per-request control in the MVP. The user can ask Dorothy Ann to research further or more broadly in a later turn. Citation identity is settled: source identity is stable internally across the topic and exports, while visible citation numbers restart for each assistant answer in first-citation order. Failure handling is stage-aware: preserve every completed stage, synthesize with a caveat when at least one viable page exists, never produce the Dorothy Ann research claim with zero viable pages, and retry only the failed stage where possible. Partial streamed prose is not persisted as a completed answer. The MVP persistence milestone is settled: threads live only in the current browser profile, with deterministic export/import as the continuity and migration escape hatch; cross-device remote storage is deferred. `LocalThreadStore` uses IndexedDB through the small `idb` promise/schema wrapper from the start so extracted source content, transactional writes, and schema migration do not depend on localStorage's synchronous size-constrained model. `idb` remains private to the infrastructure adapter. The hosted app is personal/single-owner and uses a portable passphrase auth adapter: a dedicated `/unlock` screen exchanges the entered passphrase for a signed secure session cookie with a seven-day idle and 30-day absolute expiry, while protected application routes depend only on normalized `AuthContext`. MVP export scope is also settled: export one researched answer or a whole topic as an editable **Dorothy Ann report**, and export a whole topic as a deterministic transcript; arbitrary message/source selection and direct pi integration are deferred. Continue by completing lookup, research, retry, and SSE contracts, then align normalized domain types and the Plan Ledger.

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

## Initial Provider Strategy

The first provider should optimize for the user's existing workflow and API access before optimizing for a provider's branded research product. The product is not meant to recreate Perplexity's consumer interface. Its value is a user-controlled research-and-handoff layer: local threads, inspectable evidence, a distinctive “according to my research…” report, and editable artifacts for pi.dev.

Perplexity remains a viable optional adapter, especially if its API research behavior is useful, but it should not be the architectural recommendation or product dependency. A Perplexity Pro subscription and Perplexity API access are separate concerns; the existing subscription should not be assumed to provide the API key or API credits.

For the first real prototype, prefer the provider whose API key and model behavior already work well for the user's pi.dev workflow. If that provider offers web search with citations, use its native search tool. If it does not, compose a standalone `SearchProvider` with that provider's `ChatProvider`. This validates the application idea without asking the user to adopt another provider first.

The adapter must preserve the application's separate boundaries:

```text
provider adapter(s)
  ├── provider response → normalized SearchResult[]
  ├── provider response → normalized citation metadata
  └── provider response → ChatStream / ResearchAnswer
```

Do not store raw provider payloads as the domain model. Candidate implementations include OpenAI Responses web search, Gemini Google Search grounding, Anthropic web search, Perplexity search/synthesis, or a standalone search provider plus a separate chat provider. These integrations expose different search controls and citation metadata; the normalized citation contract is the portability seam.

A second provider should be added after the first end-to-end workflow works, primarily to test whether the domain and exports truly remain provider-neutral. Provider choice should remain configurable per deployment, not user-configurable in the first UI.

## Browser Interaction Design

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

- desktop: inline source summary plus an optional right-side evidence drawer;
- mobile: inline source summary plus a bottom sheet;
- activating a citation focuses the matching source and bounded excerpt;
- opening the original source is a separate, obvious action;
- search snippets and extracted passages are visually distinct from Dorothy Ann's prose.

### Markdown Export

Export stays close to the content:

- each researched answer offers `Export report`;
- the topic header offers `Export topic`, then `Dorothy Ann report` or `Transcript`;
- export opens an editable Markdown preview rather than downloading immediately;
- completion actions are copy, `.md` download, and native share where available;
- there is no arbitrary message/source selection mode in the MVP.

The export contract is explicit:

```ts
type ExportRequest =
  | { format: "dorothy_ann_report"; scope: "answer"; turnId: TurnId }
  | { format: "dorothy_ann_report"; scope: "topic"; threadId: ThreadId }
  | { format: "transcript"; scope: "topic"; threadId: ThreadId };
```

An answer-scoped Dorothy Ann report deterministically renders the question, researched answer, caveats, and message-local numbered sources; it requires no additional model call. A topic-scoped report may use one model call to condense the thread into objective, findings, evidence, decisions, open questions, and next actions. A transcript is always deterministic. Every artifact becomes editable preview state before copy/download/share, and edits affect only that artifact—not the stored topic.

A lookup-only result does not produce a Dorothy Ann report because Dorothy Ann has not researched it. `Export links` may create a small deterministic Markdown link list without invoking a model, or the user may promote the lookup to research first.

### Required Turn Event Contract

Research needs structured progress and evidence events in addition to text deltas. Runtime adapters should expose a transport such as SSE over a normalized application event contract:

```ts
type TurnEvent =
  | { type: "turn.started"; turnId: TurnId; mode: "chat" | "research" }
  | { type: "research.query"; runId: ResearchRunId; query: string }
  | { type: "research.sources"; runId: ResearchRunId; sources: SearchResult[] }
  | {
      type: "research.progress";
      runId: ResearchRunId;
      phase: "searching" | "extracting" | "synthesizing";
    }
  | { type: "answer.delta"; turnId: TurnId; part: AssistantContentPart }
  | { type: "turn.completed"; message: Message; researchRun?: ResearchRun }
  | {
      type: "turn.failed";
      turnId: TurnId;
      stage: TurnStage;
      code: TurnErrorCode;
      retryable: boolean;
      message: string;
      researchRun?: ResearchRun;
    };

type TurnStage = "search" | "extraction" | "synthesis" | "transport";
```

Lookup does not use this expensive orchestration path. It calls `SearchProvider.search` through a bounded lookup endpoint and returns normalized `SearchResult[]`. Promotion passes those normalized results into research orchestration rather than invoking search again. Cancellation, retry, and persistence must use stable turn/run IDs so a disconnected stream cannot create duplicate messages or research runs.

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
  export(request: ExportRequest, thread: Thread): Promise<ExportArtifact>;
}
```

Provider responses should be normalized at the boundary. Stored threads should not require a particular provider SDK to be read or exported.

### Core Domain Objects

A turn is an explicit aggregate because a user message, research evidence, failure state, and optional assistant answer must survive independently:

```text
Thread
  ├── metadata
  ├── model configuration reference
  ├── search configuration reference
  └── Turn[]

Turn
  ├── stable turn ID
  ├── mode: chat | research
  ├── status: pending | running | completed | failed | interrupted
  ├── user Message
  ├── assistant Message?
  ├── ResearchRun?
  └── TurnFailure?

Message
  ├── stable message ID
  ├── role
  ├── content
  └── usage metadata

ResearchRun
  ├── stable research-run ID
  ├── status: searching | extracting | ready | partial | insufficient_evidence | completed | failed
  ├── query or queries
  ├── SearchResult[]
  └── extraction outcomes

SearchResult
  ├── stable source ID
  ├── rank
  ├── title
  ├── URL and canonical URL
  ├── snippet
  └── extraction outcome and bounded content?
```

Flattening completed turns yields the ordered message sequence sent to a chat provider. A failed turn remains valid even when it has no assistant message; this is what lets the UI preserve the user's request and collected evidence without pretending an answer completed.

Sources should be stored separately from generated prose rather than embedded only inside provider response JSON. This keeps citation rendering, retries, exports, and provider changes tractable.

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

`LocalThreadStore` uses IndexedDB through `idb` from the first proof. `idb` is an implementation detail of this adapter and must not appear in application-core interfaces. Thread summary indexes and full normalized thread records are stored separately so listing topics does not deserialize extracted page content. Saving a turn and its updated thread summary occurs in one transaction. IndexedDB schema upgrades own persisted-data migration and must preserve exportability if an individual record cannot be migrated.

Initial database shape:

```ts
interface DorothyAnnDb extends DBSchema {
  threads: {
    key: string; // ThreadId
    value: StoredThreadEnvelope;
  };
  threadSummaries: {
    key: string; // ThreadId
    value: ThreadSummary;
    indexes: {
      "by-updated-at": string; // ISO timestamp
    };
  };
}

interface StoredThreadEnvelope {
  schemaVersion: number;
  thread: Thread;
}
```

`LocalThreadStore.save` opens a read-write transaction across `threads` and `threadSummaries` and commits both records together. Archive state remains explicit in normalized thread data; deletion removes both full and summary records in one transaction. Database-version upgrades run through `idb`'s `upgrade` callback; domain schema migration remains a separately testable pure function over `StoredThreadEnvelope`.

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

A platform that hosts both the frontend and the small proxy is likely simpler for this project. Vercel + Functions is the initial deployment target because it offers convenient frontend hosting, previews, serverless functions, and secret configuration. Cloudflare Pages + Workers remains a supported alternate target, not a structural dependency. The choice should follow deployment familiarity, secret management, logs, limits, and domain setup rather than loyalty to a platform.

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

The browser interaction decisions are settled. Remaining implementation-level choices are the concrete chat/search/extraction providers, the durable login-attempt limiter behind the initial Vercel adapter, and exact framework/package selection.

## Next

Define exact HTTP/SSE contracts around lookup, promotion, extraction, retry, and follow-up interactions, then align normalized domain types, implementation steps, and the Plan Ledger before selecting concrete providers.
