# Dorothy Ann — prompt search result kinds

## Current State

- Status: implementing
- Verification: focused checks, lint, typecheck, 241 tests, build, scoped diff check, and four isolated-server browser flows pass; two pre-existing contrast checks and repository-wide diff-check remain blocked
- Owner: Dorothy Ann product/domain boundary
- Executor: muscle executor on `release/v1.2.0`
- Last updated: 2026-09-20
- Current focus: resolve or explicitly defer the remaining P6 accessibility and unrelated whitespace blockers
- Next action: decide whether to include the existing light-theme muted-color contrast repair; preserve unrelated `SYNTHESIZER.md` edits
- Branch / PR / session: current working tree on `release/v1.2.0`

## Abstract

Dorothy Ann will use one canonical prompt-input URL, `/threads/new?q=<prompt input>`, for both ordinary research and explicit raw retrieval. Unprefixed input remains research; `/link`, `/image`, and `/video` select one `SearchTurn` result kind through the shared `SearchResultKind = "link" | "image" | "video"` contract. The change preserves the existing `SearchTurn | ResearchTurn` boundary while adding bounded image and video result contracts behind provider-neutral ports.

## Flow

```text
PromptBox raw input ───────────────┐
                                   │ same classifyPromptInput policy
/threads/new?q=<decoded input> ────┘
                    │
                    ├── bare text ──▶ ResearchTurn ──▶ research executor ──▶ durable thread
                    │
                    └── /link|/image|/video query
                           │ SearchResultKind
                           ▼
                      SearchTurn ──▶ SearchProvider ──▶ normalized results
                           │                                  │
                           └────────▶ terminal/store ─────────┴──▶ EvidenceBox
```

`PromptBox` owns draft and suggestion interaction but not command meaning. `WorkspaceController` owns classification and command delegation. The route loader decodes `q` and sends the same raw value through the classifier; it does not infer a result kind from a second URL parameter. `SearchProvider` owns provider selection and normalization behind the provider-neutral `SearchResultKind`; `EvidenceBox` receives only bounded normalized result data. Image and video results must not enter `ContentExtractor` or research evidence as ordinary web pages.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] P1 — reconcile the routing contract
  - Deliverable: update the active v1.1 specification and route/controller contracts so `/threads/new?q=<prompt input>` is the sole canonical prompt-input URL; bare input creates research and `/link`, `/image`, `/video` create raw `SearchTurn`s; remove the dedicated `/search` route/command contract.
  - Verify: `tests/prompt-classifier.test.ts`, `tests/workspace-routes.test.tsx`, UI box tests, and typecheck pass; `/search` route/command is removed from application/UI code.
  - Evidence: shared classifier, one-shot `/threads/new?q` routing, three explicit result commands, and updated route/UI regressions pass.
- [x] P2 — settle and implement `SearchResultKind` in the turn/provider contracts
  - Deliverable: add `SearchResultKind = "link" | "image" | "video"`, retain `TurnKind = "search" | "research"`, carry the result kind through search execution, transport, terminal validation, persistence, and reload, and default migrated existing search turns to `"link"`.
  - Verify: domain schema, migration, gateway, executor, storage, and reload tests prove result-kind preservation and legacy-search defaulting.
  - Evidence: result kind crosses prompt classification, gateway/SSE request, SearchTurn result, schema defaulting, migration, terminal source closure, storage, and reload-compatible records; full suite passes.
- [x] P3 — settle and implement bounded normalized result schemas
  - Deliverable: implement approved discriminated link/image/video result types and adapter normalization with exact bounds, safe URL handling, and provider-payload stripping.
  - Verify: Brave/provider fixtures cover valid results, malformed envelopes, unsafe/overlong URLs, Unicode bounds, optional media metadata, deduplication, and result ordering.
  - Evidence: Brave normalization tests pass for bounded link/image/video records, malformed envelopes, deduplication, ordering, and media metadata. Live smoke exposed that dedicated image/video endpoints return top-level `results`; normalization now matches the official endpoint envelopes (`properties.url` for image identity and `video.duration`/thumbnail metadata) with regressions.
- [x] P4 — settle media identity and durable source metadata
  - Deliverable: implement the approved identity rule for media asset URLs and source-page URLs, and persist enough bounded metadata for EvidenceBox to reproduce link/image/video results after reload without storing provider payloads.
  - Verify: source identity, terminal closure, storage, import/export, reload, and source-order tests cover repeated media, asset/page URL relationships, and metadata bounds.
  - Evidence: discriminated ThreadSourceRecord schemas preserve canonical media identity, source-page metadata, ordinals, closure, and reload-safe bounded records.
- [x] P5 — enforce extraction and presentation boundaries
  - Deliverable: keep only link results eligible for `ContentExtractor`; render all three result kinds through the appropriate `EvidenceBox` presentation while preserving keyboard, focus, activation, accessibility, and responsive behavior.
  - Verify: extraction exclusion tests and UI/browser tests cover link, image, and video result cells, safe activation, empty results, and bounded failures.
  - Evidence: extractor rejects media before fetch; EvidenceBox renders image/video metadata and activation targets; `/link`, `/image`, and `/video` appear on separate command-list lines with no Alt+A assignment; focused UI and full tests pass.
- [~] P6 — run focused and repository verification
  - Deliverable: update README/AGENTS and affected tests/docs after the active plan amendment is accepted; record actual verification and remaining environmental blockers.
  - Verify: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `git diff --check`, and `git status`.
  - Evidence: `npm run lint`, `npm run typecheck`, `npm test -- --run` (241 tests), and `npm run build` pass. A fresh isolated-server Playwright run passes all four functional flows; both accessibility cases expose the pre-existing light-theme `--muted: #666666` on `--paper: #e0e0e0` contrast ratio of 4.34:1. Scoped `git diff --check -- . ':!SYNTHESIZER.md'` passes; repository-wide diff-check remains blocked by the unrelated pre-existing blank line at EOF in `SYNTHESIZER.md`. No files are staged.

## Desired Outcome

A user can configure one external search entrypoint as:

```text
https://dorothy-ann.example/threads/new?q=%s
```

A plain query opens a normal research turn. A query beginning with `/link`, `/image`, or `/video` opens the corresponding raw search turn. Typed PromptBox input and URL-provided input produce equivalent classified requests. Link, image, and video searches use one validated `SearchTurn` lifecycle, preserve their result kind through durable history, and render bounded result-specific metadata without leaking provider payloads or sending media results through page extraction.

## Current Reality

The amendment is implemented in the current working tree:

- `WorkspaceController`, `PromptBox`, and route composition share one classifier for bare research plus `/link`, `/image`, and `/video`; the dedicated `/search` route/command is removed.
- `SearchResultKind` crosses provider options, gateway/SSE transport, execution, terminal schemas, persistence, reload, and migration, with legacy search turns defaulting to `link`.
- `SearchResult` and durable `ThreadSourceRecord` are discriminated link/image/video unions with bounded normalized metadata and common canonical media identity fields.
- Brave web/image/video normalization strips provider payloads, validates safe bounded fields, and preserves deterministic ordering/deduplication.
- Media records remain durable and renderable but are rejected before `ContentExtractor` and never become factual research evidence.
- README, AGENTS, and the active v1.1 plan describe the shipped contract. P6 remains open only for recorded verification blockers.

## Scope

### Goals

- Establish `SearchResultKind` as the provider-neutral vocabulary for returned link, image, or video results.
- Make `/threads/new?q=<prompt input>` the sole canonical prompt-input URL.
- Preserve ordinary research behavior for unprefixed input.
- Route `/link`, `/image`, and `/video` through one shared classifier into one `SearchTurn` lifecycle.
- Add bounded provider-neutral image and video result contracts behind the Brave adapter.
- Preserve result kind and approved metadata through terminal validation, persistence, reload, and EvidenceBox presentation.
- Keep media results out of `ContentExtractor` and factual research evidence unless an existing contract explicitly permits a link-shaped page result.
- Reconcile the active v1.1 plan, repository guidance, README, and tests with the settled contract before implementation.

### Non-goals

- A third durable turn kind or a persistent search/application mode.
- A dedicated canonical `/search` route or a separate result-kind URL parameter.
- LLM assessment, synthesis, or autonomous research selection for these direct search commands.
- Treating image/video thumbnails, titles, or provider descriptions as extracted factual evidence.
- Persisting raw Brave payloads, credentials, embed payloads, or unbounded media metadata.
- Changing the existing research recursion, assessor, synthesis, retention, authentication, or deployment contracts beyond the minimum route/port updates required by this amendment.

## Decisions

- **Shared vocabulary** — `SearchResultKind` has exactly `"link" | "image" | "video"`; `SearchTarget`, `vertical`, and `SearchMode` are not used.
- **One prompt-input entrypoint** — `/threads/new?q=<prompt input>` is canonical. The route passes decoded `q` through the same classifier as PromptBox raw submission.
- **Bare input** — a non-empty unprefixed value creates a `ResearchTurn`, regardless of punctuation.
- **Explicit raw retrieval** — only `/link <query>`, `/image <query>`, and `/video <query>` create `SearchTurn`s. `/search` is not a canonical route or command in this contract.
- **Turn boundary** — all three result kinds remain `SearchTurn`; `SearchResultKind` does not create a third turn kind or persistent application mode.
- **One classifier** — command grammar is implemented once and reused by typed input and URL entry. Unknown slash-prefixed commands are bounded invalid input, not provider queries.
- **Provider boundary** — application and ports use `SearchResultKind`; Brave endpoint names and payload shapes remain inside the concrete adapter.
- **Extraction boundary** — only approved link results may enter web-page extraction. Image and video results are not silently passed to `ContentExtractor`.
- **Migration compatibility** — pre-amendment durable search turns are interpreted as `resultKind: "link"` when migrated or inspected; existing user query content and source identity remain unchanged.
- **Media identity** — image/video `SourceId` is derived from the canonical media asset or video URL. A source-page URL is bounded metadata and does not replace the media identity. Multiple media assets on one page therefore remain distinct; repeated canonical media URLs deduplicate across queries.
- **Durable representation** — normalized media source records live in a discriminated `ThreadSourceRecord` union (`LinkSourceRecord | ImageSourceRecord | VideoSourceRecord`) in the thread source catalog, so result-specific metadata survives reload, export/import, and source closure without widening `CanonicalSource` with optional media fields. Search turns retain typed destination references and the result kind; raw provider payloads do not persist.
- **Activation** — the source page is the primary activation target when available; the canonical media asset/video URL is retained as a secondary activation target. When no source page exists, the media URL is primary.
- **Evidence role** — media results use an explicit media-search-result role and never become ordinary research evidence or ContentExtractor input.
- **User request preservation** — durable user content preserves the raw command input; the normalized provider query is carried separately in execution/search data.
- **Media presentation** — images may show bounded thumbnails; videos show bounded thumbnails without embedding or autoplay. Media activation follows the approved primary/secondary URL policy.
- **Media numeric bounds** — image width and height are positive integers at most `100_000`; video duration is a positive integer number of seconds at most `86_400`. URLs and text use the existing canonical source bounds unless a result-specific field states otherwise.
- **Prompt URL lifecycle** — `/threads/new?q=...` is a one-shot invocation URL. A single decoded, validated `q` is classified and submitted on initial entry using the same policy as PromptBox input. After acceptance, navigation replaces the invocation URL with the resulting durable thread route. Refresh does not replay a consumed invocation; explicitly opening the invocation URL again starts a new request.
- **Prompt URL edge cases** — missing or empty `q` shows an empty new-thread PromptBox and does not create a turn; empty `q` is normalized away. Repeated `q` parameters and malformed decoding produce an inline bounded route error and no execution. Authentication failure/displacement drops the invocation; after unlocking, the user may submit again manually rather than resuming hidden route state.
- **Active-turn behavior** — a URL invocation does not create a hidden queue. If another turn is active, submission is blocked using the existing active-turn behavior.

## Detailed Plan

### Prompt-input routing and command registry

Treat `/threads/new?q=...` as a one-shot prompt invocation. On initial route entry, decode and validate exactly one `q` value, classify it once, and submit it through the same controller path as PromptBox input. Missing or empty `q` renders an empty new-thread PromptBox without execution; repeated parameters or malformed decoding render an inline bounded route error without execution. Once the controller accepts the submission, replace the invocation URL with the resulting durable thread route so refresh does not rerun the request. If authentication displaces the invocation, discard it and require manual resubmission after unlock. If another turn is active, do not queue the invocation.

Define one pure classifier with the following provider-neutral shape:

```ts
type SearchResultKind = "link" | "image" | "video";

type PromptSubmission =
  | { kind: "research"; value: string }
  | { kind: "search"; resultKind: SearchResultKind; query: string };

function classifyPromptInput(value: string): PromptSubmission;
```

The classifier trims the command/query boundary, rejects empty explicit queries, recognizes only `/link`, `/image`, and `/video`, and leaves all other non-command text as research. The route loader decodes one `q` parameter and calls the classifier; it does not introduce a second route-specific grammar.

Update the PromptBox command registry and accessible suggestions to describe the three result forms. Keep command aliases limited to fuzzy matching; execution uses canonical command strings. Update `WorkspaceController`, route composition, browser gateway request construction, and focused route tests together.

### Domain, transport, persistence, and migration

Add `resultKind` to the provider-neutral search execution request and to the durable `SearchTurn` shape wherever terminal reconstruction requires it. Keep `kind: "search"` as the existing turn discriminant. Add strict schema validation for the finite result-kind vocabulary at HTTP/SSE, application, persistence, import, and migration boundaries.

Existing v3 search turns need a deterministic compatibility rule: when no result kind is present, use `"link"`. Legacy migrated search turns must not be reinterpreted as image or video results. Search destination references and canonical source closure remain validated under the existing storage policies.

The durable representation is the typed thread source catalog described in the Decisions section. No implementation should add unbounded optional media fields to `CanonicalSource` as a shortcut.

### Approved normalized result shapes

The following approved bounded shapes are intentionally separated from the current web-page `CanonicalSource` contract:

```ts
interface LinkSearchResult {
  kind: "link";
  sourceId: SourceId;
  rank: number;
  title: string;          // 1..500 Unicode code points
  url: string;            // 1..2,048 safe HTTP(S) code points
  canonicalUrl: string;   // 1..2,048 safe HTTP(S) code points
  displayUrl: string;     // 1..512 code points
  snippet?: string;       // 0..1,000 code points
  publishedAt?: IsoTimestamp;
}

interface ImageSearchResult {
  kind: "image";
  sourceId: SourceId;
  rank: number;
  title: string;          // 1..500 code points
  url: string;            // canonical media identity URL
  canonicalUrl: string;   // canonical media identity URL
  imageUrl: string;       // 1..2,048 safe HTTP(S) code points
  sourcePageUrl?: string; // 1..2,048 safe HTTP(S) code points
  thumbnailUrl?: string;  // 1..2,048 safe HTTP(S) code points
  displayUrl?: string;    // 0..512 code points
  snippet?: string;       // 0..1,000 code points
  creator?: string;       // 0..500 code points
  width?: number;         // positive bounded integer
  height?: number;        // positive bounded integer
  publishedAt?: IsoTimestamp;
}

interface VideoSearchResult {
  kind: "video";
  sourceId: SourceId;
  rank: number;
  title: string;          // 1..500 code points
  url: string;            // canonical media identity URL
  canonicalUrl: string;   // canonical media identity URL
  videoUrl: string;       // 1..2,048 safe HTTP(S) code points
  sourcePageUrl?: string; // 1..2,048 safe HTTP(S) code points
  thumbnailUrl?: string;  // 1..2,048 safe HTTP(S) code points
  displayUrl?: string;    // 0..512 code points
  snippet?: string;       // 0..1,000 code points
  creator?: string;       // 0..500 code points
  durationSeconds?: number; // positive bounded integer
  publishedAt?: IsoTimestamp;
}

type SearchResult = LinkSearchResult | ImageSearchResult | VideoSearchResult;
```

The numeric bounds are settled: `width` and `height` are positive integers no greater than `100_000`; `durationSeconds` is a positive integer no greater than `86_400`. Provider-only identifiers, ranking explanations, raw thumbnails, tracking fields, and payload extensions must be stripped.

### Media identity and durable metadata decision

Media identity is derived from the canonical media asset or video URL. The source-page URL is bounded metadata and does not replace media identity. Duplicate canonical media URLs deduplicate across queries; multiple assets on one source page remain distinct; missing source pages do not prevent media identity. The source page is the primary activation target when available, with the canonical media URL retained as a secondary target; otherwise the media URL is primary.

The thread source catalog stores the complete approved normalized media metadata required to render after reload, export/import, and source closure as the discriminated `ThreadSourceRecord` union (`LinkSourceRecord | ImageSourceRecord | VideoSourceRecord`). Media records carry required common `url` and `canonicalUrl` fields equal to the canonical media asset/video URL; `sourcePageUrl` remains separate presentation metadata. Search turns retain typed destination references and result kind. EvidenceBox renders from durable normalized data rather than transient provider responses. Raw provider payloads never persist.

### Provider and extraction boundaries

Extend `SearchOptions` with `resultKind` and keep `SearchProvider.search` provider-neutral. Brave normalization selects the correct endpoint based on the finite kind and validates the corresponding response envelope, URL fields, text bounds, optional numeric metadata, rank, deduplication, and safe-search behavior.

Keep `ContentExtractor` link-specific. The application must reject or skip image/video results before extraction with a typed non-provider-leak reason; tests must prove that a media URL cannot become an `ExtractedPage` merely because it is an HTTP(S) URL. Direct media search remains a completed search result, not research evidence.

### Presentation and documentation

Update `EvidenceBox` result cells to branch on the discriminated result kind while preserving the existing activation intent and accessibility rules. Image/video cells must expose bounded title, destination, source-page context when available, and appropriate alt/accessible text; they must not expose provider payloads or imply content inspection that did not occur.

The active v1.1 plan's Current State, Handoff, canonical vocabulary, route contracts, PromptBox section, SearchTurn section, implementation ledger, README, and AGENTS have been reconciled before implementation. This child plan is now implementing against that approved contract.

## Verification

### Automated

- Pure classifier tests for bare research, `/link`, `/image`, `/video`, whitespace, empty queries, unknown slash commands, and URL-decoded input.
- Route/controller/browser tests proving typed and `/threads/new?q=...` entry produce equivalent request kinds and values; one-shot submission; replace navigation to the durable thread; missing/empty/repeated/malformed `q`; no replay on refresh/back; auth displacement; and active-turn blocking.
- Domain schema and migration tests proving finite result kinds, `"link"` defaulting for existing search turns, source closure, and invalid-kind rejection.
- Provider fixtures for Brave link/image/video envelopes, malformed responses, overlong Unicode fields, unsafe URLs, duplicate results, invalid numeric metadata, bounded ranks, and empty success.
- Search execution/gateway/SSE tests proving result kind is retained and unknown fields/provider payloads do not cross the boundary.
- Identity/storage/import/reload tests covering the approved media identity rule, first-admission ordering, metadata bounds, and terminal reference closure.
- Extraction tests proving only link results reach `ContentExtractor`.
- EvidenceBox/UI/browser tests for result-specific cells, keyboard/focus behavior, activation, accessible names/alt text, empty results, and bounded failures.

### Manual / operational

- Configure an external search engine to `/threads/new?q=%s` and exercise a plain query plus encoded `/link`, `/image`, and `/video` inputs.
- Visually inspect link, image, and video result cells at responsive widths and with keyboard navigation, reduced motion, and the supported color schemes.
- If live Brave credentials are available, smoke each result kind without recording provider payloads or secrets.

### Not verified / external pending

- Live Brave link/image/video smoke has not run; fixture mode and provider normalization tests pass.
- Fresh isolated-server functional browser flows pass, but both accessibility projects expose the existing 4.34:1 light-theme muted-text contrast ratio.
- Repository-wide `git diff --check` remains blocked only by the unrelated pre-existing `SYNTHESIZER.md` EOF blank line; the scoped implementation diff check passes.
- Visual confirmation of result-kind secondary-action labels remains a non-blocking deployment follow-up.

## Open Questions

- **Active-plan reconciliation** — owner: plan maintainer — complete: the active v1.1 plan and synchronized README/AGENTS describe the shipped prompt-input and search-result-kind contract.
- **Result-kind display identity** — owner: UI/product decision — non-blocking: the executor may choose accessible labels and exact secondary-action presentation for image/video cells while preserving the approved primary source-page activation policy.
