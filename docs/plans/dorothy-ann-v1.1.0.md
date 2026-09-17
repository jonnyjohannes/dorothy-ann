# Dorothy Ann v1.1.0 — explicit architectural boxes

## Current State

- Status: planning
- Last updated: 2026-09-15
- Current focus: finalize `ThreadStore` revision/retention/import contracts and verify the new controller/transport event unions against every terminal turn variant
- Handoff lives in: [`## Handoff`](#handoff)
- Next action: define the exact atomic `ThreadStore.commitTerminalTurn` input/result plus local/remote idempotency, retention, list/delete, and import/export behavior

## Handoff

Dorothy Ann v1.0.0 behaves correctly and is the baseline for this architectural pass. The v1.1.0 goal is to refactor the application around named, technically explicit boxes without changing working product behavior accidentally. Each box is documented as typed inputs → one owned capability → typed outputs/events, plus invariants, failure contract, and implementation boundary.

Decisions made so far:

- Dorothy Ann is an information resolver and researcher. A request creates either a `SearchTurn` or `ResearchTurn`; these are turn contracts, not persistent application modes, and `chat` is not a third kind.
- The existing input macro remains explicit and deterministic: a submission ending in `?` creates a `ResearchTurn`; a macro-less submission creates a `SearchTurn`.
- A `SearchTurn` uses `SearchProvider` and returns normalized ranked sources without LLM synthesis.
- Every `ResearchTurn` follows one standard recursive protocol: the high-reasoning assessor returns `resolved`, `search`, or `decompose`; the resolver interprets the directive, joins child knowledge into parent state, reassesses, and synthesizes exactly one user-facing answer at the root. `resolved` is a recursive node directive; root research outcome uses `sufficient | best_effort | insufficient`.
- Decomposition expresses `all` versus `any` child semantics. Recursive children return supported `KnowledgeUnit` values, never user-facing answers.
- The convergence target is a useful fixed point where zero material evidence gaps remain. Resolution also stops safely on exhausted explicit budget/depth, no new knowledge, a duplicate/cyclic problem, interruption, or total provider unavailability.
- The approved balanced tuning remains explicit: three searches, nine consumed additional sources, recursion depth two, eight assessment calls, and three child problems per decomposition. Search and extraction concurrency are both capped at three; these distinct controls are intentionally not collapsed into one fuel value.
- `ResearchAssessor`, recursive `ResearchResolver`, and `EvidenceAcquirer` are explicit boxes. The assessor chooses semantic reductions but never answers the user; the resolver owns recursion and knowledge joining; acquisition owns bounded search, selection, and extraction but never assesses or synthesizes.
- An application-owned turn-local `GapLedger` assigns stable identity, validates support, records decomposition and progress, enforces legal transitions, and determines mechanical convergence.
- `joinKnowledge` is associative, commutative, and idempotent; it preserves contradictory supported observations as contested rather than overwriting them. v1.1 keeps flat support references while leaving recursive `Evidence | All | Any` proof expressions deferred.
- `LLMProvider` exposes separate assessment and synthesis capabilities. The Anthropic adapter routes assessment to a dedicated high-reasoning model and synthesis to a separately configurable balanced generation model.
- Initial and follow-up research questions use the same protocol. An empty initial context is assessed through the same interface rather than routed through a separate mandatory-search path.
- Budget exhaustion with useful supported evidence produces a bounded best-effort synthesis that identifies unresolved uncertainty; no useful supported evidence produces an insufficient-evidence failure.
- `Thread` and `Turn` remain the central data-model components. Durable `Turn` is a discriminated terminal `SearchTurn | ResearchTurn` union; pending/running execution exists only as controller-owned `ActiveTurn` state. Every observed terminal outcome is persisted, including failed, insufficient, and interrupted attempts.
- The persistence wrapper currently named `StoredThreadEnvelopeV2` is not a top-level architecture box. Its naming and exact storage contract remain open.
- The agreed visual regions are `PromptBox`, `TranscriptBox`, `EvidenceBox`, `BrandBox`, `StickyHeader`, `SettingsBox`, `ThreadsBox`, and `UnlockBox`. Boxes receive typed view state and emit intent; `WorkspaceController` coordinates routes/cross-box projection and delegates effects to owning controllers/capabilities.
- `Hotkeys` is an explicit layout-control box, not a visible region. It translates unhandled global keyboard events and current layout context into semantic intents without navigating, focusing DOM nodes, cancelling work, or invoking system capabilities directly.
- `ThreadsBox` has one canonical `/threads` route with aggressive `fzf@0.5.2`-backed filtering and keyboard behavior, not separate route and overlay presentations. The exact package version is pinned behind a pure `rankThreads` policy with fixture-locked ordering. Deletion uses an inline terminal-style confirmation, never `window.confirm`.
- `UnlockBox` is part of the shared box vocabulary so global visual-system changes include authentication. It owns only ephemeral passphrase entry and emits authentication intent without persisting or logging the passphrase.
- `TranscriptBox` renders durable history and the one active turn through one ordered presentation model. Live progress and streamed answer content occupy the active turn's position and are replaced, not duplicated, when that turn becomes durable.
- `EvidenceBox` renders one thread-wide append-stable `EvidenceSet`. Canonical sources are deduplicated, durable support uses `SourceId`, display citations use derived one-based ordinals, and role occurrences allow one source to be promoted from search destination to research evidence without duplication.
- `BrandBox` is one identity/control surface: activating anywhere on it emits only `new_thread_requested`. `StickyHeader` composes that brand with typed route-contextual actions and feedback but performs no navigation, export, clipboard, or cancellation effects itself.
- `SettingsBox` applies each visual preference immediately through emitted intent, has no Save/Cancel transaction, and reports persistence independently. The settings controller applies document state and persists through a browser preference adapter; failed persistence leaves the choice active for the session and visibly unsaved. Existing backup/import remains a compact secondary recovery utility with an inline validated preview and explicit keep/replace conflict policy; it never uses `window.confirm`.
- `UnlockBox` is a buttonless auth-entry region. It owns only an ephemeral masked draft, emits one passphrase submission at a time, and clears/refocuses after rejection while the authentication controller owns validation, network calls, safe return navigation, and bounded public auth state.
- `SystemStatusBox` is a narrowly scoped visible box for blocking application-boundary checking or unavailability (auth session, provider status, or thread storage). It emits retry intent but never absorbs turn, thread-row, settings, import, or ordinary route failures.
- Active turns are controller-only and never persisted; every observed terminal completed, insufficient, failed, or interrupted result becomes an immutable durable turn. Retry creates a new linked turn through `retryOfTurnId` rather than mutating terminal history.
- A successfully executed zero-result search is a completed `SearchTurn` with `completion: "empty"`, while `completion: "results"` requires a non-empty destination-reference tuple; canonical source metadata is stored once on `Thread`, and failure/interruption carry neither result nor partial destinations.
- Failed/interrupted research records never use an ambiguous optional resolution. They explicitly persist a validated full resolution, bounded checkpoint, or `unavailable` marker according to what the controller actually received; no state is fabricated.
- `Thread` is the durable context/aggregate root, not a runtime god object. It materializes canonical source metadata once in an append-stable source catalog; terminal turns retain rank/role/support references, and `EvidenceSet`/`ThreadContext` are deterministic bounded projections. Active execution remains controller-owned.
- Fair source allocation derives a three-selection ownership cap per evidence request from the approved nine-source/three-search ceilings. Concurrent requests receive rank-layer round-robin opportunities in priority/depth/creation order; shared canonical sources consume global budget once, and unused capacity is not released into earlier requests.
- Controller ownership is split explicitly: `WorkspaceController` owns route/cross-box projection and command delegation; browser `TurnController` owns one `ActiveTurn`, stale-event rejection, terminal construction, and atomic commit; `TurnGateway` adapts the client stream; server `TurnExecutor` dispatches provider-neutral search/research; `TurnStreamBoundary` owns only authenticated HTTP/SSE validation, heartbeat, serialization, and cancellation wiring.
- Durable/public research failures use compact capability-level codes only. Provider and implementation details remain in sanitized server observability, never turn records, SSE payloads, or client messages.
- The completed refactor must leave `README.md` and `AGENTS.md` describing the then-current architecture, not an aspirational target. This plan owns the current → target mapping while work is underway.

Read this plan, then the completed [`dorothy-ann-v1.0.0.md`](./dorothy-ann-v1.0.0.md), `src/domain/types.ts`, `src/domain/schemas.ts`, `src/ports/`, `server/research.ts`, `server/app.ts`, and `src/ui/App.tsx` before implementation. Continue design in this file; do not begin implementation until the remaining box contracts and migration plan are approved.

## Summary

Dorothy Ann is an information resolver and researcher. v1.1.0 will represent each request as a `SearchTurn` or `ResearchTurn`, not an application mode: search directly retrieves ranked sources, while research recursively reduces a problem into supported knowledge within explicit balanced limits and synthesizes exactly one user-facing answer. The refactor will make the data model, orchestration, provider boundaries, and layout components legible to both humans and implementation agents.

## Problem Statement

The application works, but important capabilities are currently distributed across UI components, HTTP routes, provider adapters, and `server/research.ts`. Some product concepts are also represented ambiguously: lookup is encoded as a chat-shaped turn, chat is named as a mode despite research being the conversational capability, and the research planner and generated-search orchestration are visible mainly by reading implementation prompts.

This makes meaningful discussion and safe refactoring harder than necessary. We need boxes large enough to represent complete capabilities, small enough to have one responsibility, and precise enough that their implementations may change without changing their observable contracts.

## Goals

- Canonize `SearchTurn` and `ResearchTurn` as the only request/response turn contracts, selected by the existing `?` input macro rather than persistent application mode.
- Define each architectural box using typed inputs, one owned capability, typed outputs/events, invariants, a failure contract, and an implementation boundary.
- Standardize initial and follow-up research questions on one recursive `resolved | search | decompose` protocol.
- Recursively transform unresolved problems into supported knowledge, join child knowledge deterministically, and converge toward zero material evidence gaps.
- Stop safely on sufficiency, exhausted explicit budget/depth, no new knowledge, cycles, interruption, or unavailability.
- Retain explicit balanced per-turn ceilings: three searches, nine consumed additional sources, recursion depth two, eight assessments, and three child problems per decomposition.
- Separate research assessment, recursive knowledge resolution, evidence acquisition, knowledge joining, and final synthesis responsibilities.
- Make `Thread` and `Turn` model valid states directly rather than through loosely related optional fields.
- Preserve provider-neutral domain and application contracts, with Brave and Anthropic remaining concrete adapters.
- Record the current → target implementation mapping while refactoring.
- Finish with `README.md` and `AGENTS.md` accurately describing the implemented architecture and its working constraints.

## Non-Goals

- Unbounded recursive or autonomous research loops, or replacing explicit limits with one undifferentiated fuel value.
- Recursive user-facing research turns that synthesize intermediate child answers; recursion produces supported internal knowledge units and one final root synthesis.
- Exposing hidden chain-of-thought or provider payloads.
- Replacing Brave or Anthropic as part of the architecture refactor.
- Changing authentication, retention duration, deployment target, or export behavior unless a settled box contract makes a minimal migration necessary.
- Prescribing internal implementation details that do not affect a box contract.
- Adding speculative abstraction layers unrelated to the named boxes.

## Architectural Method

Every named box uses this form:

```text
typed inputs
    |
    v
[ box owns one capability ]
    |
    v
typed outputs / events
```

Each definition must also state:

- **invariants** — what must always remain true;
- **failure contract** — how bounded failure leaves the box;
- **implementation boundary** — what an implementation may change freely while preserving the contract;
- **current mapping** — where the responsibility exists before refactoring;
- **target mapping** — where the responsibility will live after refactoring.

The plan carries current → target mappings during implementation. After the refactor, `README.md` and `AGENTS.md` describe only the implemented current state.

## Canonical Vocabulary

### Search turn

Find and display relevant sources. A macro-less submission creates a `SearchTurn`, which uses `SearchProvider`, does not invoke an LLM, does not extract pages, and does not synthesize an answer.

### Research turn

Recursively resolve the current question using its conversation, available evidence, and explicit limits. A submission ending in the `?` macro creates a `ResearchTurn`, which uses `LLMProvider` for semantic reduction and final synthesis and conditionally uses `SearchProvider` and `ContentExtractor` to acquire missing evidence.

### Thread context

`Thread` owns the durable conversation; conversation is not a separate data-model component or mode. It is the durable context/aggregate root, while research receives a deterministic bounded `ThreadContext` projection so orchestration does not depend on persistence metadata or mutate the aggregate.

```ts
type ThreadContextTurn =
  | {
      turnId: TurnId;
      kind: "research";
      request: string;
      outcome: "sufficient" | "best_effort";
      answer: AssistantContent;
    }
  | {
      turnId: TurnId;
      kind: "search";
      request: string;
      outcome: "search";
    }
  | {
      turnId: TurnId;
      kind: "research";
      request: string;
      outcome: "insufficient";
    }
  | {
      turnId: TurnId;
      kind: TurnKind;
      request: string;
      outcome: "failed" | "interrupted";
    };

interface ThreadContext {
  threadId: ThreadId;
  turns: ThreadContextTurn[];
  knownSources: CanonicalSource[];
  availableEvidence: EvidencePack[];
}
```

The projection may include terminal requests for conversational continuity, but includes assistant answers only from completed research and factual evidence only from validated research resolutions/checkpoints. Failure messages, provider details, and unsupported partial output never become research context. Existing source destinations may be known without being treated as extracted research evidence.

A follow-up question is another research turn supplied with this bounded view.

## Data Model Components

### `Thread`

**Meaning:** one durable topic containing an ordered conversation and its search/research activity.

```ts
interface Thread {
  schemaVersion: 3;
  id: ThreadId;
  title: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  modelRef: string;
  searchRef: string;
  sources: ThreadSourceRecord[];
  turns: Turn[];
}
```

```text
thread identity + canonical source catalog + ordered terminal turns
                    |
                    v
                [ Thread ]
                    |
                    v
        durable topic/conversation state
```

**Invariants**

- Turns are chronologically ordered, and canonical sources are stored once in append-stable ordinal order.
- A durable thread contains only terminal turns plus their canonical source catalog; active turns/evidence deltas are never serialized before terminal commit.
- `updatedAt` reflects the latest meaningful activity.
- Serialized thread data is provider-neutral.
- Source references used by an answer resolve by stable `SourceId` through the canonical `EvidenceSet` reconstructed from thread activity.
- Schema changes are versioned and migration-safe.
- A thread is the unit of storage, retention, selection, import, and export.

**Open modeling point:** decide whether `modelRef` and `searchRef` are thread-level provenance or execution metadata that belongs on individual turns.

### `Turn`

**Meaning:** one user request and its terminal search or research result inside a thread.

Current shape:

```ts
interface Turn {
  id: TurnId;
  mode: "chat" | "research";
  status: "pending" | "running" | "completed" | "failed" | "interrupted";
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  userMessage: UserMessage;
  assistantMessage?: AssistantMessage;
  lookupResults?: SearchResult[];
  researchRun?: ResearchRun;
  failure?: TurnFailure;
}
```

Target lifecycle:

```ts
type Turn = SearchTurn | ResearchTurn;
type TurnKind = "search" | "research";

interface ActiveTurnBase<K extends TurnKind> {
  id: TurnId;
  executionId: ExecutionId;
  kind: K;
  retryOfTurnId?: TurnId;
  createdAt: IsoTimestamp;
  userMessage: UserMessage;
  lastEventSequence: number;
  evidenceDelta: {
    sources: CanonicalSource[];
    occurrences: SourceDeltaOccurrence[];
  };
}

type ActiveSearchTurn = ActiveTurnBase<"search"> & {
  phase: "starting" | "searching" | "cancelling" | "awaiting_terminal";
};

type ActiveResearchTurn = ActiveTurnBase<"research"> & {
  phase:
    | "starting"
    | "assessing"
    | "decomposing"
    | "searching"
    | "extracting"
    | "resolving"
    | "synthesizing"
    | "cancelling"
    | "awaiting_terminal";
  answerDraft: string;
  latestResearchState?:
    | { kind: "checkpoint"; checkpoint: ResearchCheckpoint }
    | { kind: "resolution"; resolution: ResearchResolution };
};

type ActiveTurn = ActiveSearchTurn | ActiveResearchTurn;

interface TerminalTurnBase<K extends TurnKind> {
  id: TurnId;
  kind: K;
  retryOfTurnId?: TurnId;
  createdAt: IsoTimestamp;
  finishedAt: IsoTimestamp;
  userMessage: UserMessage;
}
```

`ActiveTurn` is mutable controller state projected from request execution and lifecycle events; it is never part of a persisted `Thread`. `Turn` is immutable terminal history. Every terminal outcome observed by the controller is committed: completed search/research, insufficient evidence, bounded failure, and interruption. A failed or interrupted first request therefore creates a durable thread and appears in `ThreadsBox`; seven-day retention and explicit deletion bound that history.

```text
controller-owned ActiveTurn
           |
           +-- success -------> terminal completed Turn
           +-- insufficient --> terminal failed Turn
           +-- failure -------> terminal failed Turn
           `-- interruption --> terminal interrupted Turn
                                      |
                                      v
                                ThreadStore commit
```

Retry creates a new active turn and, if terminal, a new immutable turn with `retryOfTurnId` referencing the earlier same-thread terminal attempt. It never reopens or overwrites the original turn. The retried raw request must match the referenced turn; a materially edited request is a normal new turn. Abrupt process loss before a terminal event may lose controller-only active state, but it cannot leave a durable phantom `running` turn.

The terminal search union is settled:

```ts
interface SearchDestinationRef {
  sourceId: SourceId;
  rank: number;
}

type SearchTurnResult =
  | {
      completion: "results";
      destinations: [SearchDestinationRef, ...SearchDestinationRef[]];
    }
  | {
      completion: "empty";
      destinations: [];
    };

type SearchTurnFailure =
  | {
      code: "provider_unavailable" | "invalid_response" | "search_failed";
      message: string;
      retryable: boolean;
    }
  | {
      code: "rate_limited";
      message: string;
      retryable: true;
      retryAfterSeconds?: number;
    };

interface TurnInterruption {
  reason: "user_cancelled" | "navigation" | "connection_lost";
  message: string;
}

type SearchTurn =
  | (TerminalTurnBase<"search"> & {
      status: "completed";
      result: SearchTurnResult;
    })
  | (TerminalTurnBase<"search"> & {
      status: "failed";
      failure: SearchTurnFailure;
    })
  | (TerminalTurnBase<"search"> & {
      status: "interrupted";
      interruption: TurnInterruption;
    });
```

A successfully executed search with no destinations is a completed `empty` result, not a failure. The non-empty tuple makes `completion: "results"` truthful. Search metadata is admitted once to the thread source catalog, while the terminal turn retains only query-relative destination references. Failed and interrupted variants cannot carry partial destinations; `SearchProvider.search` is one atomic provider-neutral operation.

The turn kind is selected per submission: trailing `?` creates research; otherwise the submission creates search. It is not durable global UI mode.

```text
current request + prior thread context + macro-selected turn kind
                         |
                         v
                      [ Turn ]
                         |
                         v
       search result or researched answer + provenance
```

**Invariants**

- Exactly one user request belongs to a turn.
- At most one assistant answer is committed.
- A durable turn represents exactly one terminal state: completed, failed, or interrupted; pending/running are `ActiveTurn` concerns.
- Terminal turns are immutable after commit. Stale stream events and retries cannot overwrite a terminal or newer turn.
- `retryOfTurnId`, when present, resolves to an earlier terminal turn in the same thread with the same raw request.
- Provider-specific payloads are never persisted.
- Citations reference only sources supplied to synthesis.
- Every terminal durable turn passes runtime schema validation.
- The discriminant determines which result fields are valid; search and research result shapes are not mixed through unrelated optional fields.

The persistence/lifecycle axis and complete terminal `SearchTurn | ResearchTurn` unions are settled, including compact capability-level research failure codes and fixed retryability. Transport events must map into these durable shapes without widening them.

### Persistence record

The current storage-only wrapper is:

```ts
interface StoredThreadEnvelopeV2 {
  schemaVersion: 2;
  thread: Thread;
  lastMeaningfulActivityAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
}
```

It exists to keep storage versioning and retention metadata outside product-level `Thread` data. It is not a top-level architecture box and should remain behind `ThreadStore`. Whether to retain this shape and whether to rename it (for example, `StoredThreadRecord`) remain open decisions.

### `SearchResult`

Normalized provider-neutral discovery result:

```ts
interface CanonicalSource {
  sourceId: SourceId;
  title: string;
  url: string;
  canonicalUrl: string;
  displayUrl: string;
  snippet?: string;
  publishedAt?: IsoTimestamp;
}

interface SearchResult extends CanonicalSource {
  rank: number;
}
```

`SourceId` is an application-derived stable identity for the canonical source, not provider rank or result-array position. The same canonical URL normalized from different searches must receive the same collision-safe ID before evidence, citations, or support references are admitted. Provider-local IDs may be retained only as adapter metadata and never become durable source identity.

Provider/search `SearchResult` is transient because `rank` belongs to one query. Durable `Thread` separates canonical source metadata from contextual references:

```ts
interface ThreadSourceRecord extends CanonicalSource {
  ordinal: number;
}
```

The application admits a normalized source record at most once per thread. First deterministic admission fixes its positive contiguous ordinal and normalized presentation metadata; later encounters reuse that record and add per-turn references rather than rewriting it. Terminal source admission and its referencing turn commit atomically, so no durable dangling turn reference or orphan catalog entry is created.

### Evidence model

The current implementation embeds a complete normalized `SearchResult` beside each `ExtractedPage`. The target stores canonical source metadata once on `Thread`; bounded query/time-specific extracted content remains with the research resolution/checkpoint that admitted it:

```ts
interface ContextEvidence {
  sourceId: SourceId;
  page: Omit<ExtractedPage, "sourceId" | "canonicalUrl" | "title">;
}

interface EvidencePack {
  query: string;
  sources: ContextEvidence[];
  createdAt: IsoTimestamp;
}
```

The target exposes one thread-wide deduplicated `EvidenceSet`. Durable citations and support references use `SourceId`, never a mutable array index; the UI derives stable one-based ordinals for display. Each source retains turn/role occurrences so deduplication does not erase provider rank or provenance, and a search destination may be promoted to research evidence without creating another source entry.

```ts
type EvidenceRole = "search_destination" | "research_evidence";

interface EvidenceOccurrence {
  turnId: TurnId;
  role: EvidenceRole;
  rank?: number;
}

interface EvidenceSetEntry {
  sourceId: SourceId;
  ordinal: number;
  source: Omit<CanonicalSource, "sourceId">;
  occurrences: EvidenceOccurrence[];
}

interface EvidenceSet {
  entries: EvidenceSetEntry[];
}
```

`EvidenceSet` is an append-stable ordered projection over a mathematical set: one entry exists per canonical source identity, while deterministic first admission supplies its display ordinal. Durable turn order, evidence-request priority, provider rank, and canonical identity—not concurrent completion order—determine admission order. A reused source retains its existing `SourceId` and ordinal. New role/turn occurrences are joined and deduplicated rather than replacing prior provenance.

Only destinations actually returned by a completed `SearchTurn` receive `search_destination`; unselected research candidates do not enter the set. A research source receives `research_evidence` only when viable extracted content is admitted to research knowledge. Failed extraction does not promote a source.

Ownership is settled: `Thread.sources` materializes canonical metadata/ordinals once; terminal search destination refs and research resolution/checkpoint support retain per-turn context; bounded extracted `EvidencePack` snapshots remain inside the terminal research state that admitted them. `EvidenceSet` is not separately persisted—it is deterministically projected from this aggregate. `WorkspaceController` joins the `TurnController`'s ephemeral active evidence delta for live presentation, then terminal source admission and turn commit occur atomically.

## System Components

### `SearchProvider`

**Capability:** discover normalized ranked web sources for one query.

```text
query + search options
         |
         v
 [ SearchProvider ]
         |
         v
   SearchResult[]
```

```ts
interface SearchProvider {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}

interface SearchOptions {
  maxResults: number;
  locale?: string;
  safeSearch?: "off" | "moderate" | "strict";
}
```

**Invariants**

- Output is provider-neutral and bounded.
- URLs are valid and canonicalized.
- Duplicate canonical URLs are removed.
- Credentials and raw provider payloads do not escape the adapter.
- Provider failures become bounded application failures.

**Implementation boundary:** Brave is the current concrete adapter. Its request and normalization internals may change without changing this contract.

**Current mapping:** `src/ports/providers.ts`, `server/brave.ts`.

### `LLMProvider`

**Capability:** perform typed LLM tasks without exposing a vendor API to orchestration.

```text
task purpose + policy + conversation + current content + optional evidence
                                  |
                                  v
                           [ LLMProvider ]
                                  |
                                  v
             streamed assistant content or typed assessment
```

The current code names this port `ChatProvider`; the target architectural name is `LLMProvider`. One provider port exposes separate capability methods so application code chooses a task, while only the concrete adapter chooses a provider model.

```ts
interface LLMProvider {
  assessResearch(input: ResearchAssessmentInput): Promise<ResearchAssessment>;
  synthesizeResearch(input: ResearchSynthesisInput): AsyncIterable<AssistantContentPart>;
}
```

```text
ResearchAssessor ── assessResearch() ──> high-reasoning model route
AnswerSynthesizer ─ synthesizeResearch() -> balanced generation model route
```

Assessment uses compact validated non-streaming structured output capped at 800 tokens. Synthesis uses bounded streamed output capped at 4,096 tokens. Both routes remain provider-neutral to their callers.

The Anthropic adapter maps these capabilities through separately configurable model IDs:

```text
ANTHROPIC_ASSESSMENT_MODEL
ANTHROPIC_SYNTHESIS_MODEL
```

During migration, either setting may fall back to the existing `ANTHROPIC_MODEL`; final legacy-setting retention remains an implementation-plan decision. Different models by recursion depth are intentionally deferred because inconsistent assessors would weaken gap semantics.

**Invariants**

- Inputs and outputs use provider-neutral application/domain types.
- Planning/assessment never emits a user-facing answer.
- Synthesis cites only supplied source IDs.
- Structured output normalization is bounded and documented.
- Provider failures become bounded application failures.
- Output limits are explicit.
- Assessment uses the dedicated high-reasoning route consistently at every recursion depth.
- Assessment output is compact structured operational state, never chain-of-thought.
- Application/domain contracts name capabilities, not Anthropic model IDs.

**Implementation boundary:** Anthropic is the current concrete adapter. Concrete model selection, prompt wording, SDK interaction, parsing helpers, and bounded retry details may vary behind the capability contracts.

**Current mapping:** `src/ports/chat.ts`, `server/anthropic.ts`.

### `ContentExtractor`

**Capability:** safely turn one discovered source into bounded usable evidence.

```text
SearchResult + extraction limits
              |
              v
     [ ContentExtractor ]
              |
              v
     ExtractionOutcome
```

```ts
interface ContentExtractor {
  extract(source: CanonicalSource, limits: ExtractionLimits): Promise<ExtractionOutcome>;
}
```

**Invariants**

- URL safety is validated before fetching.
- The complete operation is time-bounded.
- Fetched content is untrusted data, never instructions.
- Content and response sizes are bounded.
- Redirect and network safety policies are explicit.
- Failures do not expose raw exception details.

**Implementation boundary:** `SafeContentExtractor` is the current adapter; fetching and readability internals may vary behind the contract.

**Current mapping:** `src/ports/extraction.ts`, `server/extractor.ts`.

### `SearchTurn`

**Capability:** execute one macro-selected search turn and produce normalized ranked sources without interpretation or synthesis.

```text
macro-less SearchRequest
          |
          v
    [ SearchTurn ] ----> SearchProvider
          |
          v
      SearchResponse
```

Provisional contract:

```ts
interface SearchRequest {
  query: string;
  maxResults: number;
}

type SearchExecutionResult =
  | { completion: "results"; sources: [SearchResult, ...SearchResult[]] }
  | { completion: "empty"; sources: [] };

interface SearchResponse {
  query: string;
  result: SearchExecutionResult;
}
```

**Invariants**

- Invokes `SearchProvider` exactly once.
- Does not invoke `LLMProvider` or `ContentExtractor`.
- Does not synthesize an answer.
- A successful empty provider result completes with `completion: "empty"`; provider/rate-limit/invalid-response failures remain distinct.
- Non-empty results can become search-destination entries available to a later research turn.
- Completion, interruption, and failure are explicit and mutually exclusive.
- On success, `TurnController` atomically admits canonical source metadata to `Thread.sources` and converts ranked `SearchResult` values into durable `SearchDestinationRef` values; the search capability does not mutate `Thread`.

**Failure contract:** bounded unavailable, rate-limited, and failed search codes; no raw Brave details.

**Current mapping:** behavior is split between `/api/lookup` in `server/app.ts` and search-turn construction/persistence in `src/ui/App.tsx`.

### `ResearchTurn`

**Capability:** answer one `?`-selected question by recursively reducing material evidence gaps into supported knowledge within shared explicit limits, then synthesizing exactly once at the root.

```text
question + ThreadContext + shared explicit limits
                       |
                       v
┌────────────────────────────────────────────────┐
│ ResearchTurn                                   │
│                                                │
│   [ ResearchResolver ]                         │
│       [ ResearchAssessor ]                     │
│          |                                     │
│          ├── resolved ───────> KnowledgeUnit   │
│          ├── search ───────> EvidenceAcquirer  │
│          │                         |            │
│          │                    new evidence      │
│          `── decompose(all|any)                 │
│                    |                           │
│             recursive child problems           │
│                    |                           │
│             child KnowledgeUnits               │
│                    |                           │
│             join + reassess root               │
│                                                │
│   [ AnswerSynthesizer ] exactly once           │
└────────────────────────────────────────────────┘
                       |
                       v
          answer + supported knowledge + events
```

Input:

```ts
interface ResearchTurnInput {
  question: string;
  context: ThreadContext;
  limits: ResearchLimits;
}

interface ResearchLimits {
  maxSearches: 3;
  maxConsumedSources: 9;
  maxRecursionDepth: 2;
  maxAssessmentCalls: 8;
  maxChildProblemsPerDecomposition: 3;
  maxCandidatesPerSearch: 5;
  maxConcurrentSearches: 3;
  maxConcurrentExtractions: 3;
  extractionTimeoutMs: 8_000;
  maxExtractedCharsPerPage: 20_000;
  maxEvidenceCharsPerSource: 4_000;
  maxEvidenceCharsTotal: 48_000;
  maxThreadContextTurns: 8;
  maxThreadContextChars: 24_000;
  maxAssessmentOutputTokens: 800;
  maxOutputTokens: 4_096;
}
```

These balanced values are approved defaults and hard per-turn ceilings, not targets. Eight assessments permit the common complete path of root decomposition, three independently searched/reassessed children, and final root reassessment without batching semantically distinct problems into one assessor call. All recursive branches draw from the same explicit search, source, assessment, decomposition-branching, and depth limits. The separate controls are intentional: they independently constrain provider calls, evidence volume, semantic reductions, branching, and recursion shape rather than hiding those costs behind one fuel number. The nine-source limit applies across the whole resolution tree, not independently to each search or node. Fair allocation derives `floor(maxConsumedSources / maxSearches) = 3` as the per-evidence-request new-source selection ownership cap; it is policy derived from approved limits, not another configurable fuel value. `SearchTurn` retains its separate visible-result limit.

Output:

```ts
type ResearchTurnResult =
  | {
      completion: "sufficient";
      answer: AssistantContent;
      resolution: SufficientResearchResolution;
      usage?: UsageMetadata;
    }
  | {
      completion: "best_effort";
      answer: AssistantContent;
      resolution: BestEffortResearchResolution;
      usage?: UsageMetadata;
    };

type CompletedResearchTurn = TerminalTurnBase<"research"> & {
  status: "completed";
  result: ResearchTurnResult;
};
```

This is the completed form only. `resolved` is reserved for the recursive assessor directive: it says one current problem can return supported knowledge without another reduction. `sufficient` is the root research outcome: after joined child knowledge and root reassessment, zero material gaps remain for the user's question. Several child problems may be `resolved` while the root remains `best_effort` or `insufficient`.

Failed and interrupted variants preserve only validated state actually available to the controller:

```ts
interface ResearchCheckpoint {
  reason: "interrupted" | "execution_failure";
  knowledge: KnowledgeUnit;
  ledger: GapLedger;
  tasks: ResearchTaskRecord[];
}

type IncompleteResearchState =
  | { kind: "checkpoint"; checkpoint: ResearchCheckpoint }
  | { kind: "unavailable" };

interface InsufficientEvidenceFailure {
  kind: "insufficient_evidence";
  message: string;
  retryable: true;
}

type SynthesisFailure =
  | {
      kind: "synthesis_failure";
      code: "unavailable" | "invalid_output";
      message: string;
      retryable: true;
    }
  | {
      kind: "synthesis_failure";
      code: "rate_limited";
      message: string;
      retryable: true;
      retryAfterSeconds?: number;
    }
  | {
      kind: "synthesis_failure";
      code: "refused";
      message: string;
      retryable: false;
    };

type ResearchExecutionFailure =
  | {
      kind: "execution_failure";
      stage: "assessment";
      code: "assessment_failed";
      message: string;
      retryable: true;
    }
  | {
      kind: "execution_failure";
      stage: "acquisition";
      code: "acquisition_failed";
      message: string;
      retryable: true;
    }
  | {
      kind: "execution_failure";
      stage: "resolution";
      code: "resolution_invalid";
      message: string;
      retryable: false;
    }
  | {
      kind: "execution_failure";
      stage: "transport";
      code: "transport_failed";
      message: string;
      retryable: true;
    };

type FailedResearchTurn =
  | (TerminalTurnBase<"research"> & {
      status: "failed";
      failure: InsufficientEvidenceFailure;
      researchState: {
        kind: "resolution";
        resolution: InsufficientResearchResolution;
      };
    })
  | (TerminalTurnBase<"research"> & {
      status: "failed";
      failure: SynthesisFailure;
      researchState: {
        kind: "resolution";
        resolution:
          | SufficientResearchResolution
          | BestEffortResearchResolution;
      };
    })
  | (TerminalTurnBase<"research"> & {
      status: "failed";
      failure: ResearchExecutionFailure;
      researchState: IncompleteResearchState;
    });

type InterruptedResearchState =
  | {
      kind: "resolution";
      resolution:
        | SufficientResearchResolution
        | BestEffortResearchResolution;
    }
  | IncompleteResearchState;

type InterruptedResearchTurn = TerminalTurnBase<"research"> & {
  status: "interrupted";
  interruption: TurnInterruption;
  researchState: InterruptedResearchState;
};

type ResearchTurn =
  | CompletedResearchTurn
  | FailedResearchTurn
  | InterruptedResearchTurn;
```

An insufficient failure always carries an `InsufficientResearchResolution`. A synthesis failure always carries the synthesis-eligible sufficient/best-effort resolution that existed before answer generation failed. Earlier execution failures carry a validated checkpoint or explicitly `unavailable`; they never fabricate an empty resolution. Interruption may retain a full resolution when cancellation occurs during synthesis, a checkpoint during recursive work, or `unavailable` when no validated state reached the controller. None of these non-completed variants carries an answer.

Expected bounded assessor/search/extraction unavailability is interpreted through normal resolution: supported useful knowledge yields completed `best_effort`, while no useful support yields failed `insufficient`. `ResearchExecutionFailure` is reserved for the exceptional case where assessment, acquisition, resolution, or transport cannot produce that normal bounded outcome. Public/durable codes remain capability-level; provider status, SDK errors, malformed payload details, stack traces, and retry internals may appear only in sanitized server observability.

**Invariants**

- Every initial and follow-up research question uses this same protocol.
- `Thread` owns conversation; bounded `ThreadContext` and evidence are explicit inputs.
- Resolution recursively joins supported child knowledge and converges toward zero material evidence gaps required by the current question.
- A `resolved` assessor directive conducts no additional search; root `sufficient` is evaluated only after joined knowledge satisfies the root success criterion.
- Recursive branches share one turn-level set of explicit limits and cannot multiply the approved ceilings.
- No research turn invokes more than three searches, consumes more than nine additional sources, descends beyond depth two, performs more than eight assessments, or emits more than three child problems from one decomposition.
- A turn requests at most five candidates per search and selects at most nine aggregate sources for consumption.
- Synthesis happens exactly once at the root after resolution stops and the final knowledge unit is known.
- Useful supported evidence at a bounded stop produces a best-effort answer with explicit uncertainty; no useful supported evidence produces an insufficient-evidence failure.
- Lifecycle progress, resolution stop reason, and terminal state are observable.
- Failed/interrupted persistence explicitly distinguishes full resolution, bounded checkpoint, and unavailable state; no optional field implies knowledge the controller did not receive.
- Durable failure codes are compact capability-level discriminants with fixed retryability; provider/SDK details never cross the public boundary.
- Partial sibling failures preserve successful evidence.

**Current mapping:** `server/research.ts` currently performs a mandatory initial search/extraction before planning and may then conduct up to three generated searches in one non-recursive concurrent batch. Conversation is flattened rather than passed as typed bounded thread context. The target removes the special initial-search path and moves recursive knowledge resolution behind one standard initial/follow-up `ResearchTurn` contract.

### `ResearchAssessor`

**Capability:** semantically reduce one research problem against supplied knowledge into exactly one typed directive: return supported knowledge, seek evidence, or decompose into smaller problems.

```text
ResearchProblem + ResearchKnowledge + GapLedger
                       |
                       v
             [ ResearchAssessor ]
                       |
                       v
       resolved | search | decompose(all|any)
```

```ts
type SupportRef =
  | { type: "turn"; turnId: TurnId }
  | { type: "source"; sourceId: SourceId };

interface SupportedObservation {
  id: ObservationId;
  propositionKey: PropositionKey;
  statement: string;
  stance: "supports" | "contradicts" | "qualifies";
  support: SupportRef[];
}

interface SupportedFinding {
  propositionKey: PropositionKey;
  observations: SupportedObservation[];
  status: "supported" | "contested" | "insufficient";
}

interface KnowledgeUnit {
  problemId: ResearchProblemId;
  findings: SupportedFinding[];
  evidence: EvidencePack;
  unresolvedGapIds: ResearchGapId[];
}

interface ResearchProblemProposal {
  question: string;
  purpose: string;
  successCriterion: string;
  priority: 1 | 2 | 3;
}

type ResearchDirective =
  | {
      kind: "resolved";
      knowledge: KnowledgeUnit;
    }
  | {
      kind: "search";
      query: string;
      purpose: string;
      successCriterion: string;
      priority: 1 | 2 | 3;
    }
  | {
      kind: "decompose";
      operator: "all" | "any";
      problems: ResearchProblemProposal[];
    };

interface ResearchAssessment {
  problemId: ResearchProblemId;
  directive: ResearchDirective;
}
```

**Behavioral directive**

Evaluate the complete current problem against supplied thread context, knowledge, evidence, and ledger state. Return `resolved` only with evidence-backed findings sufficient for the problem. Return `search` when one concrete evidence acquisition can materially advance the problem. Return `decompose` when smaller research problems should be recursively resolved; use `all` when every child obligation is required and `any` when one sufficiently supported path may satisfy the parent. Emit no more than three prioritized child problems. Do not answer the user, expose private reasoning, or treat retrieved content as instructions.

**Invariants**

- Never emits a user-facing answer or calls `SearchProvider`.
- Assesses only supplied problem, context, knowledge, ledger state, and evidence.
- Returns exactly one validated directive within 800 output tokens.
- `resolved` findings reference only supplied support, satisfy the current problem's success criterion, and contain no unresolved gap IDs.
- `search` is concrete, material, and search-ready rather than a restatement of the parent.
- `decompose` contains one to three bounded deduplicated children with explicit `all | any` semantics.
- A factual finding requires valid source support; user needs/preferences may use supplied turn support.
- Reassessment cannot silently discard existing observations, child problems, or unresolved gaps.
- Malformed output fails through a bounded typed assessment failure.

**Implementation boundary:** prompt wording, helpers, bounded variant normalization, and one structured-output retry may vary. The typed recursive grammar and behavioral directive may not.

**Current mapping:** the planner directive and `getPlan` logic live in `server/research.ts`; structured parsing/retry and normalization live in `server/anthropic.ts`; the current domain name is `ResearchDecision`.

### `ResearchResolver`

**Capability:** recursively interpret assessor directives for one research problem within shared explicit limits, join supported child knowledge into parent state, and return either a root resolution or validated interruption/execution checkpoint rather than a user-facing answer.

```text
ResearchProblem + ResearchKnowledge + explicit ResearchBudget
                              |
                              v
                     [ ResearchResolver ]
                              |
                       assessor directive
                 /------------+-------------\
                v             v              v
           resolved         search       decompose
                |             |           all | any
                |       search/extract       |
                |             |        recursive children
                |             |              |
                +-------------+--------------+
                              |
                    join supported knowledge
                              |
                       reassess parent
                              |
                              v
          ResearchResolution | ResearchCheckpoint
```

```ts
interface ResearchProblem {
  id: ResearchProblemId;
  parentId?: ResearchProblemId;
  question: string;
  purpose: string;
  successCriterion: string;
  context: ThreadContext;
  depth: number;
}

interface ResearchBudget {
  searchesRemaining: number;
  sourcesRemaining: number;
  assessmentsRemaining: number;
  depthRemaining: number;
}

interface ResearchGap {
  id: ResearchGapId;
  problem: ResearchProblem;
  operatorFromParent?: "all" | "any";
  status: "open" | "decomposed" | "resolved" | "blocked";
  support: SupportRef[];
  fingerprint: string;
  createdOrder: number;
}

interface GapLedger {
  gaps: ResearchGap[];
  assessmentsUsed: number;
  searchesUsed: number;
  sourcesConsumed: number;
}

interface ResearchKnowledge {
  findings: SupportedFinding[];
  evidence: EvidencePack;
}

type ResolutionStopReason =
  | "sufficient"
  | "search_budget_exhausted"
  | "source_budget_exhausted"
  | "assessment_budget_exhausted"
  | "depth_limit_reached"
  | "no_new_knowledge"
  | "duplicate_problem"
  | "provider_unavailable";

interface ResearchEvidenceRef {
  sourceId: SourceId;
  rank: number;
}

interface ResearchTaskRecord {
  problemId: ResearchProblemId;
  query: string;
  purpose: string;
  priority: 1 | 2 | 3;
  status: "completed" | "partial" | "failed";
  evidence: ResearchEvidenceRef[];
}

interface ResearchResolutionBase {
  knowledge: KnowledgeUnit;
  ledger: GapLedger;
  tasks: ResearchTaskRecord[];
}
```

`ResearchTaskRecord` is compact acquisition provenance, not an assessor transcript: it retains the problem/query relationship and query-relative ranks only for sources admitted as research evidence. Unselected candidates, failed-extraction source identities, provider payloads, and assessor rationale are not persisted. `GapLedger` retains recursive/decomposition provenance.

```ts
interface SufficientResearchResolution extends ResearchResolutionBase {
  status: "sufficient";
  stopReason: "sufficient";
}

interface BestEffortResearchResolution extends ResearchResolutionBase {
  status: "best_effort";
  stopReason: Exclude<ResolutionStopReason, "sufficient">;
}

interface InsufficientResearchResolution extends ResearchResolutionBase {
  status: "insufficient";
  stopReason: Exclude<ResolutionStopReason, "sufficient">;
}

type ResearchResolution =
  | SufficientResearchResolution
  | BestEffortResearchResolution
  | InsufficientResearchResolution;

type ResearchResolverOutcome =
  | { kind: "resolution"; resolution: ResearchResolution }
  | { kind: "checkpoint"; checkpoint: ResearchCheckpoint };
```

The vocabulary is intentionally layered:

```text
recursive node control   resolved | search | decompose
root epistemic outcome   sufficient | best_effort | insufficient
user-facing transcript   resolved | best effort | insufficient
```

`resolved` never becomes a root resolution status, and `sufficient` is never an assessor directive.

**Recursive semantics**

The assessor chooses semantic strategy; the resolver interprets it:

```text
resolve(resolved knowledge) = knowledge

resolve(search query) =
  resolve(original problem, current knowledge ⊔ searched evidence)

resolve(decompose problems) =
  resolve(original problem, current knowledge ⊔ child knowledge)
```

`all` attempts every required affordable child. `any` evaluates children in priority order and may stop once the parent success criterion is supported. Every branch draws from the same explicit per-turn search, source, assessment, and depth budgets, while each assessment obeys the same three-child ceiling; no child receives fresh ceilings.

The operator `⊔` is `joinKnowledge`. It must be associative, commutative, and idempotent:

```text
(A ⊔ B) ⊔ C = A ⊔ (B ⊔ C)
A ⊔ B       = B ⊔ A
A ⊔ A       = A
```

These laws make recursive grouping, concurrent completion order, retries, and duplicate paths converge on equivalent research state. The application derives stable observation identity from normalized proposition, statement, stance, and support references; joining deduplicates by that identity and groups observations by canonical proposition key. Semantically equivalent but differently worded observations may remain distinct in v1.1 rather than being unsafely collapsed. Joining never uses last-write-wins for contradictory claims: it preserves both supported observations and marks the derived finding `contested`. Evidence and provenance are monotonic; current interpretation may be revised without erasing its support history.

For question `Q` and current knowledge `K`, the assessor computes material gaps `G(Q, K)`. Recursive research seeks a useful fixed point:

```text
K0     = thread knowledge + available evidence
K(n+1) = Kn ⊔ resolve(G(Q, Kn))
stop when G(Q, K*) = empty
```

This means zero material gaps needed for the question, not exhaustive or absolute knowledge.

**Gap creation, progress, and stop policy**

- The application creates stable problem/gap, proposition, and observation identities from normalized content, support, and ancestry; provider-generated IDs are not trusted.
- `GapLedger` records decomposition and lifecycle without becoming a separate top-level box. Open work is selected by priority, then shallower depth, then creation order.
- Legal transitions are `open → decomposed | resolved | blocked`; child completion does not bypass parent reassessment.
- A recursive step must add canonical evidence, add/revise a supported observation, resolve a gap, discover a materially narrower gap, or mark work blocked. Otherwise it stops with `no_new_knowledge`.
- Duplicate normalized ancestor problems and gap fingerprints cannot recurse.
- Stop when resolved, an explicit hard limit is reached, no new knowledge is produced, a problem cycles, or the turn is interrupted/unavailable.
- At a non-interruption bounded stop, return `best_effort` when supported knowledge remains useful; otherwise return `insufficient`.
- Interruption or fatal execution failure before a root resolution returns a validated `ResearchCheckpoint`; it is not mislabeled as an epistemic resolution outcome.

The v1.1 persisted form may retain flat `SupportRef[]` provenance while leaving room for a future recursive `SupportExpression = Evidence | All | Any`; persisting a full research AST/proof tree is deferred.

**Invariants**

- Root depth is zero; depth two permits root problem → material subproblem → concrete evidence/search problem.
- At most eight assessor calls and three searches occur across the complete tree; no decomposition emits more than three child problems; no turn consumes more than nine additional sources.
- Model-proposed support references must exist in the exact context/evidence supplied to that assessment.
- Knowledge joining obeys the associative, commutative, and idempotent laws and preserves contradictions and provenance.
- Gap/knowledge identity, legal transitions, explicit-limit bookkeeping, and progress detection are application-controlled.
- The resolver creates no child `Turn` records and emits no user-facing synthesis.

**Failure contract:** bounded child failures contribute blocked/unresolved knowledge where sibling findings remain useful; interruption or total provider unavailability stops the resolver with a typed reason.

**Implementation boundary:** traversal order, immutable versus stateful limit bookkeeping, internal scheduling, and concrete join representation may vary if recursive grammar, algebraic laws, explicit bounds, provenance, and stop semantics remain intact.

### `EvidenceAcquirer`

**Capability:** execute one bounded set of evidence requests by searching, selecting sources, and extracting usable evidence for `ResearchResolver`. Concurrency is an internal scheduling tactic, not the box's identity.

```text
1–3 EvidenceRequest values + known sources + remaining budget
                           |
                           v
                 [ EvidenceAcquirer ]
                           |
                           v
              EvidenceAcquisitionResult
```

```ts
interface EvidenceRequest {
  problemId: ResearchProblemId;
  query: string;
  purpose: string;
  successCriterion: string;
  priority: 1 | 2 | 3;
  problemDepth: number;
  createdOrder: number;
}

interface EvidenceAcquisitionInput {
  requests: EvidenceRequest[];
  knownSources: CanonicalSource[];
  availableEvidenceSourceIds: SourceId[];
  budget: ResearchBudget;
  limits: ResearchLimits;
}

interface EvidenceAcquisitionResult {
  requests: EvidenceRequest[];
  results: EvidenceRequestResult[];
  sources: CanonicalSource[];
  extractions: ExtractionOutcome[];
  evidence: EvidencePack;
  budget: ResearchBudget;
}

type EvidenceRequestFailure =
  | {
      code: "search_unavailable" | "invalid_response" | "extraction_failed";
      retryable: true;
    }
  | {
      code: "rate_limited";
      retryable: true;
      retryAfterSeconds?: number;
    };

interface EvidenceRequestResult {
  request: EvidenceRequest;
  candidates: SearchResult[];
  ownedConsumedSources: SearchResult[];
  evidenceSourceIds: SourceId[];
  failure?: EvidenceRequestFailure;
}
```

`ResearchAssessor` emits one `search` directive for one problem. `ResearchResolver` converts it to an `EvidenceRequest` and may batch up to three independent ready requests discovered across recursive branches into one `EvidenceAcquirer` call; each result remains associated with its originating `problemId`.

**Deterministic source allocation**

Each evidence request may own selection of at most three new canonical sources, derived from the approved `9 / 3` source/search ceilings. For one concurrent batch, requests are ordered by priority, shallower problem depth, then gap creation order. Eligible candidates are canonicalized and locally rank-ordered, then selection proceeds in rank layers:

```text
request order: A, B, C
selection:     A1, B1, C1, A2, B2, C2, A3, B3, C3
```

A candidate already present as viable available evidence is reused without source-budget consumption. A known destination without viable extracted evidence still consumes one source when selected for extraction. The same canonical source selected or encountered across sibling requests consumes global budget and extraction capacity once, may be associated with every relevant request, and does not consume another request's ownership opportunity; that request advances to its next unique eligible candidate. Global search/source counters are reserved in this deterministic order before concurrent extraction starts, so promise completion order cannot affect allocation.

Unused ownership or global capacity is not released back to earlier requests. A lone evidence request therefore selects at most three even when the turn later uses fewer than three searches. This deliberate under-use prevents an early branch from starving unknown later recursive work; explicit limits are ceilings, not utilization targets. Candidates four/five may fill an ownership opportunity when higher-ranked candidates are duplicate or otherwise ineligible; any candidates remaining after three unique selections stay unconsumed. Once a selected source consumes budget, failed/non-viable extraction is not backfilled.

**Invariants**

- Accepts no more than the remaining search budget and never more than three independent ready requests.
- Invokes `SearchProvider` at most once per request; independent requests run concurrently up to three.
- Requests at most five candidates per search.
- Each request owns at most three unique new-source selections; all requests together consume no more than the remaining shared budget and never more than nine aggregate additional sources per turn. A source is consumed when selected for extraction/research context, whether extraction succeeds or fails; unselected candidates do not consume this budget.
- Results and known sources are canonicalized and deduplicated before consumption.
- Each unique source is extracted at most once through one globally bounded three-worker pool.
- Evidence-request-to-candidate-to-consumed-source association is preserved.
- Successful siblings survive another search or extraction failing.
- Evidence acquisition does not assess, recurse, join knowledge, or synthesize.

**Failure contract:** individual request failures remain typed within the result where viable sibling evidence permits continuation; total unavailability or interruption leaves as a bounded acquisition failure.

**Current mapping:** generated-search concurrency, reconciliation, global extraction, and lifecycle events are currently interleaved in `runResearch` in `server/research.ts`.

### `AnswerSynthesizer`

**Capability:** synthesize the one user-facing root answer from bounded thread context and the final `KnowledgeUnit` produced by recursive resolution.

```text
root question + ThreadContext + final KnowledgeUnit
                         |
                         v
               [ AnswerSynthesizer ]
                         |
                         v
            streamed AssistantContent
```

**Invariants**

- Answers the current question in conversational context.
- Uses only supplied supported findings and evidence for factual support.
- Cites only source IDs reachable through the final knowledge unit.
- Assessor directives cannot become direct answer content; internal findings may inform the answer only with their validated support.
- Empty provider completion becomes a bounded synthesis failure.
- Research answer opening and presentation policy remain explicit product contracts while retained.

**Implementation boundary:** model prompting and stream parsing may vary behind the input/output and citation contracts.

**Current mapping:** `synthesize` and synthesis-input construction live in `server/research.ts`; provider streaming lives in `server/anthropic.ts`. The current implementation synthesizes from evidence directly; the target supplies the recursively joined root knowledge unit.

## Controller and Runtime Boundaries

The controller split is settled:

```text
layout intent
     |
     v
[ WorkspaceController ]
  route + box projections + cross-box coordination
     |
     | non-command request / cancellation
     v
[ TurnController ]
  ActiveTurn + stale-event rejection + terminal commit
     |
     v
[ TurnGateway ] ===== HTTP/SSE ===== [ TurnStreamBoundary ]
                                           |
                                           v
                                    [ TurnExecutor ]
                                      |          |
                                      v          v
                                 SearchTurn  ResearchTurn
```

### `WorkspaceController`

**Capability:** coordinate the current route and workspace projections, interpret non-turn commands, and delegate turn lifecycle without absorbing execution, persistence, settings, or authentication internals.

```ts
type AppRoute =
  | { page: "home" }
  | { page: "thread"; threadId: ThreadId }
  | { page: "threads" }
  | { page: "settings" }
  | { page: "unlock" };

type WorkspaceIntent =
  | { type: "raw_submission"; value: string }
  | { type: "cancel_requested" }
  | { type: "route_requested"; route: AppRoute }
  | { type: "new_thread_requested" }
  | { type: "evidence_selected"; sourceId: SourceId }
  | { type: "retry_turn_requested"; turnId: TurnId };

interface WorkspaceViewState {
  route: AppRoute;
  prompt: PromptBoxViewState;
  transcript?: TranscriptBoxViewState;
  evidence?: EvidenceBoxViewState;
  selectedSourceId?: SourceId;
}
```

The workspace controller recognizes slash commands and routes them to navigation/application capabilities. Every non-command submission is delegated unchanged to `TurnController`; only the turn controller applies the trailing-`?` turn-kind policy. It composes `TranscriptBoxViewState` and `EvidenceBoxViewState` from the committed `Thread`, controller-owned active state, and active evidence delta.

**Invariants**

- Owns route state, safe navigation, selected evidence, focus requests, and cross-box view projection.
- Does not execute search/research, parse provider events, construct terminal turns, or write thread records.
- Delegates settings, authentication, startup status, thread-list mutation, and turn execution to their owning controllers/capabilities.
- A slash command never accidentally becomes a turn; a non-command submission is not reclassified by UI layout code.
- New-thread/navigation behavior coordinates cancellation through `TurnController` rather than deleting or mutating active execution directly.

**Failure contract:** stale or route-inapplicable intents are safe no-ops; bounded failures remain in the state projection owned by the capability that failed.

**Current mapping:** route state, slash-command interpretation, selected evidence, focus effects, request execution, persistence, and box composition are interleaved in `src/ui/App.tsx`.

### `TurnController`

**Capability:** own the browser-side lifecycle of at most one active turn, bridge it through `TurnGateway`, and atomically commit exactly one validated terminal turn plus newly admitted canonical sources.

```ts
type TurnControllerIntent =
  | {
      type: "submit";
      threadId?: ThreadId;
      rawRequest: string;
      retryOfTurnId?: TurnId;
    }
  | {
      type: "cancel";
      turnId: TurnId;
      reason: TurnInterruption["reason"];
    }
  | { type: "retry_commit"; turnId: TurnId };

type ThreadCommitFailure =
  | { code: "revision_conflict"; retryable: true }
  | { code: "storage_unavailable"; retryable: true }
  | { code: "invalid_record"; retryable: false };

type TurnControllerState =
  | { phase: "idle" }
  | { phase: "executing"; activeTurn: ActiveTurn }
  | {
      phase: "committing";
      activeTurn: ActiveTurn;
      terminalCandidate: Turn;
    }
  | {
      phase: "commit_failed";
      activeTurn: ActiveTurn;
      terminalCandidate: Turn;
      failure: ThreadCommitFailure;
    };
```

`terminalCandidate` is controller-owned recovery state, not durable history and not a second user-visible answer channel. Submission remains blocked through `executing | committing | commit_failed`; commit retry reuses the exact candidate and never reruns providers.

The controller performs this sequence:

```text
validate submission + retry link
          |
classify trailing ? + allocate execution/turn IDs
          |
load Thread -> derive bounded ThreadContext
          |
open TurnGateway -> project validated events into ActiveTurn
          |
validate terminal outcome + complete source-reference closure
          |
construct immutable terminal Turn
          |
ThreadStore.commitTerminalTurn(expected revision, new sources, turn)
          |
publish committed workspace state
```

**Invariants**

- At most one turn executes or awaits commit in one workspace; there is no request queue.
- The controller, not `PromptBox`, applies the deterministic trailing-`?` classification.
- `executionId`, `turnId`, and event sequence identify the active stream. `accepted` is sequence one and each lifecycle event increments by one. Events for another execution, duplicate/lower-sequence events, and all events after terminal acceptance are ignored; a forward sequence gap or schema-invalid active event terminates that stream as connection loss. None can mutate newer state.
- Public lifecycle events alone project `ActiveTurn`; raw SSE frames, provider payloads, assessor responses, and hidden reasoning never enter UI state.
- The first legal terminal condition is authoritative: either a validated server terminal received before local cancellation/loss wins, or the controller closes the execution with one locally reasoned interrupted candidate. Earlier source/answer deltas are presentation-only and cannot be committed independently.
- Before commit, every destination, citation, support, task-evidence, and evidence-pack `SourceId` must resolve through the existing thread catalog or terminal `sourceRecords`.
- Canonical source admission, ordinal assignment, terminal-turn append, thread timestamps, schema validation, and revision check happen in one `ThreadStore` transaction.
- A terminal candidate becomes durable/visible as terminal history only after commit succeeds. Commit failure preserves the candidate in memory and blocks another submission until retry succeeds or the workspace is lost; it never reruns execution. Revision-conflict retry reloads the aggregate, treats an existing identical `turnId` as idempotent success, otherwise revalidates and commits the same immutable turn while deriving any new source ordinals against the latest catalog.
- Cancellation is idempotent. Once cancellation starts, the controller may accept only newer validated `research_state` needed for recovery during the bounded cancellation window, then constructs one interrupted candidate using the locally known cancellation reason and latest validated source-closed research state or `unavailable`; other late terminal/events are stale.
- Connection loss similarly produces one interrupted candidate and never guesses or retains a resolution/checkpoint that was not received and source-closed against existing/active canonical metadata.

**Failure contract:** submission validation is local and non-durable; execution failures map only to approved terminal variants; malformed/stale transport cannot widen durable unions; commit conflicts/unavailability retain the exact terminal candidate for idempotent retry.

**Implementation boundary:** a React hook, state machine, or framework-free observable controller may implement this box. XState remains appropriate only if used for this named active-turn workflow; routing and ordinary box state remain local/simple.

**Current mapping:** active request IDs, abort controllers, stream parsing, live answer/source state, stale-event checks, turn construction, and `ThreadStore` writes are interleaved in `Topic`/`App` in `src/ui/App.tsx`.

### `TurnGateway`

**Capability:** expose one browser-side typed streaming call while hiding HTTP, SSE framing, authentication cookies, and abort mechanics.

```ts
interface TurnGateway {
  execute(
    request: TurnExecutionRequest,
    onEvent: (event: TurnExecutionEvent) => void,
    signal: AbortSignal,
  ): Promise<void>;
}
```

The gateway runtime-validates every decoded event before delivery. HTTP rejection before stream acceptance becomes a bounded gateway failure; disconnection after acceptance is reported as connection loss to `TurnController`. It owns no turn policy, durable construction, source admission, or UI projection.

### `TurnExecutor`

**Capability:** dispatch one validated server-side execution to the matching provider-neutral `SearchTurn` or `ResearchTurn` capability and return a terminal execution payload while emitting bounded progress.

```ts
type TurnExecutionRequest =
  | {
      executionId: ExecutionId;
      turnId: TurnId;
      kind: "search";
      query: string;
      maxResults: number;
    }
  | {
      executionId: ExecutionId;
      turnId: TurnId;
      kind: "research";
      question: string;
      context: ThreadContext;
      limits: ResearchLimits;
    };

type TerminalPayload<T extends Turn> = T extends TerminalTurnBase<TurnKind>
  ? Omit<T, keyof TerminalTurnBase<TurnKind>>
  : never;

type TurnExecutionTerminal =
  | {
      kind: "search";
      outcome: TerminalPayload<SearchTurn>;
      sourceRecords: CanonicalSource[];
    }
  | {
      kind: "research";
      outcome: TerminalPayload<ResearchTurn>;
      sourceRecords: CanonicalSource[];
    };

type TurnExecutionSignal =
  | { type: "phase"; phase: TurnPhase }
  | {
      type: "source_delta";
      sources: CanonicalSource[];
      occurrences: SourceDeltaOccurrence[];
    }
  | {
      type: "research_state";
      state:
        | { kind: "checkpoint"; checkpoint: ResearchCheckpoint }
        | { kind: "resolution"; resolution: ResearchResolution };
    }
  | { type: "answer_delta"; delta: string };

interface TurnExecutor {
  execute(
    request: TurnExecutionRequest,
    onSignal: (signal: TurnExecutionSignal) => void,
    signal: AbortSignal,
  ): Promise<TurnExecutionTerminal>;
}
```

The executor receives an application cancellation signal and emits typed transport-independent signals before returning its one terminal payload. It does not authenticate HTTP requests, assign SSE sequence numbers, encode SSE, load or persist threads, allocate source ordinals, navigate, or construct `TerminalTurnBase` metadata. `sourceRecords` must contain canonical metadata for every terminal reference not already available in input context; the browser controller performs final reference-closure validation against the durable aggregate.

### `TurnExecutionEvent`

```ts
type TurnPhase =
  | "searching"
  | "assessing"
  | "decomposing"
  | "extracting"
  | "resolving"
  | "synthesizing";

interface TurnEventBase {
  executionId: ExecutionId;
  turnId: TurnId;
  sequence: number;
}

interface SourceDeltaOccurrence {
  sourceId: SourceId;
  role: EvidenceRole;
  rank?: number;
}

type TurnExecutionEvent =
  | (TurnEventBase & { type: "accepted"; kind: TurnKind })
  | (TurnEventBase & { type: "phase"; phase: TurnPhase })
  | (TurnEventBase & {
      type: "source_delta";
      sources: CanonicalSource[];
      occurrences: SourceDeltaOccurrence[];
    })
  | (TurnEventBase & {
      type: "research_state";
      state:
        | { kind: "checkpoint"; checkpoint: ResearchCheckpoint }
        | { kind: "resolution"; resolution: ResearchResolution };
    })
  | (TurnEventBase & { type: "answer_delta"; delta: string })
  | (TurnEventBase & {
      type: "terminal";
      terminal: TurnExecutionTerminal;
    });
```

`accepted.kind` and `terminal.kind` must match the request. Search permits only the `searching` phase plus search-destination source deltas; `research_state` and `answer_delta` are legal only for research. A checkpoint is emitted only after application validation at a recoverable resolver boundary and after any source deltas needed to close its references; the full source-closed root resolution is emitted before synthesis begins. This lets cancellation or connection loss persist exactly the latest validated state actually received without exposing assessor rationale or fabricating knowledge. `source_delta` contains only normalized public source metadata and contextual occurrences; extracted page text reaches the browser only inside a bounded validated checkpoint/resolution. Exactly one terminal event is legal. Event schemas reject unknown fields and bound array/string sizes. Progress phases are coarse public lifecycle, not hidden reasoning.

### `TurnStreamBoundary`

**Capability:** adapt authenticated HTTP/SSE to one `TurnExecutor` invocation.

The boundary owns request size/schema validation, authentication/session checks, same-origin policy, execution cancellation wiring, heartbeat comments, event IDs/sequences, SSE serialization, and bounded pre-stream HTTP errors. It emits `accepted`, invokes the executor exactly once, wraps validated executor signals with identity/sequence fields, and wraps the returned terminal payload in exactly one `terminal` event. Heartbeats are transport comments, not lifecycle events and do not advance application sequence.

It does not classify raw prompt input, build `ThreadContext`, make search/research decisions, expose provider errors, mutate `Thread`, or decide what becomes durable. Executor failure after acceptance must become one bounded terminal execution outcome when possible; an unencodable/abrupt connection failure closes the stream and is interpreted by the browser controller as interruption.

**Current mapping:** `/api/lookup`, `/api/research`, request validation, authentication, SSE writing, heartbeats, orchestration, and cancellation are interleaved in `server/app.ts`; stream parsing and stale-request handling are interleaved in `src/ui/App.tsx`.

### `ThreadStore`

`ThreadStore` is the persistence port used by `TurnController` and thread/settings capabilities. Its terminal operation must atomically revision-check the thread, admit canonical sources with deterministic ordinals, append one schema-valid immutable terminal turn, and update metadata. Local IndexedDB and remote adapters must implement the same observable contract. Retention, list/delete, import/export, and exact record/envelope naming remain for the dedicated storage-contract pass.

## Layout Components

The agreed layout vocabulary is:

- `PromptBox`
- `TranscriptBox` (currently `TurnTranscriptBox`)
- `EvidenceBox`
- `BrandBox`
- `StickyHeader`
- `SettingsBox`
- `ThreadsBox` with `fzf@0.5.2`-backed filtering and keyboard behavior (currently `ThreadPicker`)
- `UnlockBox`
- `SystemStatusBox`

`Hotkeys` is also an explicit layout-control box, but it is not a visible region and does not receive shared visual styling.

`Box` identifies a visually coherent product region with one presentation capability, a typed state input, and typed user intents. All boxes participate in shared typography, spacing, border, focus, responsive, and color-scheme styling. `UnlockBox` is explicitly included so global box-level visual changes apply to the authentication screen rather than leaving it as unrelated boundary markup.

Layout boxes receive state and emit user intent. They do not directly own navigation, durable persistence, network requests, turn routing, or research orchestration. Ordinary ephemeral interaction state—draft text, fuzzy query, active row, focus, disclosure, and `BrandBox` tagline rotation—may remain local to React. Route/workspace controllers translate intents into application/system calls and project resulting state back into boxes. `Hotkeys` follows the same intent boundary for global keyboard input while box-local keyboard behavior remains with the owning visible box.

```text
KeyboardEvent + route/focus/turn context
                  |
                  v
              [ Hotkeys ] ------ semantic intent ------+
                                                       |
application/system state                               |
          |                                            |
          v                                            v
                   WorkspaceController <---------------+
                            |
                            | typed view state
                            v
+-------------------------- page ---------------------------+
| StickyHeader                                             |
|   +-- BrandBox                                           |
|   `-- contextual actions                                 |
+----------------------------------------------------------+
| TranscriptBox ---- evidence_selected(sourceId) --+       |
|                                                  |       |
|                                      selectedSourceId    |
|                                                  |       |
|                                                  v       |
|                                            EvidenceBox   |
+----------------------------------------------------------+
| PromptBox ---------------------------- raw submit intent |
+----------------------------------------------------------+
                            |
                            | typed user intent
                            v
                   WorkspaceController
                            |
                            v
              owning application controller/capability
```

The canonical page compositions are:

```text
HOME       StickyHeader(BrandBox) + PromptBox + command hints
THREAD     StickyHeader(BrandBox, thread actions)
           + TranscriptBox + EvidenceBox + PromptBox
THREADS    StickyHeader(BrandBox, close) + ThreadsBox
SETTINGS   StickyHeader(BrandBox, close) + SettingsBox
UNLOCK     StickyHeader(BrandBox) + UnlockBox
BOUNDARY   StickyHeader(BrandBox) + SystemStatusBox
```

Cross-box coordination belongs to `WorkspaceController`. In particular, `TranscriptBox` emits a source selection intent; the controller updates `selectedSourceId`, supplies it to `EvidenceBox`, and coordinates focus without either box querying or mutating the other's DOM.

`ThreadsBox` has one canonical `/threads` route rather than an overlay or adaptive dual presentation. It locally owns aggressive fzf-backed query/ranking, active-row, and keyboard interaction state. The controller supplies thread summaries and loading/failure state, then handles open, delete, and close intents through navigation and `ThreadStore`. `/threads`, its slash command, and its global shortcut all converge on the same route.

Initial system relationships are:

```text
PromptBox      -- raw submit intent ------> WorkspaceController -> TurnController
Hotkeys        -- focus/cancel/route intent -> WorkspaceController
TranscriptBox  <-- durable/live turns ----- WorkspaceController
EvidenceBox    <-- reachable evidence ----- WorkspaceController
ThreadsBox     <-- thread summaries ------- thread-list controller
SettingsBox    <-- settings/backup state -- settings controller
UnlockBox      <-- auth state ------------- authentication controller
SystemStatusBox<-- startup/boundary state -- application controller
BrandBox       -- new-thread intent -------> WorkspaceController
StickyHeader   -- contextual intents ------> WorkspaceController
```

`SettingsBox` may own temporary form and file-picker state but reaches browser preferences, backup operations, and `ThreadStore` only through intents. `UnlockBox` may own an in-memory passphrase draft but never logs, persists, exports, or exposes that value outside its submit intent. `StickyHeader` owns sticky presentation, safe-area behavior, and action placement; `BrandBox` owns identity presentation and its local rotation timer, not navigation.

### `PromptBox`

**Capability:** capture one raw user submission while preserving an editable terminal-like draft during active work.

```ts
interface PromptBoxViewState {
  initialDraft?: string;
  submission: "available" | "blocked_by_active_turn";
  focusRequestKey: number;
}

type PromptBoxIntent = {
  type: "prompt_submitted";
  rawInput: string;
};
```

`PromptBox` owns its ephemeral draft, text composition, and focus state. The controller interprets submitted text as a slash command, trailing-`?` `ResearchTurn`, or macro-less `SearchTurn`; the box does not know those semantics.

**Invariants**

- The prompt has no submit or stop button; Enter submits when available.
- While a turn is active, the draft remains editable but submission is blocked. There is no hidden queue.
- `Ctrl+C` with focus in the prompt and a collapsed selection clears the draft. Selected text retains native copy behavior; `Cmd+C` and copying outside the prompt are never intercepted.
- A changed `focusRequestKey` focuses the prompt without a controller querying its DOM.
- Empty or composition-in-progress input is not submitted.

**Failure contract:** blocked or invalid submission remains local and non-destructive; a failed turn does not become a prompt-rendering failure.

**Implementation boundary:** controlled versus locally owned draft representation, input versus textarea rendering, and concrete focus-ref mechanics may vary while keyboard, composition, submission, and accessibility behavior remain intact.

**Current mapping:** `PromptBox`, draft state, macro/command handling, and submission callbacks are interleaved in `src/ui/App.tsx`. The target keeps draft interaction in `PromptBox` and moves interpretation and effects to the controller.

### `Hotkeys`

**Capability:** translate one unhandled global keyboard gesture plus current route/focus/turn context into a semantic layout intent.

```ts
interface HotkeysContext {
  route: "home" | "thread" | "threads" | "settings" | "unlock";
  promptAvailable: boolean;
  turnActive: boolean;
  focus: "editable" | "interactive" | "passive";
  composing: boolean;
}

type HotkeyIntent =
  | { type: "prompt_focus_requested" }
  | { type: "turn_cancellation_requested" }
  | { type: "new_thread_requested" }
  | { type: "threads_requested" }
  | { type: "settings_requested" };
```

**Invariants**

- Unmodified `:` emits `prompt_focus_requested` only when a `PromptBox` is mounted, focus is passive, and composition is inactive. It is a no-op on `/threads`, `/settings`, and `/unlock`.
- Escape during an active turn emits only `turn_cancellation_requested` and does not count toward the idle double-Escape shortcut.
- Two unhandled Escapes within the retained bounded interval request a new thread only while no turn is active.
- Retained global thread/settings shortcuts emit route intents; `Hotkeys` does not navigate.
- Box-local bindings remain local: `PromptBox` owns `Ctrl+C` and submission; `ThreadsBox` owns filtering, arrows, Enter, Delete, and route-close Escape.
- Editable or interactive targets, modifier combinations, composition, and already-handled events are not stolen unless a documented binding explicitly requires them.
- `Hotkeys` never queries/focuses box DOM, aborts a request, accesses storage, or invokes application/system capabilities.

**Failure contract:** unavailable targets and unsupported gestures are safe no-ops; the controller may ignore stale or inapplicable intents without creating a user-facing failure.

**Implementation boundary:** hook, provider, event-delegation strategy, and key-normalization mechanics may vary. There must be one global installation, deterministic conflict priority, and no duplicated route-level listeners for global bindings.

**Current mapping:** global shortcuts live in `GlobalShortcuts`, research cancellation has a separate capture listener in `Topic`, and local picker behavior lives in `ThreadPicker` in `src/ui/App.tsx`. The target centralizes only global/cross-box gestures in `Hotkeys`; box-local behavior stays with the owning box.

### `TranscriptBox`

**Capability:** render durable turns and the single active turn as one ordered conversational transcript.

```ts
interface TranscriptBoxViewState {
  turns: TranscriptTurnView[];
}

type TranscriptPhase =
  | "starting"
  | "searching"
  | "assessing"
  | "acquiring_evidence"
  | "resolving"
  | "synthesizing";

interface TranscriptTurnView {
  turnId: TurnId;
  request: string;
  presentation:
    | {
        kind: "active";
        phase: TranscriptPhase;
        streamedAnswer?: string;
        progress: TranscriptProgressView[];
      }
    | {
        kind: "search_results";
        sourceCount: number;
      }
    | {
        kind: "answer";
        markdown: string;
        completion: "resolved" | "best_effort"; // presents root sufficient as "resolved"
      }
    | {
        kind: "terminal";
        status: "insufficient" | "failed" | "interrupted";
        message: string;
        retryable: boolean;
      };
}

interface TranscriptProgressView {
  id: string;
  label: string;
  detail?: string;
}

type TranscriptBoxIntent =
  | { type: "evidence_selected"; sourceId: SourceId; turnId: TurnId }
  | { type: "turn_retry_requested"; turnId: TurnId };
```

`WorkspaceController` projects durable `Thread` state and bounded public `TurnController` lifecycle state into this presentation model. `TranscriptBox` does not receive persistence records, raw provider payloads, assessor directives, or an independent live-answer channel.

```text
durable turns + active lifecycle/answer deltas
                    |
                    v
       WorkspaceController projection
                    |
                    v
             TranscriptBox
                    |
                    +-- evidence_selected
                    `-- turn_retry_requested
```

**Invariants**

- Turns appear once in durable conversational order; at most the final turn has an `active` presentation.
- The active turn occupies its eventual durable position. Completion replaces that presentation by stable `turnId` rather than appending duplicate request or answer markup.
- Initial and follow-up requests use the same rendering path.
- A `SearchTurn` presents its request and bounded result summary without inventing an assistant answer; ranked destinations remain in `EvidenceBox`.
- A `ResearchTurn` may show bounded safe progress and streamed root-answer content in place. Raw assessor payloads, hidden reasoning, and provider diagnostics are never rendered.
- Progress announcements are polite and phase-level; token deltas are not individually announced to screen readers. Completion and terminal status remain perceivable.
- Citation activation emits typed evidence intent. The box does not query, focus, or mutate `EvidenceBox` DOM.
- Retry is emitted only for a retryable terminal presentation; the box does not restart work itself.

**Failure contract:** an empty transcript renders an intentional empty state. A terminal turn remains in sequence with its bounded public message and preserves earlier successful turns. Unsupported or stale evidence references remain inert rather than causing the transcript to fail.

**Implementation boundary:** item components, markdown rendering, virtualization, and live-delta buffering may vary while ordering, replacement, accessibility, citation, and no-duplication contracts remain intact.

**Current mapping:** `TurnTranscriptBox` currently receives a domain `Thread` and renders only `renderThreadScrollback(thread)`. `Topic` separately renders live research plans/loaders, a conditional initial streamed answer, and a separate follow-up answer in `src/ui/App.tsx`. The target replaces those fragmented paths with one controller-projected `TranscriptBoxViewState`; durable completion replaces the matching active view without duplicate output.

### `EvidenceBox`

**Capability:** render and navigate the complete thread-wide deduplicated evidence set.

```ts
interface EvidenceBoxViewState {
  evidenceSet: EvidenceSet;
  selectedSourceId?: SourceId;
}

type EvidenceBoxIntent =
  | { type: "evidence_selected"; sourceId: SourceId }
  | { type: "source_open_requested"; sourceId: SourceId };
```

```text
all durable turns + active admitted sources
                    |
                    v
        derive canonical EvidenceSet
                    |
                    v
               EvidenceBox
                    ^
                    |
 TranscriptBox citation selected by SourceId
```

**Invariants**

- The box displays the complete set rather than switching scope by selected turn.
- Each canonical source appears exactly once. Its one-based ordinal is append-stable and presentational; citations and intents retain durable `SourceId` identity.
- A repeated source keeps its ordinal while occurrences preserve every relevant turn, role, and query-relative rank.
- Promotion from `search_destination` to `research_evidence` adds a role occurrence to the existing entry; it never creates a duplicate card or rewrites prior provenance.
- Deterministic admission order, not async completion order, controls ordinals. Existing visible ordinals are never renumbered when new evidence arrives.
- Transcript citation selection highlights and focuses the matching source through controller-supplied `selectedSourceId`; neither box queries the other's DOM.
- Selection and external-open behavior are emitted as intents. The box does not navigate, mutate turns, or resolve URLs itself.
- Source titles, snippets, URLs, role labels, ordinals, and selection state remain keyboard and screen-reader perceivable; unsafe markup is never rendered.

**Failure contract:** an empty set renders an intentional no-evidence state. A stale or unknown selected `SourceId` produces no selection rather than a rendering failure. Failed or non-viable extraction cannot promote an entry to `research_evidence`; successful siblings remain visible.

**Implementation boundary:** list/grid layout, role badges, occurrence disclosure, and large-set rendering may vary while global deduplication, stable identity/ordinal behavior, provenance, focus, and accessibility contracts remain intact.

**Current mapping:** `EvidenceBox` currently receives a flat `SearchResult[]`; `Topic` sometimes supplies current stream sources and sometimes derives a thread-wide deduplicated list with `sourcesForThread`, while citation rendering computes numbers separately per turn. The target controller derives one canonical `EvidenceSet` and supplies the same source ID-to-ordinal mapping to both `TranscriptBox` citation rendering and `EvidenceBox`.

### `BrandBox`

**Capability:** present Dorothy Ann's identity as one compact control that requests a fresh workspace.

```ts
interface BrandBoxViewState {
  mark: string;
  taglines: readonly string[];
  rotationIntervalMs: number;
}

type BrandBoxIntent = {
  type: "new_thread_requested";
};
```

**Invariants**

- The mark and rotating tagline form one activation target with one stable accessible name and one `new_thread_requested` intent; there is no separate home-versus-new behavior.
- The box never navigates, creates a thread, clears state, or cancels an active turn. The controller decides how to satisfy the intent in current route/turn/auth context.
- Tagline rotation is ordinary local presentation state, is not announced as live content, and freezes to a deterministic value when reduced motion is requested.
- Keyboard and pointer activation are equivalent. Focus remains visible under every supported theme.
- The complete identity remains recognizable when narrow layouts truncate or hide tagline text.

**Failure contract:** missing or empty tagline data falls back to the stable mark; inability to rotate never prevents new-thread activation.

**Implementation boundary:** timer mechanics, transition styling, responsive tagline visibility, and native control-element rendering may vary while the single-target, single-intent, accessibility, and reduced-motion contracts remain intact.

**Current mapping:** `RotatingBrand` in `src/ui/App.tsx` currently renders two adjacent links: the signature targets `/new`, while the optional tagline targets `/`. The target merges them into one `BrandBox` activation surface and emits intent instead of navigating directly.

### `StickyHeader`

**Capability:** keep global identity and bounded route-contextual actions available in one persistent page header.

```ts
type HeaderActionId =
  | "copy_thread"
  | "export_thread"
  | "close_secondary";

interface HeaderActionView {
  id: HeaderActionId;
  label: string;
  availability: "enabled" | "disabled";
}

interface StickyHeaderViewState {
  brand: BrandBoxViewState;
  actions: HeaderActionView[];
  feedback?: string;
}

type StickyHeaderIntent =
  | BrandBoxIntent
  | { type: "header_action_requested"; actionId: HeaderActionId };
```

Canonical action projection is route-owned:

```text
home     -> BrandBox
thread   -> BrandBox + available copy/export actions
threads  -> BrandBox + close
settings -> BrandBox + close
unlock   -> BrandBox
```

**Invariants**

- Every canonical page uses the same sticky header and nested `BrandBox`; pages do not reproduce private header markup.
- The controller supplies only actions valid for current route/state. Disabled actions cannot emit intent.
- The header emits semantic action IDs and performs no navigation, clipboard, file export, cancellation, persistence, or auth effects.
- Feedback such as copied/exported status is bounded, non-blocking, and announced through one polite status region without shifting primary controls unpredictably.
- Sticky positioning respects safe areas, narrow layouts, zoom, focus visibility, anchor targets, and the fixed `PromptBox`; it never makes page content unreachable.
- Contextual actions have stable accessible names and keyboard/pointer parity. `BrandBox` remains the first consistent landmark control.

**Failure contract:** an unavailable contextual capability is omitted or disabled rather than causing header failure. Failed effects return bounded controller state/feedback while the header and brand remain usable.

**Implementation boundary:** CSS stickiness, backdrop treatment, action overflow, compact responsive rendering, and component composition may vary while landmark, action, feedback, accessibility, and no-effects boundaries remain intact.

**Current mapping:** sticky CSS exists in `src/ui/App.module.css`, while `Home`, `Topic`, `Unlock`, and `SecondaryLayout` repeat header markup in `src/ui/App.tsx`. Copy/export effects and feedback are interleaved in `Topic`. The target composes one `StickyHeader` on every canonical page and moves effects to the controller.

### `ThreadsBox`

**Capability:** rapidly find and act on one durable thread through the canonical `/threads` route.

```ts
interface ThreadsBoxOperationState {
  pendingDeletionIds: ThreadId[];
  deletionFailures: Array<{
    threadId: ThreadId;
    message: string;
  }>;
}

type ThreadsBoxViewState = ThreadsBoxOperationState &
  (
    | { status: "loading"; threads: [] }
    | { status: "ready"; threads: ThreadSummary[] }
    | {
        status: "failed";
        threads: ThreadSummary[];
        loadFailure: string;
      }
  );

interface RankedThreadSummary {
  thread: ThreadSummary;
  titlePositions: number[];
  previewPositions: number[];
}

type ThreadsBoxIntent =
  | { type: "thread_open_requested"; threadId: ThreadId }
  | { type: "thread_delete_requested"; threadId: ThreadId }
  | { type: "threads_reload_requested" }
  | { type: "threads_close_requested" };
```

Matching is isolated behind one pure UI policy:

```ts
function rankThreads(
  threads: readonly ThreadSummary[],
  query: string,
): RankedThreadSummary[];
```

`rankThreads` uses exactly pinned `fzf@0.5.2` with its synchronous `extendedMatch`, `fuzzy: "v2"`, `casing: "smart-case"`, and `normalize: true` behavior. The selector searches title followed by last-turn preview; the wrapper maps returned positions back to those two fields for safe highlighting. An empty query sorts by `updatedAt` descending then `ThreadId` ascending. Non-empty equal-score results use the same deterministic tie-break order.

```text
ThreadSummary[] + local query
              |
              v
         rankThreads
              |
              v
     pinned fzf matcher
              |
              v
 RankedThreadSummary[]
              |
              v
          ThreadsBox
```

The dependency is intentionally used instead of maintaining a home-rolled approximation of fzf's scoring, smart case, normalization, extended syntax, and match positions. Pinning plus behavioral fixtures protects Dorothy Ann from accidental ranking changes or package drift; `ThreadsBox` and its controller never depend on package result types directly.

**Invariants**

- `/threads` is the only presentation; slash command, global shortcut, and navigation intent converge on that route.
- Query, ranked results, active row, and match highlighting are ephemeral local UI state. Loading, deletion-in-progress, and bounded failures are controller-supplied state.
- Typing updates ranking synchronously. Arrow keys and `Ctrl+P`/`Ctrl+N` move one active row; movement is bounded and keeps that row visible.
- Enter requests opening the active thread. Delete/Backspace enters inline confirmation for the active row only when it is not editing filter text; no deletion intent is emitted yet.
- Inline confirmation is terminal-style and local: `y` or Enter emits `thread_delete_requested`; `n` or Escape cancels confirmation. The confirmation names the thread and keeps query/selection intact.
- Confirmation consumes its Escape. A later unhandled Escape emits `threads_close_requested`.
- While the confirmed deletion is pending in controller state, its row cannot be reopened or deleted again. Success removes it from supplied state; failure restores normal actions with bounded feedback and preserves the closest viable active row.
- `Ctrl+C` with a collapsed selection clears a non-empty filter; native copy is preserved for selected text and all `Cmd+C` use.
- Empty-query and equal-score order are deterministic and do not depend on storage return order or sort stability.
- Match highlighting renders text nodes, never matcher-produced HTML. Query syntax and Unicode/diacritic behavior are covered by fixtures.
- The box owns only ephemeral confirmation presentation and emits semantic intents after confirmation; it never calls `ThreadStore`, removes data, reloads records, or navigates.
- Loading, empty, no-match, deletion-in-progress, and load/delete failure states remain distinct, perceivable, and keyboard safe.

**Failure contract:** matcher failure falls back to deterministic empty-query ordering with bounded non-blocking feedback rather than making threads inaccessible. Storage load/delete failures arrive as view state, preserve the current query/selection where possible, and expose only applicable retry intent.

**Implementation boundary:** row rendering, list virtualization, highlight styling, and exact local state representation may vary. The pinned matcher configuration, wrapper result contract, keyboard semantics, deterministic tie-breaks, and accessibility behavior may not drift without amending this plan.

**Current mapping:** `ThreadPicker` in `src/ui/App.tsx` directly loads/removes through `ThreadStore`, uses case-insensitive title substring filtering, owns a `window.confirm`, and navigates itself; it also supports both inline and overlay rendering. The target `ThreadsBox` receives state and emits intent on canonical `/threads`, uses inline terminal-style confirmation, and leaves controller effects and `rankThreads` matching behind separate explicit boundaries.

### `SettingsBox`

**Capability:** present preferences and data-management controls while applying each preference independently and immediately through controller intent.

```ts
type Appearance = "auto" | "light" | "dark";
type PreferenceKey = "appearance" | "color_scheme" | "primary_accent";
type PreferencePersistence =
  | { status: "saved" }
  | { status: "saving" }
  | { status: "session_only"; message: string };

interface SettingsBoxViewState {
  preferences: {
    appearance: Appearance;
    colorScheme: ColorScheme;
    primaryAccent: PrimaryAccent;
  };
  persistence: Record<PreferenceKey, PreferencePersistence>;
  backup: BackupControlsViewState;
  retentionNotice: string;
}

type BackupPreviewId = Brand<string, "BackupPreviewId">;
type BackupConflictPolicy = "keep_existing" | "replace_existing";

type BackupControlsViewState =
  | { status: "idle" }
  | { status: "exporting" }
  | {
      status: "preview";
      previewId: BackupPreviewId;
      fileName: string;
      add: number;
      conflicts: number;
      skippedInvalid: number;
      issueMessages: string[];
      conflictPolicy: BackupConflictPolicy;
      canImport: boolean;
    }
  | { status: "importing"; fileName: string }
  | {
      status: "completed";
      message: string;
      added: number;
      replaced: number;
      skipped: number;
    }
  | {
      status: "failed";
      operation: "export" | "inspect" | "import";
      message: string;
    };

type SettingsBoxIntent =
  | { type: "appearance_changed"; value: Appearance }
  | { type: "color_scheme_changed"; value: ColorScheme }
  | { type: "primary_accent_changed"; value: PrimaryAccent }
  | { type: "preference_save_retry_requested"; key: PreferenceKey }
  | { type: "backup_export_requested" }
  | { type: "backup_import_selected"; file: File }
  | {
      type: "backup_conflict_policy_changed";
      value: BackupConflictPolicy;
    }
  | { type: "backup_import_confirmed"; previewId: BackupPreviewId }
  | { type: "backup_import_cancelled" };
```

Preference flow is settled:

```text
preference changed
       |
       v
   SettingsBox intent
       |
       v
settings controller
       ├── apply immediately to document/session
       `── persist through browser preference adapter
                  |
                  ├── success -> saved
                  `── failure -> session_only + retry
```

**Invariants**

- There is no aggregate Save or Cancel action. Each validated preference change applies immediately and persists independently.
- The controller applies the selected value before persistence completes, so the visible setting and document never intentionally diverge during `saving`.
- Persistence failure does not roll back the session. The affected preference becomes `session_only` with bounded status and an applicable retry intent.
- One preference's save/failure state does not block or overwrite another preference.
- Invalid persisted values are normalized to documented defaults before reaching the box; the box never renders an invalid selection.
- Color-scheme changes deterministically normalize or reinterpret the selected accent through the shared color policy rather than leaving an unavailable option.
- `SettingsBox` does not access `document`, media queries, `localStorage`, `ThreadStore`, clipboard, downloads, or network APIs directly.
- Form labels, current values, save status, errors, and keyboard/focus behavior remain perceivable across themes and responsive layouts.

**Backup/import interaction**

Backup remains because it is existing v1 recovery behavior across local/remote storage, not because it is a central product capability. It stays visually secondary and compact.

```text
select backup file
       |
       v
settings controller validates + ThreadStore.inspectImport
       |
       v
SettingsBox inline preview
  + new / conflicts / skipped-invalid counts
  + sanitized issue messages
  + keep-existing (safe default) / replace-existing
       |
       +-- cancel -> discard opaque preview
       `-- confirm(previewId)
                    |
                    v
          ThreadStore.importData
                    |
                    v
             bounded report
```

A structurally invalid/unsupported backup produces an inspect failure and cannot be confirmed. Individually invalid thread records are excluded and reported as `skippedInvalid`; remaining valid records may be imported. Preview exposes at most 20 sanitized issue summaries while retaining the complete skipped count. Import is disabled when no valid add/replace work remains. `keep_existing` is the default conflict policy, and changing it updates preview state before confirmation. The controller retains the validated candidate behind opaque `BackupPreviewId` only in memory and rejects stale confirmations; raw backup content never becomes layout state.

Export is one explicit action. The controller obtains validated backup data from `ThreadStore`, creates the browser download, and returns bounded status; `SettingsBox` never constructs blobs or clicks synthetic anchors.

**Failure contract:** adapter unavailability leaves validated preferences active for the current session and identifies only affected values as unsaved. Export, inspect, and import failures are independent typed view states, preserve preference usability, expose no raw payloads, and permit a fresh attempt. Successful partial import reports added, replaced, and skipped counts explicitly.

**Implementation boundary:** native select versus custom controls, section layout, status placement, and file-picker activation may vary. Immediate preference application, independent persistence, normalized inline backup preview, explicit conflict policy/confirmation, no native confirmation, accessibility, and controller-effect boundaries remain fixed.

**Current mapping:** `ThemeControl`, `ColorSchemeControl`, and `PrimaryAccentControl` in `src/ui/App.tsx` each read/write `localStorage` and mutate document theme state directly. `BackupControls` calls `ThreadStore` and browser file/download APIs directly, then uses `window.confirm` for conflict policy; its current invalid-record message does not match its early-return behavior. The target `SettingsBox` receives normalized state and emits intent, while a settings controller owns application/persistence/download effects and presents validated import outcomes consistently.

### `UnlockBox`

**Capability:** collect one passphrase attempt through a consistent buttonless authentication region.

```ts
type UnlockBoxViewState =
  | { status: "ready"; resetRequestKey: number }
  | { status: "submitting"; resetRequestKey: number }
  | {
      status: "rejected";
      resetRequestKey: number;
      message: string;
    }
  | {
      status: "unavailable";
      resetRequestKey: number;
      message: string;
      retryable: boolean;
    }
  | {
      status: "rate_limited";
      resetRequestKey: number;
      message: string;
      retryAfterSeconds?: number;
    };

type UnlockBoxIntent = {
  type: "passphrase_submitted";
  passphrase: string;
};
```

```text
validated bounded auth state
          |
          v
      UnlockBox
          |
          | passphrase_submitted
          v
authentication controller
  + request/auth boundary
  + safe returnTo validation
  + success navigation
```

**Invariants**

- The box uses one labelled masked input and no submit button. Enter submits one non-empty attempt only when another attempt is not active.
- The passphrase exists only as an ephemeral input draft and immediate intent payload. It never enters view state, URLs, logs, persistence, export, analytics, or bounded public failure messages.
- `submitting` prevents duplicate attempts while retaining a stable, perceivable busy state.
- Rejection increments `resetRequestKey`; the box clears the rejected draft, announces the bounded message, and returns focus to the input. Unavailable/rate-limited terminal attempts follow the same secret-clearing rule.
- Rate-limit state communicates bounded retry timing when supplied and cannot be bypassed by repeated Enter submissions.
- The controller validates same-origin `returnTo`, performs authentication/network work, expires attempt material after the request, and navigates on success. `UnlockBox` never receives or interprets `returnTo`.
- Native password-manager/autocomplete behavior remains available. `Hotkeys` does not steal `:`, Escape, or text-editing gestures from this editable region.
- `StickyHeader(BrandBox)` and shared box styles remain present across entry, rejection, unavailable, and rate-limited states.

**Failure contract:** rejection, rate limiting, and provider/network unavailability remain distinct bounded states without exposing auth internals. Failure never persists the passphrase, strands focus, removes the shared header, or requires a page reload when retry is allowed.

**Implementation boundary:** native password input details, status placement, focus-ref mechanics, and password-manager attributes may vary while buttonless submission, one-attempt serialization, clearing/refocus, secret handling, accessibility, and controller boundaries remain intact.

**Current mapping:** `Unlock` in `src/ui/App.tsx` owns passphrase state, calls `/api/auth/passphrase`, interprets response, validates `returnTo` through `safeReturnTo`, and navigates directly; rejected input remains populated. The target projects bounded auth-entry state through `UnlockBox`, moves effects and return validation to the authentication controller, and uses the same `StickyHeader`/box visual system for all auth-entry states.

### `SystemStatusBox`

**Capability:** present one blocking application-boundary check or bounded unavailability state with an applicable retry intent.

```ts
type SystemBoundary =
  | "auth_session"
  | "provider_status"
  | "thread_storage";

type SystemStatusBoxViewState =
  | {
      status: "checking";
      boundary: SystemBoundary;
      message: string;
    }
  | {
      status: "unavailable";
      boundary: SystemBoundary;
      message: string;
      retryable: boolean;
    };

type SystemStatusBoxIntent = {
  type: "system_boundary_retry_requested";
  boundary: SystemBoundary;
};
```

```text
application startup/boundary state
                 |
                 v
          SystemStatusBox
                 |
                 | retry intent
                 v
       application controller
```

**Invariants**

- The box is used only when an auth-session, provider-status, or thread-storage boundary blocks the requested application route. It never absorbs turn failures, individual thread load/delete failures, settings persistence, backup/import, or ordinary empty states.
- Checking state is non-interactive and politely announced. Unavailable state exposes bounded public copy and a retry control only when `retryable`.
- Retry emits intent; the box never reloads the page, calls a provider/storage/auth API, navigates, or changes the retained destination itself.
- The application controller preserves the originally requested safe route across checks/retries and selects the next page only after the boundary resolves.
- Provider payloads, storage internals, auth details, secrets, and stack traces never enter view state.
- `StickyHeader(BrandBox)` and shared box styling remain present. Status, alert, retry focus, zoom, reduced motion, narrow layout, and screen-reader behavior remain consistent with the other visible boxes.

**Failure contract:** repeated or non-retryable unavailability remains a stable bounded state rather than a reload loop or blank page. A stale retry result cannot replace a newer boundary check or navigate away from the current request.

**Implementation boundary:** progress treatment, retry-control styling, and status copy may vary while narrow boundary scope, retained destination, no-effects behavior, shared visual composition, and accessibility remain fixed.

**Current mapping:** `AuthGate` in `src/ui/App.tsx` currently renders checking, provider-status failure, and remote-storage failure through standalone centered markup whose retry button calls `window.location.reload()`. The target application controller projects those blocking states into `SystemStatusBox`; non-blocking failures stay with their owning box.

All currently agreed layout and layout-control boxes now have initial typed contracts. A final layout consistency pass may still refine shared controller ownership and current → target sequencing after the remaining data/system contracts settle.

## Current → Target Overview

```text
CURRENT

UI Topic component
  ├── navigation and mode policy
  ├── request construction
  ├── stream handling
  ├── thread persistence
  └── layout composition

server/app.ts
  ├── HTTP/auth/SSE boundaries
  ├── lookup orchestration
  └── provider construction

server/research.ts
  ├── mandatory initial search
  ├── extraction
  ├── planner invocation
  ├── optional one-round concurrent search batch
  └── synthesis

TARGET

layout boxes
     |
WorkspaceController
     |
TurnController ──> ThreadStore atomic terminal commit
     |
TurnGateway ===== HTTP/SSE ===== TurnStreamBoundary
                                      |
                                 TurnExecutor
                                  ├── SearchTurn ─────────> SearchProvider
                                  └── ResearchTurn
                                        ├── ResearchResolver
                                        │     ├── ResearchAssessor -> LLMProvider
                                        │     ├── recursive child KnowledgeUnits
                                        │     ├── joinKnowledge (⊔)
                                        │     └── EvidenceAcquirer
                                        │           ├────> SearchProvider
                                        │           └────> ContentExtractor
                                        └── AnswerSynthesizer -> LLMProvider

WorkspaceController owns route and cross-box projection.
TurnController owns browser active/durable lifecycle.
TurnExecutor owns server-side execution dispatch.
TurnStreamBoundary owns authenticated HTTP/SSE transport only.
Layout boxes render typed state and emit semantic intent.
```

## Implementation Plan

The implementation plan is intentionally provisional until all boxes and migration decisions are settled.

1. Finalize data-model contracts: discriminated search/research turns, bounded thread context, evidence ownership, research result/provenance, and storage-record boundary.
2. Finalize remaining system-box contracts: `ThreadStore` revision/idempotency/retention/import behavior and a consistency pass over the settled `WorkspaceController` → `TurnController` → `TurnGateway` → `TurnStreamBoundary` → `TurnExecutor` events/failures.
3. Finalize layout-box contracts and state/intent ownership.
4. Record a precise file-level current → target mapping and migration sequence that preserves observable behavior.
5. Introduce the canonical data model and runtime schemas with compatibility migration and focused domain tests.
6. Extract provider-neutral `SearchTurn` and `ResearchTurn` application orchestration, including the recursive directive interpreter, assessor, knowledge join, evidence acquisition, and synthesizer boxes.
7. Adapt HTTP/SSE, provider adapters, browser controller, persistence, and layout components to the new contracts.
8. Remove obsolete lookup/chat vocabulary and compatibility paths after migration verification.
9. Run full acceptance checks and update `README.md` and `AGENTS.md` to describe the implemented architecture as current state.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` done and verified, `[!]` blocked.

- [~] 1. Architectural contracts — deliverable: approved named data/system/layout boxes with typed inputs, outputs/events, invariants, failure contracts, implementation boundaries, and diagrams; verify: no unresolved contract ambiguity required for implementation.
- [ ] 2. Current → target mapping — deliverable: file-level responsibility and migration map; verify: every current orchestration/persistence/layout responsibility has one target owner.
- [ ] 3. Data-model migration — deliverable: schema-v3 `Thread` aggregate with canonical source catalog, terminal `search | research` discriminated turns, deterministic context/evidence projections, and compatibility migration; verify: domain, schema, storage, import/export, source-identity, and projection tests.
- [ ] 4. System-box refactor — deliverable: `SearchTurn` execution and standardized `ResearchTurn` composed from recursive resolver, typed assessor directives, algebraic knowledge join, evidence acquisition, and synthesis boxes; verify: focused application/provider/orchestration tests across all explicit limits, algebraic laws, and stop conditions.
- [ ] 5. Boundary adaptation — deliverable: `WorkspaceController`, browser `TurnController`, `TurnGateway`, transport-only `TurnStreamBoundary`, server `TurnExecutor`, persistence, and concrete provider adapters use the new contracts; verify: app, storage, event-schema, stale-event, cancellation, commit-retry, UI, interruption, and fixture parity tests.
- [ ] 6. Layout-box refactor — deliverable: agreed layout components consume state and emit intent through explicit interfaces; verify: component, keyboard, focus, responsive, and accessibility tests.
- [ ] 7. Vocabulary cleanup — deliverable: obsolete `lookup`/`chat` mode names and accidental compatibility paths removed while preserving the trailing-`?` `ResearchTurn` macro; verify: repository search plus full typecheck/test/build.
- [ ] 8. Architecture documentation — deliverable: `README.md` human architecture overview and `AGENTS.md` implementation boundaries describe implemented current state; verify: diagrams/contracts match code and links resolve.
- [ ] 9. Acceptance — deliverable: verified v1.1.0 refactor and refreshed plan completion state; verify: lint, typecheck, unit/integration tests, build, e2e, `git diff --check`, and secret inspection.

## Verification

The final implementation must prove at least:

- `Turn` accepts only valid terminal search or research combinations; pending/running execution is represented only by non-persisted controller-owned `ActiveTurn`.
- Insufficient research always carries an insufficient resolution; synthesis failure always carries a sufficient/best-effort resolution; earlier failure/interruption explicitly distinguishes a validated checkpoint from unavailable state and never carries an answer.
- Research failure records/events expose only the approved capability-level synthesis and execution codes with their fixed retryability; adapter details remain sanitized server-only observability.
- Every observed terminal outcome is committed immutably, and retry appends a same-request turn linked to an earlier same-thread terminal through `retryOfTurnId` rather than reopening it.
- A macro-less submission creates a `SearchTurn`; a trailing-`?` submission creates a `ResearchTurn`; neither depends on persistent UI mode.
- `SearchTurn` invokes one search and never invokes extraction or an LLM.
- Every initial and follow-up research question enters the same recursive ResearchResolver and ResearchAssessor interfaces.
- ResearchAssessor uses the dedicated high-reasoning route and returns exactly one validated `resolved | search | decompose(all|any)` directive; AnswerSynthesizer uses the separately configurable balanced streaming route.
- Recursive children return supported `KnowledgeUnit` values and never create child turns or user-facing answers.
- `joinKnowledge` is associative, commutative, and idempotent; concurrent ordering and duplicate/retried knowledge produce equivalent state, while contradictory supported observations are preserved as contested rather than overwritten.
- The application-owned GapLedger gives problems stable IDs, validates support and transitions, selects by priority/depth/creation order, and prevents silent omission or cycles.
- A `resolved` assessor directive performs zero new searches; only a completed root with `sufficient | best_effort` synthesizes, exactly once.
- Decomposition produces one to three prioritized material children with explicit `all | any` semantics.
- Resolution converges to a useful fixed point with zero material gaps when the explicit limits permit.
- No research turn invokes more than three searches, consumes/extracts more than nine additional sources, descends beyond depth two, performs more than eight assessments, or emits more than three child problems per decomposition; each evidence request owns at most three deterministic new-source selections.
- Each search returns at most five candidates; leaf searches and extraction each use a global concurrency bound of three.
- EvidenceAcquirer never assesses, recurses, joins knowledge, or synthesizes; ResearchResolver never emits a user-facing answer or child turn.
- No-new-knowledge, duplicate-problem, exhausted explicit limit/depth, interruption, and provider-unavailable stops are typed and observable.
- Budget exhaustion with useful evidence produces best-effort synthesis with uncertainty; no useful evidence produces insufficient-evidence failure.
- Partial sibling failures preserve viable evidence and provenance.
- Synthesis receives typed bounded thread context and the final root knowledge unit, emits only citations reachable through that unit, and fails on empty output.
- Search and research failures cross boxes as bounded typed failures without provider payloads.
- `WorkspaceController` alone coordinates route/cross-box projections and slash commands, while non-command requests pass unchanged to `TurnController`; neither layout boxes nor workspace routing execute or persist turns.
- `TurnController` allows one execution/commit candidate with no queue, rejects stale/duplicate/gapped events deterministically, validates terminal source-reference closure, persists interruption on cancellation/connection loss, and retries commit without rerunning providers.
- `TurnGateway` validates decoded public events; `TurnStreamBoundary` owns authenticated HTTP/SSE framing, contiguous sequencing, heartbeat comments, and cancellation wiring only; `TurnExecutor` dispatches exactly one provider-neutral search/research execution without loading or writing `Thread`.
- Exactly one legal terminal condition is authoritative: a validated pre-cancellation server terminal or one controller-created interruption; active answer/source deltas never become an independent persistence or rendering path.
- `PromptBox` remains buttonless, keeps its draft editable while one active turn blocks submission, has no queue, clears a collapsed-selection draft with focused `Ctrl+C`, and preserves native copy for selected text and all `Cmd+C` use.
- `Hotkeys` is installed once, emits semantic intents rather than effects, focuses a mounted prompt with passive unmodified `:`, emits cancellation for active-turn Escape, and never steals editable/composing input or invokes navigation/system capabilities directly.
- `TranscriptBox` renders durable and active turns through one ordered view model; active progress/streaming is replaced by matching durable completion without duplicate requests or answers, and initial/follow-up requests use the same path.
- `EvidenceBox` renders one thread-wide canonical set; duplicate sources retain one application-derived stable `SourceId` and display ordinal, citations resolve by ID, occurrences preserve turn/rank/role provenance, and destination-to-evidence promotion does not duplicate an entry.
- `BrandBox` exposes one keyboard/pointer-equivalent activation target and emits only `new_thread_requested`; tagline rotation is non-live and respects reduced motion.
- Every canonical page composes the same `StickyHeader`; its typed contextual actions and feedback remain accessible and never perform effects directly.
- `SettingsBox` has no aggregate Save/Cancel action: each valid preference applies immediately, persists independently through the controller, and remains active but visibly `session_only` when persistence fails. Backup import uses an inline validated preview, safe-default keep/replace policy, opaque stale-safe confirmation ID, and explicit partial report without `window.confirm`.
- `UnlockBox` remains buttonless, serializes attempts, never externalizes passphrases beyond immediate submit intent, and clears/refocuses after bounded rejection/unavailability while preserving password-manager and accessibility behavior.
- `SystemStatusBox` renders only blocking auth-session/provider-status/thread-storage checks or unavailability, preserves the requested route, and retries through intent rather than reload while non-blocking failures remain in their owning boxes.
- Normalizing the same canonical URL across providers, searches, retries, or ranks yields the same collision-safe `SourceId`; provider rank and result-array position never become durable identity.
- `Thread` is the sole durable aggregate root: canonical source metadata/ordinal is materialized once, terminal turns retain contextual refs and bounded evidence snapshots, `EvidenceSet`/`ThreadContext` derive deterministically, and terminal source admission plus turn commit is atomic.
- `/threads` is the only `ThreadsBox` presentation; its pinned `fzf@0.5.2` wrapper produces fixture-locked deterministic rankings/highlights, its local keyboard behavior does not conflict with global hotkeys, and deletion requires inline `y`/Enter confirmation that Escape can cancel without closing the route.
- Existing persistence, export, retention, auth, interruption, stale-request, keyboard, focus, responsive, and accessibility behavior remains green unless this plan explicitly changes it.
- Fixture and live adapters preserve the same provider-neutral contracts.
- `README.md` and `AGENTS.md` describe the code that actually ships.

## Open Questions

- Beyond the approved assessment/synthesis model variables, what environment-variable names expose the explicit balanced `ResearchLimits` while keeping typed names canonical?
- Should the migration fallback from `ANTHROPIC_ASSESSMENT_MODEL` and `ANTHROPIC_SYNTHESIS_MODEL` to legacy `ANTHROPIC_MODEL` remain permanently or be removed after deployment?
- Does `modelRef`/`searchRef` remain on `Thread`, move to turns, or become derived execution metadata?
- Should `StoredThreadEnvelopeV2` be retained as-is, renamed to `StoredThreadRecord`, or reshaped during the model migration?
- After data/system contracts settle, do any layout controller projections need refinement to preserve the agreed box contracts without duplicating state?
