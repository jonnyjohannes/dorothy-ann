# Thread-list latency diagnostics

## Current State

- Status: done (local implementation on `release/v1.2.2`, no deployment/tag). Owner reports slow `/threads` loading and requests a logger plus Vercel metrics for useful timing boundaries. No production diagnosis has been established. `ThreadsRoute` first awaits browser store selection (`/api/status` on first use), then `GET /api/storage/threads`; the remote list calls the inherited `ThreadStoreBase.list()`. Redis `listIds()` migrates any indexed legacy records before reading the current index, and `list()` sequentially reads and validates each indexed thread, then sorts summaries. This can grow with history, but its contribution to the reported delay is unmeasured.
- The archived [`dorothy-ann-remote-storage.md`](archive/dorothy-ann-remote-storage.md) owns shipped persistence semantics. The archived [`research-stage-metric-names.md`](archive/research-stage-metric-names.md) documents metric naming and the Hobby Sum limitation. No retention/list behavior change is approved.

## Decision

- Add an optional turn-free list observer at the infrastructure store boundary, wired only for the server Redis store in Node and Vercel runtimes. One sanitized info log `thread_list_timing` per `store.list()` and fixed Vercel metric names `threads.list.total.wall_elapsed_ms`, `threads.list.ids.wall_elapsed_ms`, `threads.list.records.wall_elapsed_ms`, `threads.list.sort.wall_elapsed_ms` for entered phases. Include bounded `ids_count`, `scanned_count`, `returned_count`, and `max_record_ms` in the log, not metric attributes. `ids` covers Redis legacy index/migrations plus current index; `records` covers serial per-ID read, expiry, identity validation and summary construction; `sort` covers in-memory summary sort. `total` is server store time, **not** network, browser `/api/status`, payload transfer/parsing, or paint. Capture store failures safely and emit no unentered phase; an aborted browser navigation does not cancel the store's list operation. Logs/metrics must never change list results or throw, and no titles, previews, thread IDs, URLs, keys or payloads are logged.
- Keep the one-by-one storage algorithm unchanged for this measurement pass. Use the browser's Network waterfall for `/api/status` and `/api/storage/threads` to compare server/store times against client/network/render time; do not add a browser beacon or custom event without a separate privacy/product decision. Separate metric names let Hobby show phase series but its default Sum adds multiple list loads per bucket.
- No Vercel deployment/configuration/change is authorized. Separately supply an **unexecuted** Upstash `FLUSHDB` command using environment variables, warning it removes all database keys (including login limiter state, current records/index and legacy data); require owner to confirm exact database/environment, export backup first, and prefer app per-thread deletion when only test threads need removing. Do not inspect or print secrets or execute deletion.

## Handoff

- Fixture/local browser storage remains unaffected; only the server Redis store receives the observer. Vercel SDK calls occur only in the Vercel adapter. After separately approved deployment, compare log/counts to the function request and browser Network timing on an ordinary `/threads` visit before deciding whether to change storage.
- Local checks: `npm run lint`, `npm run typecheck`, `npm test` (371 passed), `npm run build` (pre-existing large-chunk warnings), `CI=1 npm run test:e2e -- --workers=2` (21 passed, one existing Chromium route-shell test flaky on first try and passed retry, 10 opt-in telemetry tests skipped), `git diff --check`. No Vercel deployment, dashboard change, Redis lookup, or deletion occurred. The destructive command is provided only in the assistant handoff; it is not executed or stored with credentials.

## Plan Ledger

- [x] T1 — add bounded, nonblocking stage/total list observation; wire sanitized info log and per-stage metric in server runtimes; test success/failure, multiple records, phase omissions, sensitive-field exclusion, and parity with existing store behavior.
- [x] T2 — document measurement interpretation and provide only the safe-to-copy destructive command with safeguards (never execute); run focused and applicable checks, inspect diff/status, archive plan after local verification.

## Open Questions

- Which part actually dominates Production `/threads` latency: first-use status selection, Vercel/runtime/network overhead, legacy migrations, serial Redis record reads, per-record validation, or client render? Timings/Network evidence needed before changing storage.
