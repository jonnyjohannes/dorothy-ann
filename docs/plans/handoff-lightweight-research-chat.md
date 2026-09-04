# Handoff: Lightweight Research Chat

> Last updated: 2026-05-12 — by agent session
> Resume by: reading this file end-to-end, then refining the open product and architecture decisions.

## Goal

Build a small, self-deployed, mobile-friendly web client for temporary, source-aware conversations. It should support ordinary chat, optional web research, lightweight topic sessions, and clean Markdown export for durable storage or handoff to a desktop workflow.

The product is intentionally an ephemeral thinking surface—not a knowledge base, coding agent, or permanent memory system.

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

1. Search results that remain visible and inspectable.
2. Lightweight, topic-oriented conversations.
3. Markdown export as a first-class completion action.
4. User-controlled deployment and credentials.

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

### Markdown Export

Export is a primary workflow, not a miscellaneous settings action.

Support:

- download as `.md`;
- copy as Markdown;
- invoke the platform share action where available.

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

```text
responsive web client
        ↓ authenticated request
application backend
        ├── thread storage
        ├── server-side credentials
        ├── chat provider adapter
        ├── search provider adapter
        └── content extraction adapter
```

Credentials should be deployment secrets and remain server-side. The initial product is single-user; it should avoid building account management or browser-side credential storage.

The storage implementation may begin locally in the browser to validate the interaction, then move behind `ThreadStore` when cross-device continuity is needed.

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

- Coding-agent execution.
- Filesystem or shell access.
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

- [ ] **Validate the loop:** one chat adapter, one search adapter, streamed chat, explicit search, visible results, and transcript export.
- [ ] **Add lightweight persistence:** topic list, rename/archive/delete, normalized messages and sources.
- [ ] **Add cross-device continuity:** authenticated server-side `ThreadStore` and synchronized desktop/mobile access.
- [ ] **Improve handoff:** handoff export, preview/edit, context compaction, and usage visibility.
- [ ] **Test the abstractions:** add a second implementation behind the chat and search boundaries without changing domain storage or UI behavior.

## Open Questions for the Next Session

1. Should the first prototype persist threads in browser storage or require cross-device server persistence immediately?
2. Is `auto` research important enough for the MVP, or should search remain fully explicit?
3. Should source extraction be required for every researched turn or selectively triggered?
4. What is the smallest citation contract that remains reliable across chat implementations?
5. Should handoff export be a fixed template, user-configurable templates, or both?
6. How should failed or partial streamed responses appear and persist?
7. Is the initial deployment strictly personal, or should the architecture preserve a future multi-user boundary?

## Next

Start the new project by choosing the persistence boundary and sketching the mobile chat/search interaction. Then define normalized TypeScript domain types before selecting concrete infrastructure or external providers.
