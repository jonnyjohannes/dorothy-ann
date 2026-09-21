# Centralize thread retention policy

## Current State

- Status: done
- Verification: verified locally
- Owner: jonny
- Executor: worker
- Last updated: 2026-09-21
- Current focus: centralized seven-day TTL policy is implemented without changing retention semantics
- Next action: none; optional live Redis smoke remains operational follow-up
- Branch / PR / session: release/v1.2.0

## Abstract

Centralize the seven-day thread retention duration and expiry calculation so terminal commit policy and the shared storage base cannot drift. Preserve the existing sliding retention behavior, Redis `PXAT` persistence, IndexedDB lazy expiry, import handling, tombstones, and public storage contracts.

## Flow

```text
domain retention policy ──expiryAt(activity)──▶ commitTerminalTurn
                              └───────────────▶ ThreadStoreBase / Redis / IndexedDB behavior
```

The shared policy is framework-free and may be imported by application and infrastructure layers. Concrete datastores continue to persist/enforce the computed `expiresAt` as they do now.

## Desired Outcome

There is one source of truth for the seven-day duration and timestamp arithmetic. Existing records retain the same expiry semantics: seven days after the latest durable activity, deletion, or import replacement as currently defined.

## Scope

### Goals

- Add a domain-level retention constant/helper appropriate for both application and infrastructure consumers.
- Replace duplicated literals/calculation in `commit-terminal-turn.ts` and `thread-store-base.ts`.
- Preserve all existing TTL behavior and adapter contracts.
- Add focused regression coverage proving the shared duration remains seven days.

### Non-goals

- Do not make TTL runtime-configurable.
- Do not change Redis deployment configuration or key/index strategy.
- Do not change IndexedDB behavior, retention semantics, or public ports.
- Do not alter unrelated UI or research-trail changes.

## Decisions

- Retention policy belongs in framework-free domain code, not a provider or datastore adapter.
- Keep the seven-day value as a code-owned product policy for this slice.
- Preserve the existing `IsoTimestamp` output and date arithmetic semantics.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] T1 — Centralize seven-day expiry calculation
  - Deliverable: shared domain retention helper, consumer updates, and regression coverage
  - Verify: focused storage/contract tests, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`
  - Evidence: `src/domain/retention.ts` now owns `THREAD_RETENTION_MS` and `threadExpiryAt`; application commit and shared storage base import it. Focused storage/retention tests passed (32), full suite passed (260), lint/typecheck/build passed, and repository diff check passed. Redis/IndexedDB adapter behavior remained covered by 22 adapter and 9 contract tests.

## Verification

### Automated

- Storage contract and adapter expiry tests.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`

### Manual / operational

- Confirm no datastore TTL configuration is required beyond the existing Redis credentials/support.

### Not verified / external pending

- No external deployment change is expected; live Redis smoke remains outside this bounded refactor and was not run.

## Open Questions

- None blocking implementation.
