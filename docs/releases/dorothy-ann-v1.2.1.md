# Dorothy Ann v1.2.1 release inventory

- Status: candidate closed; PR merged and tag pushed. A later read-only plan audit found a successful GitHub Production deployment status for a subsequent commit containing these changes and a responsive Production health endpoint; direct active alias-to-commit mapping was not inspected.
- Candidate branch: `release/v1.2.1` (merged; remote branch retired)
- Candidate PR head: `d91c8ff` (squash-merged as `936c047`)
- Base: `main` at `bb106fb` (`v1.2.0`)
- Package version: `1.2.1`
- Release tag/date: annotated `v1.2.1` on `2026-09-28`, targeting merge commit `936c047`
- Scope: completed v1.2.1 work through `bc965d7`, with that app-wide scrollbar feature removed by revert. Excludes the subsequent route-layout series (`2d9d8f0`, `2a57d0b`, `ac2921c`, `f3118e5`), reserved with `wip/v1.2.2-route-layout` for v1.2.2.

## Release summary

v1.2.1 is a research reliability and operations release. It fixes a long-context follow-up boundary failure, improves bounded assessment recovery and evidence sufficiency handling, and displays streamed synthesis as a provisional non-durable preview. It also adds raw news retrieval, safer research diagnostics, optional privacy-filtered Analytics, and release/runtime housekeeping.

The app-wide accent scrollbar feature (`bc965d7`) and route-scroll/layout/swatches follow-up (`2d9d8f0`, `2a57d0b`, `ac2921c`, `f3118e5`) are deferred to v1.2.2 and preserved on `wip/v1.2.2-route-layout`. The previous small thread-list scrollbar accent styling (`eb399b1`) remains in this candidate; this exclusion is specifically the later app-wide implementation and its dependent follow-up.

## Shipped candidate scope

### Research reliability

- Bound accumulated research evidence before emitting post-resolution state, preventing long-context follow-ups from exceeding the validated research-state schema and aborting before synthesis.
- Hardened Anthropic structured-output compatibility and bounded assessment correction after truncated output; provider-neutral assessment and synthesis capabilities remain separate.
- Enforced a root floor of two distinct usable extracted sources, with bounded charged backfill; insufficient evidence stops without synthesis.
- Kept research assessment surface-free and compact. `/news` is explicit raw article retrieval; metadata/snippets alone do not become research evidence.
- Streamed bounded, explicitly provisional plain-text synthesis while generation runs. The preview clears on terminal or interrupted exit; only the validated answer is durable.

### Search and source presentation

- Added `/news` raw article retrieval and source-provenance cues while retaining shared link normalization, safe extraction, and evidence requirements. Live Brave news-provider behavior was not verified.
- No app-wide custom scroll indicators in this release; native browser scrolling remains.

### Operations, privacy, and release safety

- Added bounded assessment-attempt and selected-source failure diagnostics, research-stage timing, and operational triage guidance. Logs exclude prompts, evidence/provider payloads, and turn identifiers; selected failure logs sanitize URLs.
- Added optional privacy-filtered Vercel Analytics. It is distinct from server research timing and does not provide an Analytics-to-function-invocation join.
- Added deployment-input exclusions for local secrets/generated files, updated runtime/dependency metadata, and documented session-key incident response. Incident response is operational history, not a user-facing feature.

## Completed plan records

- [Long-context research recovery](../plans/archive/dorothy-ann-v1.2.1-long-context-recovery.md) — fixed schema-bound failure and adjacent Anthropic assessment recovery; broader retry UX and release checks remain deferred in the archived history.
- [Two-source synthesis and evidence yield](../plans/archive/dorothy-ann-two-source-synthesis.md) — shipped usable-source floor, bounded backfill, and diagnostics; extraction-yield recovery remains an open concern.
- [Provisional synthesis streaming](../plans/archive/provisional-research-synthesis-streaming.md) — bounded non-durable preview; fixture browser flushing verified, live timing remains external.
- [Research failure diagnostics](../plans/archive/research-failure-diagnostics.md) — selected-source failure classification and assessment/Vercel triage; operator validation remains external.
- [Optional client observability](../plans/archive/client-observability.md) — optional Analytics and research timing shipped; dashboard/Request ID navigation follow-up remains active in [`observability-log-navigation-verification.md`](../plans/observability-log-navigation-verification.md).
- [News discovery](../plans/archive/dorothy-ann-news-search.md) and [news cue alignment](../plans/archive/dorothy-ann-news-cue-alignment.md) — raw news search/provenance shipped; live Brave acceptance remains unverified.
- [Compact web-only assessor](../plans/archive/assessor-compact-web-only.md) and [surface-free assessor proposals](../plans/archive/assessor-surface-free.md) — research remains web-only; `/news` remains raw retrieval.
- [Release hygiene](../plans/archive/dorothy-ann-release-hygiene.md) — bookkeeping and plan-state cleanup.
- [Session signing-key incident response](../plans/archive/session-signing-key-revocation.md) — operational mitigation record; not a product feature. No incident secrets or values belong in release artifacts.

## Verification and release gates

Plan-level fixture and live-provider limits are recorded in each linked plan. Candidate verification after local remediation:

- `npm ci` — passed; 560 packages installed, zero vulnerabilities; reproducible Zod comment patch applied.
- `npm run lint` — passed.
- `npm run typecheck` — passed; now checks the standalone root/API TypeScript config and the app/server project-reference solution.
- `npm test` — 362 passed.
- `npm run build` — passed; Zod/Rollup false annotation warnings are gone. ReactPlayer's provider-specific Mux (533.35 kB), HLS (591.58 kB), and DASH (858.98 kB) chunks remain dynamically loaded and trigger the >500 kB warning. The initial HTML preloads no such chunk; Jonny chose to retain playback and accept these provider-specific lazy-chunk warnings without raising the build threshold.
- `CI=1 DOROTHY_E2E_VITE_PORT=5273 npm run test:e2e -- --workers=2` — 16 passed, 10 opt-in Analytics cases skipped.
- `npm audit` — zero vulnerabilities.
- `git diff --check` — passed after release-gate documentation updates.

Vercel Preview on `62e0546` completed with no function TypeScript errors, install-script warnings, or Node-version mismatch warning; the only build warning is the accepted lazy Mux/HLS/DASH chunk sizes. The Vercel and Preview Comments checks passed on the merged PR head. The archived [Vercel build and Node runtime plan](../plans/archive/vercel-build-node-runtime.md) records these gates and the later read-only Production check: GitHub reports a successful deployment of subsequent commit `1b68496`, and the Production alias health endpoint returned HTTP 200. That does not directly prove the alias's exact commit or Node runtime. Live Brave behavior and live provider timing are not claimed.

## Release identity

- PR: [#15](https://github.com/jonnyjohannes/dorothy-ann/pull/15) — merged to `main` on 2026-09-28.
- Merge commit: `936c0475debb57defc4f656a10ad6534da6f0cbf`.
- Annotated tag: [`v1.2.1`](https://github.com/jonnyjohannes/dorothy-ann/releases/tag/v1.2.1), targeting the merge commit.
- Production outcome: later GitHub deployment success and alias health verified read-only as described above; no Production deploy command was run by this agent, and no direct alias-to-commit mapping is claimed. <|°_°|>
