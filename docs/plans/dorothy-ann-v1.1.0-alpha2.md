# Dorothy Ann post-alpha / alpha2

## Current State

- Status: implementation in progress
- Last updated: 2026-09-08
- Current focus: alpha2 shell refinement is implemented in the working tree; orchestration/recovery and acceptance coverage remain open
- Handoff lives in: [`## Handoff`](#handoff)
- Next action: implement the aligned full-screen launcher, `?` prompt macro, transcript attribution/separators, and reliable thread switching

## Handoff

The alpha2 shell refinement is now implemented in the working tree: `/threads` is a full-screen keyboard launcher, deletion uses two-step `ctrl-x`, prompt submission infers research from terminal `?`, the brand is `DA`, and scrollback uses quiet `you` / `DA` labels with separators. A request-owner seam now rejects superseded commits, but the existing Topic persistence helpers still need to be fully routed through it. Remaining work is completing atomic stage orchestration, corruption/quota recovery, deterministic export coverage, and full alpha2 browser acceptance.

## Retroactive Implementation Record

The following work occurred before this plan was fully used as the continuity record and is now captured here:

- `dcc27ed` — implemented the v2 persisted thread envelope, nested validation, migration, seven-day expiry cleanup, commit boundary, canonical scrollback renderer, and initial Copy/export integration. Verification at the time: lint, typecheck, 41 unit tests, build, and `git diff --check`.
- `a014403` — implemented the first fullscreen-shell pass: persistent bottom prompt, source/research layout, removed mounted sidebar/drawer, and `/settings`, `/new`, `/threads` navigation. Verification at the time: lint, typecheck, 41 unit tests, build, and `git diff --check`.
- `bf6e077` — recorded the launcher/transcript refinement decisions from the subsequent design feedback. No source implementation was included in that commit.

These records are historical continuity, not claims that the remaining orchestration, recovery, or acceptance work is complete.

## Summary

Alpha2 is a post-launch simplification pass for Dorothy Ann. It keeps the essential flow—initial prompt, search results, optional continuation/history, and export—while removing visual and interaction machinery that makes the product feel heavier than the pi.dev flow it should complement. It also replaces best-effort thread persistence with an explicit, testable save/restore contract and a seven-day retention policy.

## Problem Statement

The alpha validates the product loop, but production behavior has exposed two practical problems:

1. The UI presents too many simultaneous choices and does not yet feel like a calm, scrollback-oriented companion to pi.dev.
2. Threads are sometimes saved incompletely or not at all. Follow-up turns can therefore lose their context or fail to attach to the saved conversation.
3. Export has too many moving pieces for the core job of getting useful research context out of the app.

The post-alpha user should be able to open Dorothy Ann, ask one thing, inspect what was found, optionally continue the conversation, and export the useful result without managing application machinery.

## Goals

- Make the primary web experience feel like a simple, mobile-aware scrollback interface that complements pi.dev.
- Keep the prompt/composer at the bottom of the active conversation and make prior results/history retrievable by scrolling upward.
- Make saved threads reliable: a restored thread contains the complete committed search state, evidence state, conversation, and relevant failure/recovery state.
- Ensure follow-up prompts always target the restored active thread and are persisted atomically with their completed result.
- Retain saved threads for seven days, with an explicit and deterministic expiry policy.
- Reduce export to the smallest useful flow while preserving source provenance in deterministic Markdown output.
- Keep settings as the home for secondary controls such as appearance, backups, and retention/storage information.
- Preserve the bridge to pi.dev: exported artifacts should remain ordinary, useful Markdown.

## Non-Goals

- Remote thread storage, account sharing, cross-device sync, or permanent memory.
- A native mobile application or offline-first synchronization.
- New providers, autonomous research, hidden context compaction, or a general coding-agent interface.
- Rich document editing, arbitrary message/source selection, folders, tags, or topic archiving.
- Rebuilding every deferred alpha architecture item unless it is required to make the alpha2 contracts reliable.
- Adding UI controls for provider/model/research-depth tuning.

## Context

The alpha plan is the current behavioral baseline: [`dorothy-ann-v1.0.0-alpha.md`](./dorothy-ann-v1.0.0-alpha.md). The current implementation already has:

- a React/Vite shell with home, topic, settings, drawer, evidence, and export routes;
- lookup and research result rendering;
- follow-up chat via `/api/turn`;
- IndexedDB `LocalThreadStore` and `LocalArtifactDraftStore`;
- deterministic answer reports and transcripts;
- browser-local backups and artifact drafts.

The main risk is not lack of features; it is that the UI has several parallel representations of state. For example, `Topic` currently renders network state while separately calling `saveTopic` and `appendChatTurn`; a reload can therefore observe a partial or stale representation. The current store validates only the outer thread shape, and the current database has no expiry metadata or cleanup policy. The current export workbench is useful but exposes answer report, transcript, draft, share, copy, download, and backup concerns too close to the primary conversation flow.

## Decisions

### Confirmed direction

- The product should be bare-bones first, with additional affordances layered back only when needed.
- The essential flow is: initial chat box → search results → optional chat continuation/history → export.
- Settings should contain secondary controls.
- Saved threads should expire after seven days.
- The complete recoverable search and conversation state belongs to the saved thread, not only to a summary or the latest answer.

### Confirmed alpha2 choices

- Use one continuous scrollback-first topic surface: query, progress, results, answers, and follow-ups share one stream.
- Remove the persistent lookup/research mode control from the primary shell. Keep inference-first routing: ordinary input uses lookup, terminal `?` implies research, and explicit research remains a secondary action.
- Renew the seven-day retention window from the last meaningful user action; background autosaves do not renew it.
- Make export a direct “print this topic to file” action: serialize everything shown in the active scrollback from the initial query through all responses into one Markdown file. Do not add a report/transcript chooser.
- Treat the active scrollback as a growing Markdown document: the UI renders the canonical Markdown progressively as committed content arrives, rather than maintaining a separately shaped export view.
- Provide a top-right `Copy` action for the scrollback. Copy and file export use the exact same canonical Markdown serialization, so the copied artifact and downloaded file cannot drift.

### Confirmed alpha2 choices (continued)

- Keep the composer always available: fixed at the bottom on desktop and sticky/compact above the mobile keyboard and safe area.
- Render compact inline source results in the stream, with on-demand source details rather than an always-open evidence panel.
- Restore all committed in-progress stages after reload, including source and extraction outcomes plus failed/interrupted state; discard only transient streamed assistant prose.
- Preserve a saved thread's original expiry when importing a backup. Legacy backups without expiry receive seven fresh days.

### Confirmed alpha2 choices (final)

- Save a versioned thread envelope after every meaningful state transition, not only after final synthesis.
- Expired threads are silently removed from normal navigation; retention information lives in Settings.
- Keep export as one primary topic action rather than persistent report/transcript buttons in the conversation stream.

## Proposed Solution

### Overview

```text
home
  └─ bottom prompt
       └─ committed topic scrollback
            ├─ query / progress / ranked sources
            ├─ researched answer
            ├─ optional follow-up turns
            └─ one Export action

settings
  ├─ appearance
  ├─ backup / restore
  └─ storage + retention information
```

The topic route becomes the source of truth for the active conversation. The UI renders from a loaded thread plus a small explicit transient operation state. Network operations use stable thread/turn IDs and commit state transitions through one persistence boundary. The browser store owns seven-day expiry and removes expired full records, summaries, and related drafts transactionally.

### UI simplification

The default shell should prioritize reading and composing. The selected interaction model is one continuous scrollback stream, with inference-first routing and no persistent mode chip:

- a small header with topic identity and only essential navigation;
- a single vertically scrolling conversation/results stream;
- a sticky or naturally bottom-anchored composer that remains usable on narrow screens and above the virtual keyboard;
- source links shown as compact result items in the stream, with detailed evidence hidden behind an explicit affordance;
- follow-up history rendered as ordinary turns in the same stream, not as a separate chat panel;
- one primary export action for a completed topic/answer;
- topic list, settings, backup, and retention controls behind secondary navigation.

The design should feel closer to a full-screen terminal scrollback than a dashboard. This does not mean literal terminal styling: preserve readable typography, links, focus indicators, mobile safe-area handling, and screen-reader semantics.

The normal screen should not show all of the following simultaneously: topic drawer, evidence column, mode controls, multiple export links, backup controls, and a separate chat workbench. Those remain available through deliberate secondary actions.

### Saved-thread contract

Alpha2 uses one application operation for committing a thread transition:

```ts
type ThreadSaveReason =
  | "created"
  | "query_started"
  | "lookup_completed"
  | "research_stage"
  | "turn_completed"
  | "turn_failed"
  | "turn_interrupted"
  | "renamed";

interface ThreadCommit {
  thread: Thread;
  reason: ThreadSaveReason;
  requestId?: string;
  committedAt: IsoTimestamp;
}

interface ThreadStateWriter {
  commit(input: ThreadCommit): Promise<Thread>;
}

interface ScrollbackArtifact {
  markdown: string;
  filename: string;
  sourceUpdatedAt: IsoTimestamp;
}

function renderThreadScrollback(thread: Thread): ScrollbackArtifact;
```

`ThreadStateWriter.commit` is the single application persistence boundary for active-topic transitions. The exact adapter may delegate to `ThreadStore.save`, but UI components must not independently save competing projections. The contract must guarantee:

- a thread ID exists before network work begins;
- the user turn and stable turn/run IDs are committed before a request can produce a result;
- each accepted stream event updates the same thread/run rather than creating a parallel UI-only copy;
- completed assistant content, research sources/extraction outcomes, status, usage, and failure metadata commit atomically;
- a follow-up loads the current full thread, appends one new user turn, and writes the completed assistant turn back to that same thread;
- late events from an aborted or superseded request cannot overwrite a newer committed state;
- reload reconstructs the last committed state and never promotes transient prose to a completed answer.

The stored envelope is version 2 and carries retention metadata. The design must preserve provider-neutral serialization and validate the full nested object at the persistence boundary, not merely `turns: Array`.

#### Request identity and stale commits

`requestId` is a transient client/application identity, not persisted thread content. Each active network operation gets a unique request ID tied to its stable thread/turn/run IDs. The active topic owner records the latest request ID per operation; stream events are accepted only when their request ID still matches. A commit from an aborted, superseded, or stale request is ignored or returns a typed `StaleCommitError` and must not overwrite the newer committed thread. Reload does not resume an in-flight request; it restores the last committed state and requires an explicit retry.

For implementation, the writer contract is:

```ts
interface ThreadStateWriter {
  commit(input: ThreadCommit): Promise<Thread>;
}
```

The writer validates and atomically persists accepted commits. Stale-event comparison belongs to the application/topic owner immediately before calling `commit`; the persistence adapter remains provider-neutral and does not persist request IDs.

### Seven-day retention

Saved thread records use this retention envelope:

```ts
interface StoredThreadEnvelopeV2 {
  schemaVersion: 2;
  thread: Thread;
  lastMeaningfulActivityAt: IsoTimestamp;
  expiresAt: IsoTimestamp; // lastMeaningfulActivityAt + 7 days
}
```

Meaningful activity is `created`, `query_started`, `lookup_completed`, `research_stage`, `turn_completed`, `turn_failed`, `turn_interrupted`, or `renamed`; background draft/autosave writes do not renew it. On list/load/open/save, expired records are ignored or removed. Cleanup removes the full thread, summary, and associated artifact drafts in one transaction. V1 backups migrate with seven fresh days; V2 backups preserve `expiresAt`.

### Export simplification

The active topic is a growing Markdown document rendered as scrollback. The UI and export path share one canonical serializer:

1. serialize the active scrollback from the initial query through every committed response;
2. include the visible search results/source links and conversation content needed to preserve provenance;
3. render that Markdown progressively in the topic stream with safe Markdown rendering;
4. show a top-right `Copy` button that copies the exact canonical Markdown string;
5. show a top-right `Export` button that downloads that exact same string as one `.md` file;
6. leave the saved topic unchanged.

There is no separate report format, export workbench, or alternate serialization in the alpha2 flow. Copy and download should share the same pure rendering function and filename policy. Backup import/export is not part of normal export and belongs in Settings.

## Implementation Plan

1. **Agree the alpha2 product contract.** Finalized in this document: one scrollback shell, inference-first routing, seven-day activity TTL, committed-stage restore, and direct Markdown export.
2. **Define a single persisted thread state model.** Specify schema/version changes, nested validation, retention metadata, commit reasons, request identity, and migration behavior. Add focused domain/port tests before changing the UI.
3. **Unify topic orchestration and persistence.** Route lookup, research stages, follow-up chat, interruption, retry, and reload through one thread state owner. Ensure every committed transition updates the full thread and summary atomically, and stale request IDs cannot commit over newer state.
4. **Implement seven-day cleanup and recovery.** Add lazy/eager expiry cleanup, unavailable/quota/corrupt-record handling, import/export retention rules, and deterministic tests for all storage boundaries.
5. **Implement the keyboard-first fullscreen shell.** Build the full-height `/threads` launcher with exact slash-command parsing, ctrl-x delete/confirm, focus restoration, active-thread route replacement, `DA` home navigation, no top-right mode/title metadata, Enter-driven `?` prompt routing, square prompt emphasis, canonical visible transcript, quiet `you` / `DA` attribution, and horizontal turn separators.
6. **Reduce export to one topic-level flow.** Reuse the same deterministic scrollback renderer for the growing Markdown view, Copy, and direct `.md` download; do not add an editor, chooser, or report workbench.
7. **Run alpha2 acceptance and update the alpha2 ledger.** Verify reload at every meaningful stage, follow-up continuity, expiry, mobile layout, export recovery, and no loss of committed state.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` done and verified, `[!]` blocked.

- [x] 1. Product contract — deliverable: final scrollback UI, TTL, restore, and export decisions in this plan; verify: decision review plus transition matrix.
- [x] 2. Persisted state contract — deliverable: versioned envelope, nested validation, migration rules, and commit boundary; verify: domain/port contract tests and migration fixtures.
- [~] 3. Reliable thread orchestration — deliverable: one owner for lookup/research/chat state and atomic committed transitions; current: request identity owner added and stale event callbacks ignored; remaining: route every transition through the owner and persist committed intermediate stages; verify: reload/follow-up/race/interruption tests.
- [ ] 4. Seven-day retention/recovery — deliverable: expiry cleanup, corrupt/quota/unavailable behavior, and backup semantics; verify: fake IndexedDB tests with clock control.
- [x] 5a. Initial scrollback UI — deliverable: fullscreen shell with persistent bottom prompt, sourcesBox/researchBox layout, no sidebar, and slash-command navigation; verify: focused UI tests, lint, typecheck, and production build passed.
- [~] 5b. Launcher/transcript refinement — deliverable: full-height `/threads` launcher with deletion, Enter-driven `?` macro, square emphasized prompt, compact metadata, and `you` / `DA` turn treatment with separators; current: launcher, two-step keyboard deletion, route replacement, prompt macro, brand/header, and canonical attribution/separators implemented; remaining: focused responsive/browser acceptance coverage.
- [~] 6. Minimal export — deliverable: one topic export entry point using the canonical scrollback Markdown renderer with Copy and direct download; current: visible/copy/download paths share `renderThreadScrollback`; remaining: byte-identical and failure-path tests plus removal of legacy workbench from the primary flow.
- [ ] 7. Alpha2 acceptance — deliverable: updated docs, verification record, and clean branch milestone; verify: lint, typecheck, unit, build, E2E, `git diff --check`.

## Verification

- A newly submitted query has a stable thread/turn ID before network work begins.
- Refresh during lookup, source collection, extraction, synthesis, follow-up streaming, and after completion restores the last committed complete state.
- A completed follow-up appears in the same restored thread and receives the full intended prior context.
- Aborted, stale, duplicate, or out-of-order events cannot overwrite a newer thread state.
- `/threads` selection replaces the active route/thread and restores the selected thread rather than leaving the previously open thread mounted.
- `ctrl-x` requires a second `ctrl-x` confirmation, deletes the focused row and related records, and restores focus predictably.
- An expired thread and all related records are absent after cleanup; an unexpired thread remains restorable.
- Corrupt records are isolated without preventing other topics from loading.
- Mobile users can read upward through the stream and compose at the bottom without horizontal overflow or inaccessible hidden controls.
- The topic stream renders as growing, safe Markdown; the visible scrollback, Copy action, and downloaded `.md` file are all driven by the same deterministic Markdown serialization.
- Copy and Export produce byte-identical canonical Markdown for the same committed thread state and never mutate the source thread.
- Settings contains backup/storage/retention controls without crowding the primary topic flow.
- Existing provider-neutral and security invariants from the alpha plan remain intact.

## UI Pivot: Fullscreen Scrollback Shell

The implementation direction is refined as follows:

- The prompt box is permanently anchored at the bottom of the viewport, in the spirit of pi.dev fullscreen mode.
- The prompt box has no lookup/research buttons or selector. Enter submits the prompt; ordinary input performs lookup and a terminal `?` selects research.
- The primary topic surface has two named regions: `sourcesBox` for Brave ranked results and `researchBox` for the growing canonical Markdown transcript.
- After lookup, `sourcesBox` occupies the full content width. Research is reached through the continued conversation in the persistent prompt box.
- After research begins or completes, `researchBox` occupies roughly three quarters of the desktop content width and `sourcesBox` occupies the remaining quarter. Citations point to indexed source entries in `sourcesBox`.
- The topic drawer/sidebar is removed from the primary UI entirely.
- Slash commands are the secondary navigation mechanism. Recognize only exact `/settings`, `/new`, and `/threads` commands after trimming the submitted input. `/settings` routes to Settings, `/new` starts a fresh topic, and `/threads` opens a selectable saved-thread list. Unknown slash input becomes a normal visible error/status message and does not trigger navigation.
- `/threads` should feel like the tmux session launcher: a nearly full-width and full-height launcher with heavy centered padding, keyboard-first reverse-ordered recent items, clear selection/focus, a legend, and an explicit empty state. It remains browser UI, not a shell/fzf integration. Selecting a row must replace the current route/thread state, not merely open correctly from the homepage.
- Backup controls remain in Settings rather than the topic shell.

These are a UI/UX refinement of alpha2, not new persistence or provider scope. The implementation should preserve the existing canonical Markdown, thread TTL, and committed-state contracts.

### Launcher and transcript refinement

- `/threads` is a full-viewport launcher overlay: nearly full width and height, generous outer padding, centered content/list, keyboard-first selection, and a visually calm tmux/fzf-inspired presentation.
- Thread selection and deletion are keyboard-first. Thread rows are selectable but have no clickable delete control. `ctrl-x` arms deletion for the focused row; a second `ctrl-x` confirms and removes it. The launcher legend must show `ctrl-x delete · ctrl-x confirm`; no mouse-only confirmation affordance is added. After deletion, focus moves to the nearest remaining row; deleting the active thread routes to a fresh home state.
- The prompt bar has no visible lookup/research buttons or selector. Submission is Enter-driven: ordinary input performs lookup; a terminal `?` selects research. The prompt bar keeps a short hint explaining the `?` macro and should receive stronger visual emphasis without rounded borders.
- Remove the `Saved` kicker and `Saved topic` placeholder/title treatment from restored topics. The topic query/title should be the primary identity. The visible stream and the copied/downloaded artifact use the same canonical Markdown serialization, including its deterministic frontmatter; do not create a separate metadata omission/projection rule for this pass.
- In research mode, the transcript/researchBox is the left three-quarter column and sources/evidence is the right one-quarter column. This relationship must hold for the active stream, not only for an export rendering.
- Replace literal `User` / `Assistant` headings with quiet `you` / `DA` labels and a simple alignment/rule treatment. The visible labels are paired with explicit accessible labels such as `message from you` and `message from Dorothy Ann`; no clickable attribution controls are introduced.
- Remove the top-right `{mode} · {title}` header metadata. The top-left `DA` brand links back to the home screen.

### Message attribution decision

Use quiet labels: small ordinary-weight `you` and `DA` labels with distinct alignment/rule treatment. The UI shorthand is `you` / `DA`, with accessible full labels available to assistive technology. Conversation marks and edge-only treatment are deferred.

Insert a horizontal `---` separator between committed turns in the visible scrollback and in the canonical Markdown serialization, so separate exchanges remain easy to scan and copied/exported output preserves the same rhythm.

## Open Questions

None. The alpha2 product contract and fullscreen-shell refinement are ready for implementation.

Final decisions carried into implementation:

- one continuous scrollback stream;
- inference-first query routing with no persistent mode chip;
- always-available bottom composer;
- compact inline sources with on-demand details;
- all committed intermediate stage state restores after reload;
- seven-day TTL from meaningful activity;
- expired threads silently leave normal navigation;
- imported backups preserve expiry, with seven fresh days only for legacy records without expiry;
- direct transcript-style export of the active topic;
- the stream is rendered from growing canonical Markdown;
- Copy receives the raw canonical Markdown and Export downloads byte-identical Markdown;
- no export editor, chooser, report format, or workbench;
- Settings contains appearance, backup/restore, and retention information.
