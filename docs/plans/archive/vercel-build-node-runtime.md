# Vercel build correctness and Node runtime tune-up

## Current State

- Status: released. The build/runtime fix shipped with PR #15, squash merge `936c047` and annotated `v1.2.1` tag. This audit closes the plan based on later Preview and Production evidence; no deployment was performed during the audit.
- Verification: local Node 24.17.0 install, lint, root/API and project-reference typechecks, 362 tests, build, fixture e2e, and audit passed. Preview on `62e0546` passed function TypeScript and install-script checks without a Node-version mismatch warning; accepted lazy media-provider chunk warnings remained. PR #15 was merged and its Vercel and Preview Comments checks passed. GitHub reports a successful Production deployment of later release-branch commit `1b68496` (which contains the fix), and the Production alias `/api/health` returned HTTP 200. Neither the alias-to-commit mapping nor the Production Node runtime was directly inspected by Vercel CLI, which was unavailable in this audit.
- Owner: Jonny
- Executor: implementation worker on `release/v1.2.1`
- Last updated: 2026-09-28
- Current focus: none; accepted conditional chunk warnings and direct Production-runtime observability remain operational limits, not outstanding implementation tasks.
- Next action: none in this plan.

## Abstract

Make Vercel function compilation use the same strict TypeScript contracts as local development; resolve the reported diagnostics and install/audit issues without weakening checks; and align runtime selection to Node 24.x. Keep Mux/HLS/DASH playback lazy and accept its documented provider-chunk size warnings. Verify locally and in PR Preview, then deploy only after the exact Production command, target, and expected effect are shown and separately approved.

## Flow

```text
root tsconfig (strict + ES2022/NodeNext) ──▶ Vercel API function build

 tsconfig.build.json (app/server references) ──▶ local typecheck/build

package.json engines + Vercel project runtime ──selected major──▶ Node runtime
```

The browser app and Vercel API function are built in separate steps. Vercel completes `npm run build`, then its function compiler type-checks the API dependency graph. Vercel documents that it reads the root `tsconfig.json` but does not support project references; the prior solution-style root config was not a reliable place for function options. The app/server build references now live in `tsconfig.build.json`; the root config is standalone and explicitly sets strict, ES2022, and NodeNext options for the API.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] P1 — make root compiler settings usable by Vercel's function compiler while retaining the local project-reference build.
  - Deliverable: Vercel function type analysis uses strict null checking and ES2022/NodeNext settings, with no suppression or weakened checks; keep local app/server project references in a separate solution config.
  - Verify: run `npm run typecheck` and `npm run build`; confirm the root config has no project references; then verify fresh PR Preview has no function TypeScript diagnostics.
  - Evidence: Preview `45838de` exposed the solution-style root config issue; the standalone strict NodeNext/ES2022 root config and `tsconfig.build.json` references passed local checks. The later `62e0546` Preview had no function TypeScript diagnostics ([v1.2.1 release inventory](../../releases/dorothy-ann-v1.2.1.md)).
- [x] P2 — select and align the Node runtime target across repository pins.
  - Deliverable: update both `package.json` `engines.node` and `mise.toml` `[tools].node` to Node 24.x; assess Node 24 compatibility for this app and its dependencies before changing them. Check for a Vercel project-level runtime override and do not change Vercel-side settings without separate explicit approval.
  - Verify: `mise` selects Node 24, `package.json` declares the matching supported range, and local Vercel build output resolves to Node 24; run applicable repository checks under that runtime.
  - Evidence: both repository pins declare Node 24; `mise exec node@24.17.0` selected v24.17.0. The earlier 22.x project-setting mismatch warning was absent from the `62e0546` Preview ([release inventory](../../releases/dorothy-ann-v1.2.1.md)); this audit did not independently inspect Production runtime settings.
- [x] P3 — resolve reported warnings and dependency notices, recording accepted lazy-media chunks and reviewed install-script policy.
  - Deliverable: remove Zod/Rollup false annotation warnings, deprecated package notices, and npm audit findings; allow only reviewed version-pinned install scripts for esbuild/unrs-resolver and explicitly deny MSW's unnecessary postinstall. Retain HLS/DASH/Mux playback through lazy imports without suppressing size diagnostics; document and accept provider-chunk warnings.
  - Verify: clean install has no deprecation/install-script warnings; Zod warnings are absent; initial app chunks remain under 500 kB; provider chunks are dynamically loaded only for supported in-viewport video; `npm audit` is clean; tests cover loading/fallback behavior; verify script policy on Vercel's npm version.
  - Evidence: clean Node 24.17.0 `npm ci` had no deprecation notices and `npm audit` reported zero findings. A reproducible comment-only Zod patch removed Rollup's false annotation warnings. `EvidenceBox` dynamically imports ReactPlayer for supported in-viewport video; the three >500 kB Mux/HLS/DASH chunks are accepted conditional chunks, not initial HTML modulepreloads. The version-pinned `esbuild`/`unrs-resolver` script approvals and `msw` denial passed the later `62e0546` Preview without install-script warnings ([release inventory](../../releases/dorothy-ann-v1.2.1.md)).
- [x] P4 — run full local/repository verification under Node 24.x and the PR Preview pipeline.
  - Deliverable: strict typecheck, app build, and Vercel Preview pass; the documented lazy-provider warnings are accepted.
  - Verify: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm audit`, and `git diff --check`; then verify the current commit's Vercel Preview and inspect final `git status`.
  - Evidence: under Node 24.17.0, `npm ci`, lint, root/API and project-reference typechecks, 362 unit tests, build, `npm audit`, and fixture e2e (16 passed, 10 opt-in Analytics skips) passed. Only the three accepted lazy-provider chunks warned. The fresh `62e0546` Preview and merged PR #15's Vercel checks passed. No direct local `vercel build` result is claimed ([release inventory](../../releases/dorothy-ann-v1.2.1.md)).
- [x] P5 — deploy the verified build to Production.
  - Deliverable: the intended Dorothy Ann Production deployment is `READY` and serves the built app/API on its expected aliases.
  - Verify: first confirm exact Vercel project/environment and show the exact deployment command and expected effect; obtain Jonny's separate explicit approval for that command. Then inspect deployment status and perform a bounded read-only smoke check. No `vercel link` or other project mutation without its own explicit approval.
  - Evidence: no deployment command was run by this agent. GitHub's Vercel integration reports a successful Production deployment for later commit `1b68496` (containing the v1.2.1 fix), and the expected Production alias returned HTTP 200 for `/api/health` in this read-only audit. This checks availability and deployment integration, not a direct alias-to-commit or runtime inspection. The original exact-command gate still applies to future agent-initiated Vercel changes.

## Desired Outcome

The app passes strict local typechecking and repository checks under Node 24.x; the latest Vercel Preview passes function type analysis and confirms Node 24; npm install/audit is clean; intentional lazy media-provider chunk warnings are documented and accepted; and the verified commit is deployed `READY` to the intended Production project/aliases after separate command-level approval.

## Current Reality

- The earlier `45838de` Preview failed Vercel function TypeScript analysis because the solution-style root config did not supply the required strict ES2022/NodeNext options to that compiler. The release candidate moved app/server project references to `tsconfig.build.json` and made root `tsconfig.json` standalone; `62e0546` passed Preview without the prior TypeScript, install-script, or Node-setting warnings.
- Repository pins are Node 24.x; local checks ran on Node v24.17.0. Dependency changes removed the reported deprecations and audit findings, and a reproducible comment-only Zod patch removed false Rollup annotation warnings. Accepted provider-specific Mux, HLS, and DASH lazy chunks remain over 500 kB.
- PR #15 was squash-merged as `936c047` and tagged `v1.2.1`. A later release-branch commit containing the fix (`1b68496`) has a successful GitHub Production deployment status; the Production alias health endpoint responds HTTP 200. No direct Vercel CLI Production build/runtime or alias-to-commit lookup succeeded in this audit because the installed `vercel` shim lacked a selected version.
- The active Analytics/log-navigation follow-up is separate and unchanged.

## Scope

### Goals

- Fix the Vercel-only TypeScript errors at their configuration cause while preserving strict checks.
- Decide and consistently configure the Node runtime; validate compatibility before an upgrade.
- Eliminate the reported TypeScript diagnostics, dependency/audit findings, and false Zod annotation warnings. Preserve player formats through dynamic imports and document/accept their size warnings without suppressing diagnostics.
- Verify a successful clean local Vercel build and applicable project checks.
- Deploy the verified result to the intended Vercel Production project after command-level approval, then verify deployment readiness and a safe smoke check.

### Non-goals

- Node 26 or another unsupported Current runtime.
- Broad dependency upgrades unrelated to the specific warnings/audit findings in the supplied build log.
- Reworking application types/schema contracts if root strict compiler configuration resolves the failures.
- Any deployment or Vercel-side mutation without showing its exact command, target project/environment, and expected effect and receiving separate explicit approval.

## Decisions

- **Fix the Vercel compiler configuration, not each emitted symptom** — root `tsconfig.json` must be a standalone configuration for the API because Vercel documents project references as unsupported. Keep local app/server build references in `tsconfig.build.json`; set root strict, ES2022, and NodeNext options explicitly. Do not disable checks or blanket-ignore function diagnostics.
- **Runtime: Node 24.x LTS** — approved by Jonny; it is both a supported Vercel runtime and the newest LTS line listed by Node as of 2026-06-18. Node 26 is Current rather than LTS and is not listed among the Vercel-supported runtime versions checked. Align repository-owned engine/runtime pins only; any Vercel-side setting change remains separately gated by explicit approval.
- **Clean separates defects from accepted conditional chunks** — remove Zod/Rollup false annotation warnings, deprecated notices, and audit findings; use a version-pinned install-script allowlist for reviewed native build tools and explicitly deny the unused MSW worker-copy script; retain Mux/HLS/DASH playback as lazy imports and accept their >500 kB warnings. Do not raise warning thresholds or suppress diagnostics.
- **Production deployment was the intended finish line, not blanket deployment authorization** — before every agent-initiated state-changing command, present the exact command, target project/environment, and expected effect and receive separate explicit approval. The later Git-triggered Production deployment was observed read-only; it does not authorize future agent commands.

## Detailed Plan

### Compiler configuration and function build

1. Make root `tsconfig.json` a standalone Vercel-compatible config with strict, ES2022, and NodeNext options; move local app/server project references to `tsconfig.build.json` and point package build/typecheck scripts at it.
2. Run root/API typecheck and the local project-reference checks. Confirm the root config checks `api/index.ts` without the reported errors.
3. Push to PR #15 and verify Vercel Preview emits no function TypeScript diagnostics. If it still compiles with different options, inspect effective compiler configuration rather than weakening checks or making broad schema edits.

### Node runtime

1. Confirm the selected target (recommended: Node 24.x) and whether the Vercel project's build/runtime setting is already controlled by `engines.node` or separately overridden.
2. Check dependencies and scripts for Node 24 compatibility; run checks under Node 24.
3. Align `package.json` `engines.node` and `mise.toml` `[tools].node`. Do not use `vercel link` or mutate the Vercel project setting without confirming target/effect and receiving separate explicit approval.

### Verification and residual findings

Run `npm ci`, lint, root/API typecheck, project-reference typecheck, unit tests, build, e2e, and `npm audit` under Node 24.x. Verify the Vercel Preview for the exact candidate commit and confirm the project setting warning reflects Node 24. Review npm install-script notices for effects; record the accepted provider chunk warnings without changing thresholds. Inspect `git status` and `git diff --check`. Before Production, establish the exact target and get separate command-level approval; afterward verify `READY` and perform bounded read-only smoke checks.

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

- Direct inspection of the active Production alias's commit and Node runtime via Vercel CLI was unavailable: the installed `vercel` shim reported no selected version. GitHub deployment success and alias health do not prove that mapping or runtime in isolation.
- Physical runtime compatibility beyond the tested Node 24 local/Preview gates is not claimed. A future agent-initiated Vercel-side change still requires a separate exact-command, target, and effect approval.

## Handoff

The strict-config and Node 24 release gates are complete: local checks passed, the corrected Preview and PR #15 Vercel checks passed, and GitHub reports a successful later Production deployment while the Production alias health check responds. The only build warnings are the owner-accepted lazy media-provider chunks. No Vercel command or deployment was performed during this read-only audit; direct alias/runtime lookup was blocked by the local CLI shim. Future Production mutations require the exact command, project/environment (`jonnyjohannes-projects/dorothy-ann`, Production), effect, and separate explicit approval.

## Open Questions

- None blocking closure. Direct verification of active Production alias → commit and runtime is an optional operational check, not evidence claimed here.

## Sources

- Node.js release status and June 18, 2026 releases: https://nodejs.org/en/about/previous-releases and https://nodejs.org/en/blog/vulnerability/june-2026-security-releases
- Vercel supported Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Vercel Node.js function runtime and TypeScript compilation: https://vercel.com/docs/functions/runtimes/node-js
- Vercel deployment troubleshooting: https://vercel.com/docs/deployments/troubleshoot-a-build
