# Redis thread-list call investigation

## Current State

- Status: planning; work branch `work/v1.2.2/redis-list-call-investigation` at `release/v1.2.2` base `f2a64c7`; this plan is not integrated, pushed, deployed, or owner-testable on the release branch. Worktree: `../dorothy-ann-v1.2.2-redis-list-call-investigation`. PR: none.
- Operator reports Production deployment `dpl_DY3YEW2uywjfw6wZNENBEPJjRbLC`, `GET /api/storage/threads`, Sep 27 23:55:11.93 GMT-4 (Sep 28 03:55 UTC), Request ID `vdplb-1790567711937-cfdb2250a52d`, HTTP 200, function execution 1.22s, response about 1.3s; External APIs lists many POSTs with no URLs. Later operator-supplied `thread_list_timing` samples at Sep 28 04:14–04:37 UTC have no Request IDs and cannot be matched to that earlier invocation. No browser waterfall has been reviewed.
- Those later samples repeatedly show `total_ms` 11,488–12,092, `records_ms` 11,233–11,701 (roughly 95–99% of list time), `ids_ms` 120–544, `sort_ms` 0, `ids_count=scanned_count=180`, and `returned_count=51`; `max_record_ms` ranges about 136–268. The source loops over indexed IDs serially, with two Redis GETs concurrently per row and conditional extra calls. This establishes a real server-list bottleneck for the sampled invocations, not the Redis share of the earlier 1.22-second request, a precise Redis-command count, or browser paint time. The 129 scanned-but-not-returned entries can be missing, tombstoned, or expired; do not identify their type from counts alone.

## Abstract

Determine whether Redis list work materially accounts for this request's delay before proposing a storage change. The completed [thread-list latency diagnostics](archive/thread-list-latency.md) already ship bounded list timing; the [remote-storage contract](archive/dorothy-ann-remote-storage.md) preserves validated records, retention, and fixture/local selection.

## Flow

Operator trace + later sanitized `thread_list_timing` → bounded server-list diagnosis → correlate a Request ID/waterfall if end-to-end attribution is needed → owner decision on a separate scoped fix; no code changes in this checkpoint.

## Plan Ledger

- [x] M1 — safely summarize the owner-supplied later `thread_list_timing` samples and distinguish server list from the original invocation and browser latency. Evidence: 180 scanned IDs, 51 returned, ~11.2–11.7s in serial records versus ≤544ms IDs and 0ms sort for later invocations. The exact-request match and comparable browser waterfall are unavailable; request them if attributing the original 1.22s or end-to-end experience. Do not optimize from URL-less External APIs counts alone.
- [ ] M2 — only if M1 supports a specific bottleneck and the owner separately approves a scoped implementation item, amend this plan with the contract, tests, and verification before changing code. No implementation is authorized by this draft.

## Desired Outcome

An evidence-backed answer to whether indexed Redis reads/migration/cleanup, rather than other request or browser time, dominate perceived `/threads` latency.

## Current Reality

`RedisThreadStore.listIds()` reads legacy and current sorted-set indexes and conditionally migrates legacy entries (`src/infrastructure/storage/redis-thread-store.ts`). `ThreadStoreBase.list()` serially reads and validates indexed records, then sorts summaries (`src/infrastructure/storage/thread-store-base.ts`). A 200 and many URL-less External APIs POSTs establish neither their Redis identity nor individual duration. Later sanitized store timings independently show ~11.5–12.1s lists dominated by serial per-indexed-ID record work; those samples are not correlated to the earlier 1.22s function trace. `ids_count` includes indexed IDs that do not return a live thread, not an observed count of 180 live threads. The browser may first await `/api/status` before fetching the list.

## Scope

Read-only measurement and interpretation. No source, Redis/Vercel state or settings, direct key scans, auth mutation, deployment, push, integration, or retention/list algorithm change. Do not retain raw logs, identifying paths, keys, credentials, or thread data.

## Decisions

Use the existing `thread_list_timing` fields (`ids_ms`, `records_ms`, `sort_ms`, `total_ms`, bounded counts and `max_record_ms`), not dashboard metric Sum as a single-request duration. Before any live Vercel read, confirm project `prj_ce8rS67kx52XrVeuyL9QXLB2B0Hp` is `dorothy-ann` Production, then constrain inspection to the given deployment, Request ID and short time window; summarize only safe aggregate timing. No local Vercel link exists at drafting; no live logs were accessed.

## Detailed Plan

- Later samples isolate serial record traversal as the major server list cost. Before a change, clarify the contract for safely reducing per-ID round trips (bounded concurrency/batching) and for handling non-returning indexed IDs without weakening tombstone, migration, expiry, and race semantics. Do not infer from 129 non-returning entries that they are all expired or safe to delete.
- If the earlier 1.22s invocation or perceived page time matters, correlate a sanitized exact-request timing and the browser `/api/status` → `/api/storage/threads` waterfall; note the repeated near-paired list logs are separate observed emissions, not proof of duplicate browser requests or their cause. Submit a focused optimization plan/verification contract for owner approval before source changes.

## Verification

Match the sanitized log to the exact request; compare phase totals and counts, noting timing rounding/caps and overlapping external trace entries. Record only aggregate findings, not payloads. Any later approved implementation needs focused tests and applicable repository checks.

## Open Questions

- The later samples identify the serial records phase as dominant for those requests. Is the original 1.22-second invocation representative, or a different build/data state? Its matching Request ID timing and a browser Network waterfall (`/api/status` first-use versus cached) remain needed for exact/end-to-end attribution.
- Does Jonny want a separate, bounded storage optimization plan targeting the measured per-ID traversal? Choose the validation and concurrency/index-cleanup contract before implementation; no Redis mutation or deployment is approved here.
