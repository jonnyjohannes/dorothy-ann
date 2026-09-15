# Dorothy Ann — shared remote storage

## Current State

- Status: blocked
- Last updated: 2026-09-15
- Current focus: final acceptance against a configured remote deployment
- Handoff lives in: [`## Handoff`](#handoff)
- Next action: configure non-fixture Upstash credentials, verify two authenticated browser contexts, then close acceptance

## Handoff

The remote-storage design is approved with the simplified no-draft model. Ledger steps 1–5 are implemented: draft persistence and UI autosave are removed, the legacy IndexedDB object store is deleted on upgrade, only completed turns can be committed, the injectable Upstash adapter uses an atomic compare-and-set script with contract coverage, owner-protected thread routes cover commit/load/list/delete/import/export, the browser adapter tracks revisions over same-origin fetch, and UI save retry preserves completed results after remote commit failure. Full unit, lint, typecheck, build, e2e, and diff checks pass. Operator setup is documented and `.env.example` already contains the required non-secret variables. Two-browser manual verification remains blocked until a configured non-fixture Upstash deployment is available.

The deployed authenticated app will share completed threads through Upstash Redis. Active requests, failed/interrupted turns, and export-editor changes remain transient browser state. Appearance settings remain device-local in `localStorage`. Remove `ArtifactDraftStore` and its API/storage implementation rather than building a remote draft system.

Do not add a user model, collaboration behavior, synchronized settings, or persisted in-progress turns.

## Summary

Provide a server-backed implementation of the existing thread storage behavior so the authenticated deployed operator sees the same completed conversation threads across browsers and devices. Use Upstash Redis through a thin server persistence adapter, preserve existing thread validation and seven-day retention semantics, and keep IndexedDB as the local/fixture development store.

Only successfully completed turns are durable. Active, failed, or interrupted work lives in transient React state and is not written to the stored thread. The export workbench remains a local, in-session editor with no autosave or draft recovery.

## Problem Statement

The current `LocalThreadStore` uses IndexedDB, making each browser a separate data island: a completed thread created on one device is unavailable on another, and deployed server instances do not share browser state. The application is intentionally locked to one operator, so a full account and tenant model would add scope without solving a current need.

The current artifact-draft workbench adds a second persistence model for editable report/transcript Markdown. That persistence is not required for the core application and would introduce remote draft indexing, retention, deletion, and conflict behavior. The simplified model treats export editing as transient UI state instead.

## Goals

- Share completed threads across authenticated browser sessions.
- Keep `/threads`, thread loading, thread commits, deletion, and backup workflows on the same selected remote store.
- Preserve the existing `ThreadStore` behavior observable from the UI for durable completed threads.
- Use the existing owner-only session boundary; do not add `userId` fields.
- Store only validated domain objects and bounded backup payloads.
- Preserve seven-day thread TTL from last meaningful completed activity.
- Work on Vercel/serverless runtimes without process-local state or filesystem persistence.
- Keep IndexedDB available for fixture mode and local development.
- Keep appearance settings device-local: theme, color scheme, and primary accent must not be synchronized or included in thread backups.
- Make failed or interrupted requests recoverable through a transient retry message without persisting them.

## Non-Goals

- Multiple users, accounts, tenants, roles, or sharing.
- Collaboration or real-time cross-tab synchronization.
- Offline-first synchronization or conflict-merging UI.
- Public thread URLs or unauthenticated reads.
- Provider payload archival, raw fetched pages, secrets, or session data in Redis.
- Persisted running, failed, or interrupted turns.
- Persisted report/transcript editor drafts or cross-device export editing.
- Synchronized appearance settings or a remote settings API.
- Replacing the existing browser backup format.

## Context

Existing storage contracts live in [`src/ports/storage.ts`](../../src/ports/storage.ts). The browser implementation, including envelope migration, validation, cleanup, TTL, summaries, and backup handling, lives in [`src/adapters/browser/local-stores.ts`](../../src/adapters/browser/local-stores.ts).

The server already has owner authentication and request guards in [`server/app.ts`](../../server/app.ts). Configuration already accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in [`server/config.ts`](../../server/config.ts), and `@upstash/redis` is already a dependency. Current Upstash usage is limited to the login limiter.

The current UI uses module-level local stores in [`src/ui/App.tsx`](../../src/ui/App.tsx). Runtime selection must replace those instances at the application boundary so `/threads`, topic routes, and backup controls all use the intended store. The export workbench becomes transient and no longer depends on a draft store. Appearance controls already use browser `localStorage` and remain outside this change.

There is no automatic migration of existing IndexedDB threads. After remote storage is enabled, the supported migration path is browser backup export followed by remote backup import.

## Decisions

- Use Upstash Redis for the first remote implementation; do not introduce Postgres for this release.
- Use one fixed namespace for the authenticated operator. The session claim remains `subject: "owner"`; no user identifier is serialized into threads.
- Keep domain/application code provider-neutral. Redis access belongs behind a server infrastructure adapter and HTTP routes.
- Use `@upstash/redis` with an injectable narrow Redis interface so server tests do not require live credentials.
- Keep `LocalThreadStore` for fixture/local mode. The deployed non-fixture app selects the remote thread store.
- Remove `ArtifactDraftStore`, `LocalArtifactDraftStore`, draft routes, draft persistence, and draft autosave. Export Markdown is derived from a completed thread and edited only in transient React state.
- Validate at every boundary: HTTP input, Redis reads, thread schemas, backup imports, and bounded sizes.
- Persist only completed turns. A new thread is first written after its first successful completed turn; active requests do not create durable empty or running threads.
- Use optimistic revisions for thread writes. A stale browser receives `409 conflict` instead of silently overwriting a newer thread; the UI reports the conflict and offers reload/retry rather than merging automatically.
- Thread commit, revision validation, record write, sorted-index update, and TTL update must be one atomic Redis operation. A read/compare/write sequence is not sufficient.
- Redis keys contain no secrets or user-controlled path fragments without validation. Thread IDs must pass the existing branded-ID/domain validation before key construction.

## Proposed Solution

### Storage selection

The browser chooses its thread store from runtime configuration:

```text
fixture mode                  → LocalThreadStore
non-fixture + Redis configured → RemoteThreadStore
non-fixture + Redis missing    → fail closed
```

Non-fixture mode requires remote storage credentials and fails closed when they are absent. There is no process-memory fallback. The active store is constructed once at the application boundary and passed to routes, backup controls, and `ThreadStateOwner`.

Appearance settings remain independent:

```text
localStorage: dorothy-ann-theme
localStorage: dorothy-ann-color-scheme
localStorage: dorothy-ann-primary-accent
```

They are not part of Redis records, thread backups, authentication state, or cross-device synchronization.

### Durable thread model

Use a fixed prefix, for example `dorothy-ann:v1:owner:`:

```text
thread:{threadId}  JSON stored thread envelope plus internal revision
threads:index      sorted set: member threadId, score updatedAt epoch ms
```

The internal record is not a new domain contract:

```ts
type RemoteThreadRecord = {
  schemaVersion: 2;
  thread: Thread; // contains completed turns only
  lastMeaningfulActivityAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  revision: number;
};
```

Redis TTL applies to individual thread records. The sorted-set index may contain stale IDs; list/load cleanup must tolerate and remove missing or expired members. A periodic job is not required for alpha behavior.

### Completed-turn lifecycle

During a request, the UI may hold a running turn, streamed answer, research stages, or failure state in React state. These values are not sent to `ThreadStore`.

On successful completion:

1. derive a terminal completed turn from the request result;
2. load the existing thread if this is a follow-up;
3. append or replace the in-memory turn as appropriate;
4. commit the complete thread atomically with an expected revision;
5. update `/threads` from the committed result.

On failure, abort, or interruption:

- show a bounded transient error/retry state;
- do not append the incomplete turn to the stored thread;
- do not create an empty remote thread;
- preserve any already-completed earlier turns.

If the provider succeeds but the remote commit fails, retain the exact completed result in page state and show `not saved — retry`. Retrying commits that result without rerunning the provider.

Lookup-only results are not durable turns and must not be written to the stored thread. Successful chat turns and successful research syntheses are durable completed turns. The implementation must test that lookup-only, failed, aborted, and interrupted requests are excluded while successful chat and research turns are persisted.

### Server HTTP boundary

All routes are under `/api/threads`, use the existing request guard, cache headers, same-origin protection for mutations, and `requireOwner` middleware. Storage routes must be explicitly included in the owner-protected route set.

```text
GET    /api/threads
GET    /api/threads/:threadId
PUT    /api/threads/:threadId       commit completed thread
DELETE /api/threads/:threadId
GET    /api/threads/export
POST   /api/threads/import
```

Thread list returns summaries sorted newest-first. Thread reads return the validated thread plus an opaque numeric `revision`. Writes accept:

```ts
type RemoteThreadCommitRequest = {
  thread: Thread; // completed turns only
  reason: "created" | "turn_completed" | "renamed";
  committedAt: IsoTimestamp;
  expectedRevision?: number;
};
```

A missing thread has an expected revision of `0`. Existing records require an exact revision match. A mismatch returns `409` with a bounded machine-readable error and must not expose the stored thread in the error response.

Import/export routes reuse `ThreadBackup`, enforce request/response byte limits, validate every record, preserve conflict policy (`skip` or `replace`), and never accept arbitrary Redis keys.

### Browser remote adapter

Implement `RemoteThreadStore` against `fetch`, with the same durable `ThreadStore` methods as the local counterpart. It keeps the latest revision per loaded ID for the current page session. On `409`, it surfaces a typed storage conflict so the UI can reload rather than overwrite.

The remote store must:

- send credentials via same-origin cookies, not tokens in JavaScript;
- treat non-2xx, malformed JSON, and schema failures as storage errors;
- preserve local method return shapes for completed-thread operations;
- avoid caching responses;
- bound export/import response sizes;
- never log thread contents or provider payloads.

The export workbench no longer loads or saves an artifact draft. It initializes Markdown from the completed thread or generated answer, edits it in local component state, and supports copy/download/share. Reloading loses unsaved editor changes by design.

### Retention and activity

Meaningful completed thread commits refresh `lastMeaningfulActivityAt` and `expiresAt`; ordinary reads do not extend retention. Expired records are treated as missing and removed from the index opportunistically.

Because drafts are removed, there is no separate draft retention policy and no draft cleanup index. A failed or interrupted request must not refresh thread retention.

### Runtime selection and failure behavior

The server must fail closed in deployed non-fixture mode when remote storage credentials are absent, rather than silently falling back to process memory. Fixture mode remains self-contained for tests and local development. The browser should show a bounded storage error/retry state if the remote store is unavailable; it must not discard a completed thread locally after a failed commit without telling the user.

## Implementation Plan

1. **Simplify durable thread lifecycle**
   - Remove artifact-draft types, ports, local adapter, UI autosave/resume behavior, and draft routes/tests.
   - Change request persistence so only successful terminal turns are committed.
   - Preserve transient retry/error UI and derive export Markdown from completed threads.
   - Verify completed, failed, interrupted, and empty-result request behavior with focused UI/domain tests.

2. **Remote persistence adapter**
   - Add an injectable Upstash Redis adapter under the documented infrastructure boundary.
   - Implement envelope serialization, sorted-set indexing, TTL, validation, stale-index cleanup, and an Upstash `EVAL`/Lua atomic compare-and-set commit.
   - Verify with an in-memory fake Redis contract test covering missing, expired, malformed, conflict, concurrent commit, commit, delete, and list behavior.

3. **Authenticated thread API**
   - Add owner-protected Hono routes and request schemas.
   - Reuse existing thread validation and backup import/export policies.
   - Restrict writes to completed-thread commit reasons and reject persisted running/failed/interrupted turns.
   - Verify unauthorized, malformed, oversized, conflict, missing-credentials, and happy-path HTTP behavior.

4. **Browser remote store and runtime selection**
   - Add the fetch-backed `RemoteThreadStore`.
   - Select remote storage only for configured non-fixture mode; retain local storage for fixture mode.
   - Centralize store construction and pass the selected store to all thread, `/threads`, backup, and export paths.
   - Verify list/load/commit/remove, backup workflows, malformed responses, and 409 handling.

5. **UI recovery and export simplification**
   - Remove persisted draft assumptions and artifact-draft UI state.
   - Ensure active requests remain transient and completed commits update the visible thread.
   - Add concise remote-storage unavailable/conflict recovery with reload/retry behavior.
   - Preserve keyboard, interruption, export, and backup flows.
   - Verify that failed commits do not silently lose a completed authored result.

6. **Deployment and operator setup**
   - Document Upstash database creation, environment variables, namespace/version prefix, rotation, and backup recovery.
   - Add/update `.env.example` without secrets.
   - Verify Vercel and local Node runtime configuration independently.

7. **Acceptance**
   - Run focused contract/API/UI tests, full unit tests, lint, typecheck, build, e2e, and `git diff --check`.
   - Manually verify the same completed thread is visible from two authenticated browser contexts.
   - Verify an appearance change in one browser does not alter another browser’s appearance.
   - Verify fixture mode remains isolated and interrupted/failed requests do not appear in `/threads`.
   - Update this plan’s Current State, Handoff, and ledger before committing and later tagging `v1.1.0`.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` done and verified, `[!]` blocked.

- [x] 1. Simplify durable thread lifecycle — draft persistence removed, completed-only commits enforced, and focused tests pass.
- [x] 2. Remote persistence adapter — injectable Upstash adapter, atomic compare-and-set, TTL/index cleanup, and fake Redis contract tests pass.
- [x] 3. Authenticated thread API — owner-protected routes and HTTP contract tests pass for commit, load, list, delete, import, export, malformed turns, and stale revisions.
- [x] 4. Browser remote store and runtime selection — fetch adapter, revision tracking, same-origin credentials, and fixture/non-fixture selection implemented and focused tests pass.
- [x] 5. UI recovery and export simplification — no-draft export, completed-only lookup behavior, and commit retry are implemented and verified by focused/full UI checks.
- [x] 6. Deployment and operator setup — Upstash/Vercel secret handoff and fixture/non-fixture rules documented; `.env.example` verified.
- [!] 7. Acceptance — repository checks pass, but two-browser remote verification is blocked without configured non-fixture Upstash credentials.

## Risks and Edge Cases

- Two tabs commit the same thread: atomic compare-and-set rejects the stale revision; never silently overwrite.
- Redis record is malformed or has an unsupported schema: treat it as invalid, remove it from the index, and return a bounded storage error or missing result.
- Sorted-set index contains deleted IDs: skip and opportunistically remove them.
- Redis is unavailable: return service-unavailable behavior; do not use process memory in deployed mode.
- Import contains one bad thread among valid threads: report the issue and preserve the existing partial-import contract.
- A large thread or backup exceeds configured limits: reject before Redis mutation.
- Authenticated owner session expires during a request: return 401 and preserve the UI recovery path.
- A request fails after producing transient streamed content: do not persist the incomplete turn; the user may retry.
- A completed commit fails after the provider succeeds: keep the completed result in the current UI, show an explicit save/retry state, and do not pretend the thread is durable.
- A new topic is abandoned before its first successful completion: it must not appear in `/threads`.
- Appearance settings differ between devices by design and must never be treated as a synchronization conflict.

## Operator Setup and Secret Handoff

- Create one Upstash Redis database for the single operator and keep its REST URL/token in the deployment secret store.
- Set `DOROTHY_FIXTURE_MODE=false` in deployed environments. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; non-fixture mode without both values fails closed for remote storage.
- Keep `APP_PASSPHRASE_SCRYPT_HASH`, `SESSION_SIGNING_KEYS`, and `LIMITER_KEY_SECRET` in the server/Vercel environment only. Never expose them through `VITE_*` variables.
- The fixed namespace is `dorothy-ann:v1:owner:`. A future incompatible storage schema must use a new versioned prefix rather than mutating records in place.
- Rotate the Upstash token and other server secrets through the deployment secret manager; do not put live values in `.env.example`, backups, logs, or browser code.
- Existing IndexedDB data is migrated manually: export a browser backup before enabling remote storage, then import it through the authenticated app. There is no automatic migration.
- Verify local Node and Vercel configuration separately with fixture mode and non-fixture credentials/absence cases.

## Implementation Clarifications

- Lookup-only results, including zero-result lookups, are not persisted as turns.
- Successful chat turns and successful research syntheses are persisted.
- Provider failures, aborts, and interrupted requests are not persisted.
- A remote commit failure after provider success retains the exact result for retry and does not rerun the provider.
- Fixture mode uses IndexedDB; non-fixture mode uses remote storage when configured and fails closed when Redis credentials are missing.
- Existing IndexedDB data is not migrated automatically. Users must export a browser backup and import it into remote storage.
- Redis compare-and-set uses an Upstash `EVAL`/Lua operation so revision validation, record write, index update, and TTL update are atomic.
