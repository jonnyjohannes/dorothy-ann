# Dorothy Ann — shared remote storage

## Current State

- Status: planning
- Last updated: 2026-09-15
- Current focus: define the single-operator Upstash Redis persistence boundary
- Handoff lives in: [`## Handoff`](#handoff)
- Next action: review this plan, resolve the small API/concurrency decisions, then implement on `release/v1.1.0`

## Handoff

The color-scheme work is complete on `release/v1.1.0`. `main` remains at the `v1.0.0` launch commit. The old `feature/color-schemes` branch was verified identical to `release/v1.1.0` and deleted locally and remotely.

This plan covers only replacing deployed browser-local persistence with a shared, authenticated, single-operator store backed by Upstash Redis. Read `src/ports/storage.ts`, `src/adapters/browser/local-stores.ts`, `src/ui/App.tsx`, `server/app.ts`, and `server/config.ts` before implementation. Do not add a user model or collaboration behavior.

## Summary

Provide a server-backed implementation of the existing thread and draft storage behavior so the authenticated deployed operator sees the same threads across browsers and devices. Use Upstash Redis through a thin server persistence adapter, preserve the existing validation and seven-day retention semantics, and keep IndexedDB as the local/fixture development store.

## Problem Statement

The current `LocalThreadStore` and `LocalArtifactDraftStore` use IndexedDB. This makes each browser a separate data island: a thread created on one device is unavailable on another, and deployed server instances do not share browser state. The application is intentionally locked to one operator, so a full account and tenant model would add scope without solving a current need.

## Goals

- Share threads and artifact drafts across authenticated browser sessions.
- Keep the existing `ThreadStore` and `ArtifactDraftStore` behavior observable from the UI.
- Use the existing owner-only session boundary; do not add `userId` fields.
- Store only validated domain objects and bounded draft/backup payloads.
- Preserve seven-day thread TTL from last meaningful activity.
- Work on Vercel/serverless runtimes without process-local state or filesystem persistence.
- Keep local IndexedDB available for fixture mode and local development.

## Non-Goals

- Multiple users, accounts, tenants, roles, or sharing.
- Collaboration or real-time cross-tab synchronization.
- Offline-first synchronization or conflict-merging UI.
- Public thread URLs or unauthenticated reads.
- Provider payload archival, raw fetched pages, secrets, or session data in Redis.
- Replacing the existing browser backup format.

## Context

Existing storage contracts live in [`src/ports/storage.ts`](../../src/ports/storage.ts). The browser implementation, including envelope migration, validation, cleanup, TTL, summaries, and draft handling, lives in [`src/adapters/browser/local-stores.ts`](../../src/adapters/browser/local-stores.ts).

The server already has owner authentication and request guards in [`server/app.ts`](../../server/app.ts). Configuration already accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in [`server/config.ts`](../../server/config.ts), and `@upstash/redis` is already a dependency. Current Upstash usage is limited to the login limiter.

## Decisions

- Use Upstash Redis for the first remote implementation; do not introduce Postgres for this release.
- Use one fixed namespace for the authenticated operator. The session claim remains `subject: "owner"`; no user identifier is serialized into threads.
- Keep domain/application code provider-neutral. Redis access belongs behind a server infrastructure adapter and HTTP routes.
- Use `@upstash/redis` with an injectable narrow Redis interface so server tests do not require live credentials.
- Keep `LocalThreadStore` and `LocalArtifactDraftStore` for fixture/local mode. The deployed non-fixture app selects remote stores.
- Validate at every boundary: HTTP input, Redis reads, thread/draft schemas, import payloads, and bounded sizes.
- Use optimistic revisions for thread writes. A stale browser receives `409 conflict` instead of silently overwriting a newer thread; the initial UI reports the conflict and offers reload/retry rather than merging automatically.
- Redis keys contain no secrets or user-controlled path fragments without validation. Thread IDs and draft IDs must pass the existing branded-ID/domain validation before key construction.

## Proposed Solution

### Storage selection

The browser chooses its store from the runtime mode/configuration:

```text
fixture mode or local development  → LocalThreadStore / LocalArtifactDraftStore
configured deployed remote mode     → RemoteThreadStore / RemoteArtifactStore
```

The UI continues to depend on the existing ports. It must not import Redis, Hono, Node APIs, or provider SDKs.

### Redis data model

Use a fixed prefix, for example `dorothy-ann:v1:owner:`:

```text
thread:{threadId}       JSON StoredThreadEnvelopeV2 plus internal revision
threads:index           sorted set: member threadId, score updatedAt epoch ms
draft:{draftId}         JSON validated ArtifactDraft
 drafts:index           sorted set: member draftId, score updatedAt epoch ms
```

The internal thread record is not a new domain contract:

```ts
type RemoteThreadRecord = {
  schemaVersion: 2;
  thread: Thread;
  lastMeaningfulActivityAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  revision: number;
};
```

Redis TTL should be applied to individual thread and draft records. The sorted-set indexes may contain stale IDs; list/load cleanup must tolerate and remove missing or expired members. A periodic job is not required for alpha behavior.

### Server HTTP boundary

All routes are under `/api/threads` and `/api/drafts`, use the existing request guard, cache headers, same-origin protection for mutations, and `requireOwner` middleware. Proposed observable routes:

```text
GET    /api/threads
GET    /api/threads/:threadId
PUT    /api/threads/:threadId       commit validated thread
DELETE /api/threads/:threadId
GET    /api/threads/export
POST   /api/threads/import

GET    /api/drafts/:draftId
PUT    /api/drafts/:draftId
DELETE /api/drafts/:draftId
```

Thread list returns summaries sorted newest-first. Thread reads return the validated thread plus an opaque numeric `revision`. Writes accept:

```ts
type RemoteThreadCommitRequest = {
  thread: Thread;
  reason: ThreadSaveReason;
  committedAt: IsoTimestamp;
  expectedRevision?: number;
};
```

A missing thread has an expected revision of `0`. Existing records require an exact revision match. A mismatch returns `409` with a bounded machine-readable error; it must not expose the stored thread in the error response.

Import/export routes reuse `ThreadBackup`, enforce request/response byte limits, validate every record, preserve conflict policy (`skip` or `replace`), and never accept arbitrary Redis keys.

### Browser remote adapters

Implement `RemoteThreadStore` and `RemoteArtifactDraftStore` against `fetch`, with the same port methods as their local counterparts. The remote thread adapter keeps the latest revision per loaded ID for the current page session. On `409`, surface a typed storage conflict so the UI can reload rather than overwrite.

Remote stores must:

- send credentials via same-origin cookies, not tokens in JavaScript;
- treat non-2xx, malformed JSON, and schema failures as storage errors;
- preserve local method return shapes;
- avoid caching responses;
- bound export/import and draft response sizes;
- never log thread contents or provider payloads.

### Retention and activity

Match the local behavior: meaningful thread commits refresh `lastMeaningfulActivityAt` and `expiresAt`; ordinary reads do not extend retention. Expired records are treated as missing and removed from the index opportunistically. Draft retention follows the existing draft policy and must not accidentally keep an expired thread alive.

### Runtime selection and failure behavior

The server must fail closed in deployed non-fixture mode when remote storage credentials are absent, rather than silently falling back to process memory. Fixture mode remains self-contained for tests and local development. The browser should show a bounded storage error/retry state if the remote store is unavailable; it must not discard a locally authored thread silently.

## Implementation Plan

1. **Remote persistence adapter**
   - Add an injectable Upstash Redis adapter under `server/` or `src/infrastructure/` according to repository boundaries.
   - Implement envelope serialization, sorted-set indexing, TTL, revision checks, stale-index cleanup, and bounded Redis errors.
   - Verify with an in-memory fake Redis contract test covering missing, expired, malformed, conflict, commit, delete, and list behavior.

2. **Authenticated thread/draft API**
   - Add owner-protected Hono routes and request schemas in `server/app.ts` or a thin route module.
   - Reuse existing thread/draft validation and backup import/export policies.
   - Verify unauthorized, malformed, oversized, conflict, and happy-path HTTP behavior.

3. **Browser remote stores and runtime selection**
   - Add fetch-backed implementations of `ThreadStore` and `ArtifactDraftStore`.
   - Select remote storage only for configured deployed mode; retain local stores for fixture/local mode.
   - Verify list/load/commit/remove, drafts, backup workflows, malformed responses, and 409 handling.

4. **UI recovery behavior**
   - Replace assumptions that storage is always local.
   - Add a concise remote-storage unavailable/conflict recovery state with reload/retry behavior.
   - Preserve keyboard, interruption, export, and backup flows.
   - Verify no thread content is lost when a commit fails.

5. **Deployment and operator setup**
   - Document Upstash database creation, environment variables, namespace/version prefix, rotation, and backup recovery.
   - Add/update `.env.example` without secrets.
   - Verify Vercel and local Node runtime configuration independently.

6. **Acceptance**
   - Run focused contract/API/UI tests, full unit tests, lint, typecheck, build, e2e, and `git diff --check`.
   - Manually verify the same authenticated thread is visible from two browser contexts and that local fixture mode remains isolated.
   - Update this plan’s Current State, Handoff, and ledger before committing and later tagging `v1.1.0`.

## Plan Ledger

- [ ] 1. Remote persistence adapter — fake Redis contract tests pass
- [ ] 2. Authenticated thread/draft API — HTTP contract tests pass
- [ ] 3. Browser remote stores and runtime selection — adapter/UI tests pass
- [ ] 4. UI recovery behavior — failure/conflict recovery tests pass
- [ ] 5. Deployment and operator setup — configuration and documentation checks pass
- [ ] 6. Acceptance — full repository verification passes

## Risks and Edge Cases

- Two tabs commit the same thread: reject the stale revision; never silently overwrite.
- Redis record is malformed or has an unsupported schema: treat it as invalid, remove it from the index, and return a bounded storage error or missing result.
- Sorted-set index contains deleted IDs: skip and opportunistically remove them.
- Redis is unavailable: return service-unavailable behavior; do not use process memory in deployed mode.
- Import contains one bad thread among valid threads: report the issue and preserve the existing partial-import contract.
- A large thread or backup exceeds configured limits: reject before Redis mutation.
- Authenticated owner session expires during a request: return 401 and preserve the local UI recovery path.
- Draft deletion must not delete its parent thread; thread deletion should remove associated remote drafts where the existing local behavior does so.

## Open Questions Before Implementation

1. Confirm whether remote drafts are required in the first implementation or whether only threads should be shared initially. The plan currently includes both for parity.
2. Confirm the exact deployed-mode switch. Recommended: non-fixture mode requires both Upstash variables and fails closed if absent; fixture mode always uses local stores.
3. Confirm whether a 409 should offer an automatic reload or only an explicit user action. Recommended: explicit reload/retry to avoid surprising loss of local edits.
