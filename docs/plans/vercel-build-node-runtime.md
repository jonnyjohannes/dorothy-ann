# Vercel build correctness and Node runtime tune-up

## Current State

- Status: implementing
- Verification: Node 24.17.0 `npm ci`, lint, typecheck, 362 tests, build, 16 isolated fixture e2e tests (10 optional Analytics skips), and `npm audit` pass after local fixes. Build still warns for three provider-specific dynamic media chunks; PR #15's earlier Preview passed at `ed1526f`.
- Owner: Jonny
- Executor: implementation worker on `release/v1.2.1`
- Last updated: 2026-09-27
- Current focus: Jonny chose to retain Mux/HLS/DASH playback and accept their provider-specific lazy-chunk size warnings; no warning thresholds are suppressed. Local fixes are ready for a fresh PR Preview.
- Next action: commit and push the verified candidate to PR #15, confirm the updated Preview, then prepare release/merge steps. Production deployment remains separately gated on exact-command approval.

## Abstract

Make the Vercel deployment build type-check the same strict TypeScript contracts as local development, eliminate the reported diagnostics and the listed build/install warnings without weakening checks, and align the runtime to Node 24.x. Verify the complete build locally, then deploy the verified result to Production after the exact command, target project/environment, and expected effect are shown and separately approved.

## Flow

```text
root tsconfig ──strict compiler options──▶ Vercel API function build
       │                                      │
       └──project references──▶ local typecheck└──▶ clean Vercel build

package.json engines + Vercel project runtime ──selected major──▶ Node runtime
```

The browser app and Vercel API function are built in separate steps. The log's first `npm run build` (TypeScript project build plus Vite) completes; later Vercel function bundling/type analysis reports the errors. Root `tsconfig.json` currently contains only project references and no compiler options, while the referenced app/server configs each set `strict: true`. Function tooling that reads only the root config therefore sees TypeScript's non-strict defaults.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] P1 — align root compiler settings with the strict project configs used by local checks.
  - Deliverable: Vercel function type analysis uses strict null checking, with no suppression or weakened check.
  - Verify: reproduce the reported Vercel function build locally; run `npm run typecheck`, `npm run build`, and `vercel build` and confirm all listed server/schema errors are gone.
  - Evidence: root `strict: true` preserves project references; Node 24.17.0 typecheck and build pass with no TS diagnostics. PR #15's Vercel Preview passed at `ed1526f` with this strict root configuration, resolving the previous remote function-build failure on that candidate.
- [~] P2 — select and align the Node runtime target across repository pins.
  - Deliverable: update both `package.json` `engines.node` and `mise.toml` `[tools].node` to Node 24.x; assess Node 24 compatibility for this app and its dependencies before changing them. Check for a Vercel project-level runtime override and do not change Vercel-side settings without separate explicit approval.
  - Verify: `mise` selects Node 24, `package.json` declares the matching supported range, and local Vercel build output resolves to Node 24; run applicable repository checks under that runtime.
  - Evidence: both repository pins declare Node 24; `mise exec node@24.17.0` selected v24.17.0. Clean install, app build, and e2e smoke ran there. PR Preview passed for the prior candidate; the explicit project runtime override has not been inspected.
- [x] P3 — resolve reported warnings and dependency notices, recording the accepted lazy-media exception.
  - Deliverable: remove Zod/Rollup false annotation warnings, deprecated package notices, and npm audit findings; retain HLS/DASH/Mux playback through lazy provider loading without suppressing size diagnostics. Record provider-chunk warnings as intentional and accepted.
  - Verify: clean install has no deprecation notices; Zod warnings are absent; initial app chunks remain under 500 kB; provider chunks are dynamically loaded only for supported in-viewport video; `npm audit` is clean; tests cover loading/fallback behavior.
  - Evidence: clean Node 24.17.0 `npm ci` has no deprecation notices and `npm audit` reports zero findings. A reproducible `patch-package` patch changes only two Zod explanatory comments that Rollup mistook for annotations; actual `@__PURE__` call annotations remain and both warning messages are gone. `EvidenceBox` now dynamically imports ReactPlayer only after a supported video card enters the viewport. Three >500 kB chunks remain: Mux (533.35 kB), HLS (591.58 kB), and DASH (858.98 kB); they are provider-specific dynamic chunks, not initial HTML modulepreloads. Jonny chose to retain these formats and accept the documented lazy-chunk warnings; no build warning thresholds were raised.
- [~] P4 — run full local/repository verification under Node 24.x and the PR Preview pipeline.
  - Deliverable: strict typecheck, app build, and Vercel Preview pass; the documented lazy-provider warnings are accepted.
  - Verify: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm audit`, and `git diff --check`; then verify the current commit's Vercel Preview and inspect final `git status`.
  - Evidence: `npm ci` (560 packages, zero vulnerabilities), lint, typecheck, all 362 unit tests, build, `npm audit`, and isolated fixture e2e (16 passed, 10 opt-in Analytics skips) pass after local fixes. `git diff --check` passes. Build has only the three conditional provider chunk warnings under P3. PR #15 Vercel Preview passed on previous remote candidate `ed1526f`; this local fix set needs a fresh Preview run.
- [ ] P5 — deploy the verified build to Production.
  - Deliverable: the intended Dorothy Ann Production deployment is `READY` and serves the built app/API on its expected aliases.
  - Verify: first confirm exact Vercel project/environment and show the exact deployment command and expected effect; obtain Jonny's separate explicit approval for that command. Then inspect deployment status and perform a bounded read-only smoke check. No `vercel link` or other project mutation without its own explicit approval.
  - Evidence: pending; no deployment or Vercel-side mutation attempted.

## Desired Outcome

The app passes strict local typechecking and repository checks under Node 24.x; Vercel Preview passes for the release candidate; npm install/audit is clean; intentional lazy media-provider chunk warnings are documented and accepted; and the verified commit is deployed `READY` to the intended Production project/aliases after separate command-level approval.

## Current Reality

- Deployment log targets `release/v1.2.1` at `d95923a`. Vite completes, then Vercel's later function build reports TS2339 union-narrowing errors in `src/server/thread-storage-routes.ts` and `src/server/turn-stream-boundary.ts`, and TS2322 Zod/schema output errors in `src/domain/schemas.ts`.
- Implementation started from `release/v1.2.1` at `be477b4`, ahead of the specified `c0943c7` only by observability-plan commits; the source code baseline is unchanged. `tsconfig.json` now carries root `strict: true` while retaining app/server project references. `vercel.json` does not pin a framework or build command; `api/index.ts` imports the server/domain graph built after Vite.
- Under Node v24.17.0, local typecheck and build succeed. PR #15's Vercel Preview passed at `ed1526f` for `jonnyjohannes-projects/dorothy-ann`; local fixes still need a fresh Preview result. No local Vercel link or Production deployment was performed.
- Re-running TypeScript against `api/index.ts` with `strictNullChecks` disabled reproduced the prior optional-property and discriminated-union errors. Making root `strict: true` explicit resolved the issue in local checks and the previous PR Preview; no casts or skipped checks were introduced.
- `package.json` and `mise.toml` now declare Node 24.x; checks ran on Node v24.17.0. Node 26 remains outside the plan scope.
- Listed dependency updates removed npm install deprecation notices and the two moderate audit findings (`npm audit`: zero vulnerabilities). A reproducible Zod comment patch removes Rollup's false annotation warnings. App-entry chunks are below 500 kB; Mux, HLS, and DASH provider chunks remain above that threshold and load through ReactPlayer's dynamic provider imports. Jonny accepted retaining these formats and documenting the conditional chunk warnings under P3.
- The active Analytics/log-navigation follow-up is separate and unchanged.

## Scope

### Goals

- Fix the Vercel-only TypeScript errors at their configuration cause while preserving strict checks.
- Decide and consistently configure the Node runtime; validate compatibility before an upgrade.
- Eliminate the reported TypeScript diagnostics and the listed dependency, audit, annotation, and oversized-chunk warnings without hiding them.
- Verify a successful clean local Vercel build and applicable project checks.
- Deploy the verified result to the intended Vercel Production project after command-level approval, then verify deployment readiness and a safe smoke check.

### Non-goals

- Node 26 or another unsupported Current runtime.
- Broad dependency upgrades unrelated to the specific warnings/audit findings in the supplied build log.
- Reworking application types/schema contracts if root strict compiler configuration resolves the failures.
- Any deployment or Vercel-side mutation without showing its exact command, target project/environment, and expected effect and receiving separate explicit approval.

## Decisions

- **Fix the shared compiler configuration, not each emitted symptom** — the same errors reproduce when strict null checking is disabled; root config does not currently carry strict options. The testable first approach is explicit root-level `strict: true` (or equivalently `strictNullChecks: true` if evidence shows broader strictness causes unrelated issues). Do not disable checks or blanket-ignore function diagnostics.
- **Runtime: Node 24.x LTS** — approved by Jonny; it is both a supported Vercel runtime and the newest LTS line listed by Node as of 2026-06-18. Node 26 is Current rather than LTS and is not listed among the Vercel-supported runtime versions checked. Align repository-owned engine/runtime pins only; any Vercel-side setting change remains separately gated by explicit approval.
- **Clean means warning-free for the supplied build output** — the Zod/Rollup annotation warnings, >500 kB chunk warnings, deprecated dependency notices, and moderate audit findings are in this pass. Do not mask them or apply breaking force-fixes; if safe resolution is not available, stop and ask.
- **Production deployment is the intended finish line, not blanket deployment authorization** — before every state-changing command, present the exact command, target project/environment, and expected effect and receive separate explicit approval. No deploy has yet been authorized.

## Detailed Plan

### Compiler configuration and function build

1. Set root `tsconfig.json` compiler strictness so Vercel's function build sees the same nullability/type behavior as the project configs. Preserve the existing project references.
2. Re-run typecheck and Vercel local build. Confirm specifically that diagnostics across all three reported source files disappear.
3. If the root setting introduces errors, or Vercel still compiles with different options, stop and inspect the effective compiler configuration rather than weakening checks or making broad schema edits.

### Node runtime

1. Confirm the selected target (recommended: Node 24.x) and whether the Vercel project's build/runtime setting is already controlled by `engines.node` or separately overridden.
2. Check dependencies and scripts for Node 24 compatibility; run checks under Node 24.
3. Align `package.json` `engines.node` and `mise.toml` `[tools].node`. Do not use `vercel link` or mutate the Vercel project setting without confirming target/effect and receiving separate explicit approval.

### Verification and residual findings

Run `npm ci`, lint, typecheck, unit tests, build, e2e, `npm audit`, and `vercel build` under Node 24.x. Resolve the notices identified in the supplied log rather than merely recording them. Inspect `git status`, `git diff --check`, and build/deployment inputs. Before deploying, establish the exact Production target and get separate command-level approval; afterward verify `READY` status and perform bounded read-only smoke checks.

## Verification

### Automated

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `vercel build` (no deploy)
- `git diff --check`

### Manual / operational

- Confirm the selected runtime major in build output/configuration.
- Confirm the intended Vercel project/environment before deployment.
- Obtain separate approval for the exact deploy command, target, and expected effect; verify the resulting Production deployment is `READY` and run a bounded read-only smoke check.

### Not verified / external pending

- Vercel Preview completed successfully for prior candidate `ed1526f`, proving the remote build works with the strict root TypeScript configuration. The updated local fix set still needs a fresh Preview run; the project's explicit Node runtime override has not been inspected.
- The Zod/Rollup false annotation warnings are fixed by a reproducible comment-only patch. Jonny accepted the three intentionally lazy provider chunks over 500 kB; their warning is documented without changing the build threshold.
- Local lint, typecheck, and all 362 unit tests pass. The post-fix Vercel Preview result is pending until the candidate changes are pushed.
- Production deployment remains pending a confirmed project/environment, exact command proposal, and separate command-level approval.

## Handoff

Local lint, typecheck, unit tests, build, audit, and fixture e2e pass; the intentional Mux/HLS/DASH lazy-chunk warnings are accepted and documented. Commit and push the candidate to PR #15, confirm the fresh Vercel Preview, and complete release review. Production is not deployed. Before any Production mutation, show the exact command, target project/environment (`jonnyjohannes-projects/dorothy-ann`, Production), and expected effect, and obtain separate explicit approval.

## Open Questions

- The explicit Vercel project Node runtime override remains uninspected; the previous PR Preview passed under the repository's Node 24 settings.
- The exact Production deploy command and expected effect must be presented and separately approved before deployment.

## Sources

- Node.js release status and June 18, 2026 releases: https://nodejs.org/en/about/previous-releases and https://nodejs.org/en/blog/vulnerability/june-2026-security-releases
- Vercel supported Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Vercel Node.js function runtime and TypeScript compilation: https://vercel.com/docs/functions/runtimes/node-js
- Vercel deployment troubleshooting: https://vercel.com/docs/deployments/troubleshoot-a-build
