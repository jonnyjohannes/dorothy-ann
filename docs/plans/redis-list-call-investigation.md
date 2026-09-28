# Redis thread-list call investigation

## Current State

- Status: planning; work branch `work/v1.2.2/redis-list-call-investigation` at `release/v1.2.2` base `f2a64c7`; this plan is not integrated, pushed, deployed, or owner-testable on the release branch. Worktree: `../dorothy-ann-v1.2.2-redis-list-call-investigation`. PR: none.
- Operator reports Production deployment `dpl_DY3YEW2uywjfw6wZNENBEPJjRbLC`, `GET /api/storage/threads`, Sep 27 23:55:11.93 GMT-4, Request ID `vdplb-1790567711937-cfdb2250a52d`, HTTP 200, function execution 1.22s, response about 1.3s; External APIs lists many POSTs with no URLs. No per-phase timing or browser waterfall has been reviewed.

## Abstract

Determine whether Redis list work materially accounts for this request's delay before proposing a storage change. The completed [thread-list latency diagnostics](archive/thread-list-latency.md) already ship bounded list timing; the [remote-storage contract](archive/dorothy-ann-remote-storage.md) preserves validated records, retention, and fixture/local selection.

## Flow

Operator request → existing `thread_list_timing` for that invocation + browser Network waterfall if available → separate cause assessment and owner decision; no code changes in this checkpoint.

## Plan Ledger

- [ ] M1 — retrieve and safely summarize the existing `thread_list_timing` for the exact invocation and a comparable `/threads` browser Network waterfall when available; separate measured store phases from other delay, then present evidence and a decision checkpoint. If unavailable, record that limit and request the missing measurements; do not optimize from the External APIs count alone.
- [ ] M2 — only if M1 supports a specific bottleneck and the owner separately approves a scoped implementation item, amend this plan with the contract, tests, and verification before changing code. No implementation is authorized by this draft.

## Desired Outcome

An evidence-backed answer to whether indexed Redis reads/migration/cleanup, rather than other request or browser time, dominate perceived `/threads` latency.

## Current Reality

`RedisThreadStore.listIds()` reads legacy and current sorted-set indexes and conditionally migrates legacy entries (`src/infrastructure/storage/redis-thread-store.ts`). `ThreadStoreBase.list()` serially reads and validates indexed records, then sorts summaries (`src/infrastructure/storage/thread-store-base.ts`). A 200 and many URL-less External APIs POSTs establish neither their Redis identity nor individual/aggregate duration, row count, or causality. The observed function time includes work outside the store; the browser may first await `/api/status` before fetching the list.

## Scope

Read-only measurement and interpretation. No source, Redis/Vercel state or settings, direct key scans, auth mutation, deployment, push, integration, or retention/list algorithm change. Do not retain raw logs, identifying paths, keys, credentials, or thread data.

## Decisions

Use the existing `thread_list_timing` fields (`ids_ms`, `records_ms`, `sort_ms`, `total_ms`, bounded counts and `max_record_ms`), not dashboard metric Sum as a single-request duration. Before any live Vercel read, confirm project `prj_ce8rS67kx52XrVeuyL9QXLB2B0Hp` is `dorothy-ann` Production, then constrain inspection to the given deployment, Request ID and short time window; summarize only safe aggregate timing. No local Vercel link exists at drafting; no live logs were accessed.

## Detailed Plan

- Compare `total_ms` with 1.22s function time and ~1.3s response, then `ids_ms` (legacy index/migration), `records_ms` (serial reads, expiry and validation), and `sort_ms` (in-memory). Compare `ids_count`, `scanned_count`, `returned_count` without assuming actual row count from POST entries.
- Cross-check browser `/api/status` and `/api/storage/threads` request/response timing and render gap. Hypotheses: legacy migration/index work dominates; indexed record reads and per-record validation dominate; or server startup/routing/network/status/parse/render dominates. Stop if the matching log is absent or cannot be safely correlated, timing does not isolate a dominant stage, or the waterfall is missing for a browser-latency claim; report uncertainty and request a fresh comparable capture, not a fix.

## Verification

Match the sanitized log to the exact request; compare phase totals and counts, noting timing rounding/caps and overlapping external trace entries. Record only aggregate findings, not payloads. Any later approved implementation needs focused tests and applicable repository checks.

## Open Questions

- Can the owner provide the existing per-request `thread_list_timing` (only safe numeric fields/outcome) and a browser Network waterfall for an ordinary `/threads` visit, including whether `/api/status` was first-use? These are validation requests, not blockers to describing source behavior.
- Is this request representative of the slow visit, and which measured phase dominates if so? No optimization decision until that evidence is reviewed.
