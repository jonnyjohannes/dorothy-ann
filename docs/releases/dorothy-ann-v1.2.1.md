# Dorothy Ann v1.2.1 release inventory (candidate)

- Status: candidate prepared; not merged, tagged, or deployment-verified
- Candidate branch: `release/v1.2.1-candidate`
- Candidate commit: `4d1fa26` (reverts app-wide accent scroll indicators)
- Base: `main` at `bb106fb` (`v1.2.0`)
- Package version: `1.2.1`
- Release tag/date: pending
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

Plan-level fixture and local verification is recorded in each linked plan; those separate results do not prove the cumulative candidate passed the complete suite. Candidate verification run in this session:

- `npm ci` — passed; 513 packages audited, zero vulnerabilities.
- `npm run typecheck` — passed.
- `npm run lint` — failed on four ESLint errors in `server/runtime/extraction-log.ts`, `src/application/research-resolver.ts`, and `src/domain/thread-context.ts`.
- `npm test` — 360 passed, 2 failed: Node version assertion expects 22.x rather than 24.x; jsdom computed-color assertion expects hex but receives equivalent RGB.
- `npm run build` — passed with Zod/Rollup annotation warnings and oversized HLS/DASH chunk warnings.
- `CI=1 DOROTHY_E2E_VITE_PORT=5273 npm run test:e2e -- --workers=2` — 16 passed, 10 opt-in Analytics cases skipped.
- `git diff --check` — passed before version metadata update; rerun before finalizing.

The active [`vercel-build-node-runtime.md`](../plans/vercel-build-node-runtime.md) remains blocked: Vercel function build behavior was unverified because project setup was unavailable, and residual build warnings/test blockers remain. Resolve the release-gate decision before merge/tag/deploy. Live Brave behavior and live provider timing are not claimed. No deployment authorization is granted by this file.

## Release identity

After release blockers are resolved and final checks run, record the merge commit, annotated tag, release date, PR URL, and deployment outcome here. <|°_°|>
