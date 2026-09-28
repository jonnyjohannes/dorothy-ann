# Redis thread-list call investigation

## Current State

- Status: planning; Jonny approved drafting a narrow optimization proposal, **not implementing it**. Work branch `work/v1.2.2/redis-list-call-investigation` at `release/v1.2.2` base `f2a64c7`; this plan is not integrated, pushed, deployed, or owner-testable on the release branch. Worktree: `../dorothy-ann-v1.2.2-redis-list-call-investigation`. PR: none. Next action: owner reviews the proposed M3 contract before any source change.
- Operator reports Production deployment `dpl_DY3YEW2uywjfw6wZNENBEPJjRbLC`, `GET /api/storage/threads`, Sep 27 23:55:11.93 GMT-4 (Sep 28 03:55 UTC), Request ID `vdplb-1790567711937-cfdb2250a52d`, HTTP 200, function execution 1.22s, response about 1.3s; External APIs lists many POSTs with no URLs. Later operator-supplied `thread_list_timing` samples at Sep 28 04:14–04:37 UTC have no Request IDs and cannot be matched to that earlier invocation. No browser waterfall has been reviewed.
- Those later samples repeatedly show `total_ms` 11,488–12,092, `records_ms` 11,233–11,701 (roughly 95–99% of list time), `ids_ms` 120–544, `sort_ms` 0, `ids_count=scanned_count=180`, and `returned_count=51`; `max_record_ms` ranges about 136–268. The source loops over indexed IDs serially, with two Redis GETs concurrently per row and conditional extra calls. This establishes a real server-list bottleneck for the sampled invocations, not the Redis share of the earlier 1.22-second request, a precise Redis-command count, or browser paint time. The 129 scanned-but-not-returned entries can be missing, tombstoned, or expired; do not identify their type from counts alone.

## Abstract

The later timings identify serial indexed-record traversal as the server-list bottleneck. Propose one small, bounded read-concurrency trial while preserving validation, retention, tombstone, migration, and fixture/local contracts. The completed [thread-list latency diagnostics](archive/thread-list-latency.md) supply measurements; the [remote-storage contract](archive/dorothy-ann-remote-storage.md) remains authoritative for storage semantics.

## Flow

later sanitized timing → propose bounded Redis-only list fanout → owner approval → fixture/contract verification → separately approved Production deployment + new per-request timings; no source change in this planning pass.

## Plan Ledger

- [x] M1 — safely summarize the owner-supplied later `thread_list_timing` samples and distinguish server list from the original invocation and browser latency. Evidence: 180 scanned IDs, 51 returned, ~11.2–11.7s in serial records versus ≤544ms IDs and 0ms sort for later invocations. The exact-request match and comparable browser waterfall are unavailable; request them if attributing the original 1.22s or end-to-end experience. Do not optimize from URL-less External APIs counts alone.
- [x] M2 — draft the narrowly scoped Redis list-read concurrency trial below, with a race-safety gate and fixture/live verification; this is **planning only**. Jonny's “1 yeah” approved the draft, not source changes.
- [ ] M3 — only after explicit implementation approval: implement a bounded four-at-a-time Redis list scan without changing other adapters, list results, migration, writes, export/import, or diagnostic field names. Stop for owner review if preserving expiry/delete race safety requires a wider write/retention contract change.
- [ ] M4 — verify locally, then seek separate approval for any deployment and compare post-deploy per-request timings/counts and error rate to the supplied baseline; keep this plan active until verified and owner signoff.

## Desired Outcome

A source- and fixture-verified way to reduce the ~11.2–11.7s serial records phase without changing which threads list, retention/deletion behavior, or private logging; independently measure any live speedup after a separately approved deployment.

## Current Reality

`RedisThreadStore.listIds()` reads legacy and current sorted-set indexes and conditionally migrates legacy entries (`src/infrastructure/storage/redis-thread-store.ts`). `ThreadStoreBase.list()` serially reads and validates indexed records, then sorts summaries (`src/infrastructure/storage/thread-store-base.ts`). A 200 and many URL-less External APIs POSTs establish neither their Redis identity nor individual duration. Later sanitized store timings independently show ~11.5–12.1s lists dominated by serial per-indexed-ID record work; those samples are not correlated to the earlier 1.22s function trace. `ids_count` includes indexed IDs that do not return a live thread, not an observed count of 180 live threads. The browser may first await `/api/status` before fetching the list.

## Scope

This pass is planning only: no source or Redis/Vercel state changes. A future explicitly approved M3 may alter only list read scheduling in `ThreadStoreBase`/`RedisThreadStore` and focused tests. No direct key scans, unconditional index purge, batch deletion, auth mutation, cache, summary denormalization, schema/TTL/write change, new provider dependency, browser behavior change, deployment, push, or integration. Do not retain raw logs, identifying paths, keys, credentials, or thread data.

## Decisions

Use the existing `thread_list_timing` fields (`ids_ms`, `records_ms`, `sort_ms`, `total_ms`, bounded counts and `max_record_ms`), not dashboard metric Sum as a single-request duration. **Trial proposal:** keep `listIds()` and legacy migration serial; use at most four concurrent indexed-ID reads on Redis lists, default one for IndexedDB/other adapters, retain existing validation/sort/failure semantics. No Upstash pipeline API or stored-summary cache is assumed. Classify 129 non-returning IDs separately; do not remove members from counts alone. Before any live Vercel read, confirm project `prj_ce8rS67kx52XrVeuyL9QXLB2B0Hp` is `dorothy-ann` Production, then constrain inspection to a given deployment/Request ID and short time window; summarize only safe aggregates. No live logs were accessed in this plan.

## Detailed Plan

1. Gate M3 on a fixture test that races an expiring indexed record's list read/cleanup with a fresh commit or replacement. `liveState()` currently calls unconditional `purge()` for expiry; fanout must **not** delete a concurrently refreshed record/index member. If a conditional cleanup cannot be implemented without changing write/retention semantics, stop and amend the plan for owner review, not a fast-but-unsafe release.
2. With approval, make `ThreadStoreBase.list()` use a bounded scan (default concurrency 1), opting Redis into four simultaneous IDs. Preserve the same `liveState` validation, source identity, tombstone and expiry handling, sorted summaries, error codes, and one sanitized `thread_list_timing` per invocation. Await all started work before a failure returns; record `scanned_count` as IDs whose scan started (and settled before return), `records_ms` as wall elapsed for the whole scan, and `max_record_ms` as per-ID elapsed, not the sum. Keep legacy migration, export/import scans, commit/delete, and other adapters unchanged. If safety/validation needs a provider-specific implementation instead, stop for a scoped plan amendment.
3. Extend `tests/storage-v3-adapters.test.ts` fake with delayed reads to prove an upper bound of four, more than one in-flight Redis ID, output ordering, valid/deleted/missing/expired parity, one failed read, no unhandled work, and bounded count-only logs. Add a conditional-purge race fixture if needed and retain shared `storage-v3-contract` behavior. No real credentials or raw records in diagnostic output.
4. Run focused storage/HTTP contract checks, lint, typecheck, unit suite, build, fixture e2e, diff/status. Rebase/retest before any local release integration. After a **separately authorized** production deploy, compare comparable single-request `total_ms`, `records_ms`, counts, and errors—not Hobby metric Sum. No promised speedup or deletion of 129 IDs. To attribute the earlier 1.22s or UI paint, separately correlate its Request ID and browser `/api/status` → list waterfall.

## Verification

Planning check: read the live code and fake contracts; no tests run because this edit changes only the plan. Future M3 gates: bounded in-flight read assertion; identical valid/tombstoned/expired/missing results and final sort versus serial; expiry/commit race proof; failure drains in-flight reads without swallowed errors; diagnostic wall phases/counts and no private fields; full repo checks. Production performance is an external validation gate, not inferred from fixture latency.

## Open Questions

- The later samples identify the serial records phase as dominant for those requests. Is the original 1.22-second invocation representative, or a different build/data state? Its matching Request ID timing and a browser Network waterfall (`/api/status` first-use versus cached) remain needed for exact/end-to-end attribution.
- Jonny approved drafting this plan, not M3 code. Does he approve the proposed four-in-flight Redis-only trial and its race-safety gate, or prefer another limit/approach? Any required change to write/expiry semantics needs a new explicit decision. No Redis mutation or deployment is approved here.

## Handoff

- Plan-only proposal on `work/v1.2.2/redis-list-call-investigation`; M3/M4 stay pending explicit approval. Rebase this isolated branch on the current release integration line before source work or integration. Jonny tests only `release/v1.2.2`; do not push, deploy, run Redis mutations, or claim live speedup from this plan.
