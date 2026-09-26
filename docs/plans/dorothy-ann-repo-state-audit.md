# Dorothy Ann — repository state audit

## Current State

- Status: current-state snapshot; informational, not an execution plan
- Last updated: 2026-09-26
- Audited branch: `release/v1.2.1` at `6256189`; `main` and `origin/main` remain at `bb106fb`
- Verification: source state is changing concurrently; no full suite/build/e2e run for this refresh
- Next action: work from the two active implementation plans below; refresh this snapshot when either lands

## Summary

The shipped product and release bookkeeping are aligned through **v1.2.0**: all six release tags exist on `origin`, `package.json` is `1.2.0`, and the v1.2.0 release inventory is written. The release-hygiene plan is complete and archived.

There are two active implementation tracks:

1. **Citation/evidence yield:** enforce a floor of two distinct usable extracted root sources before synthesis, and use measurements to decide whether acquisition changes are warranted. The active plan clarifies this is **not** a two-citation quota or a source-independence test.
2. **v1.2.1 research recovery:** finish browser progress recovery, assess-provider compatibility, and release verification.

The worktree currently contains uncommitted prompt, application, server, and test changes, plus an untracked two-source synthesis plan. The two-source plan records the instrumentation and live observations described below. Those changes are concurrent work, not part of this audit.

## Shipped versions (`git log main`)

`main` has six squashed release commits. Their annotated tags are published to `origin`; for annotated tags, `git ls-remote --tags` shows both the tag-object SHA and the peeled commit SHA (`^{}`).

| Commit | Date | Version | Summary |
| --- | --- | --- | --- |
| `9ca8037` | 2026-09-05 | v1.0.0-alpha0 | Repository foundation: license, README, agent guide, and initial product specification. |
| `d236441` | 2026-09-06 | v1.0.0-alpha1 | Working Vite/Hono prototype: auth, Brave lookup, bounded extraction, Anthropic streaming, SSE, IndexedDB, and fixture mode. |
| `4d55fea` | 2026-09-13 | v1.0.0-alpha2 | Persistent workspace, thread envelope/migration, seven-day expiry, export, and browser shell. |
| `657dc89` | 2026-09-15 | v1.0.0 | Adaptive research launch with bounded additional search before synthesis. |
| `cc04806` | 2026-09-19 | v1.1.0 | Typed domain/application/ports/infrastructure/server/UI architecture; v3 thread aggregate; recursive research with one root synthesis. |
| `bb106fb` | 2026-09-20 | v1.2.0 | Typed link/image/video search, viewport-loaded video playback, root corroboration prompt policy, research footnotes, and retention improvements. |

Current release metadata: `package.json`/`package-lock.json` report `1.2.0`; tags `v1.0.0-alpha0`, `v1.0.0-alpha1`, `v1.0.0-alpha2`, `v1.0.0`, `v1.1.0`, and `v1.2.0` are present on `origin`. [`docs/releases/dorothy-ann-v1.2.0.md`](../releases/dorothy-ann-v1.2.0.md) records the v1.2.0 inventory. v1.2.1 has not shipped or been tagged.

## Active plans and pending work

| Plan | Status | Remaining work |
| --- | --- | --- |
| [`dorothy-ann-two-source-synthesis.md`](dorothy-ann-two-source-synthesis.md) | P1 in progress | P1: collect the representative live/staging sample. P2: add the two-usable-root-source synthesis gate. P3: use measured yield to decide whether bounded extraction backfill or other acquisition changes are warranted. P4: align prompts and complete end-to-end verification. |
| [`patch-research-state-sse-overflow.md`](patch-research-state-sse-overflow.md) | P1–P3 verified | P4: ensure interruption/connection-loss/error exits clear browser progress and provide recovery. P5: verify Anthropic structured-output compatibility or record a deployment blocker. P6: run release checks and write v1.2.1 release documentation. |

### Citation/evidence yield: current evidence and decisions

The two-source plan's opt-in, allowlisted timing instrumentation is implemented as schema v2. Two operator-provided live observations are recorded there: each ended with only one distinct viable root source; one produced a `sufficient` answer from that single source. Across the two observations, 12 sources were selected for extraction, two were viable, six returned `empty_content`, and four `fetch_failed`. This supports investigating extraction yield and gating synthesis; it does **not** establish that unselected candidates would have succeeded or justify backfill by itself.

Before P2, the plan asks the owner to settle whether relevant extracted context sources count (proposed: yes), whether one-source exhaustion should yield an insufficient/retryable result rather than a synthesized best-effort answer (proposed: yes), and how to reconcile the earlier four-source heuristic for complex requests. Its proposed contract is two distinct usable source IDs available to root synthesis; citations need not number two and conflicting evidence may count. No application gate or prompt alignment is complete yet.

The v1.2.1 plan's P4–P6 remain separate; its open retry-semantics question and live-provider/deployment checks still need resolution. P5 may require Anthropic credentials.

## Completed plans and release hygiene

`docs/plans/` now contains the two active plans plus this audit. The other 12 plans—including [`archive/dorothy-ann-release-hygiene.md`](archive/dorothy-ann-release-hygiene.md)—are archived because their planned work is complete. Archived does not mean inaccurate; the status of each plan indicates whether it remains authoritative for shipped behavior or has been superseded.

Resolved since the previous audit:

- Retroactive tags published; H5 verified from the owner's remote listing.
- `package.json` and lockfile version updated to `1.2.0`.
- AGENTS.md and README reconciled with the implementation; keyboard shortcuts documented under their actual implementation.
- Remote-storage plan marked done after owner-confirmed deployed use.
- v1.2.0 inventory written; H7 complete.
- `patch/research-state-sse-overflow` deleted after confirming it had no unique commits beyond `release/v1.2.1`.
- Completed plans moved to `docs/plans/archive/`; links were updated as plans moved.

## Non-blocking follow-ups

Some completed feature plans retain optional manual/live verification notes: live-provider corroboration behavior and a manual multi-search transcript inspection. These are operational follow-ups in archived plans, not open implementation-ledger items. The remote-storage two-browser acceptance is confirmed complete by the owner.

## Verification boundaries

This snapshot was updated while implementation work was present in the working tree. Do not infer that the current worktree is green: the two-source plan records its focused fixture/lint/typecheck/build checks and notes its then-current full-suite prompt assertion failure and two accessibility contrast failures. Re-run applicable checks after the active implementation work lands. This audit itself does not claim a build, full test suite, or e2e run.

<|°_°|>
