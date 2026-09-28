# Vercel build correctness and Node runtime tune-up

## Current State

- Status: implementing
- Verification: local Node 24.17.0 lint, root/API and project-reference typechecks, 362 tests, build, fixture e2e, and audit pass. Vercel Preview for `62e0546` completed build/deployment with no function TypeScript or install-script warnings; only the accepted lazy-provider chunk warning remains.
- Owner: Jonny
- Executor: implementation worker on `release/v1.2.1`
- Last updated: 2026-09-27
- Current focus: local and Preview release gates are green; the accepted lazy-provider chunk warning is documented. Complete PR #15 review and prepare the release cut; Production remains separately gated on exact-command approval.
- Next action: verify PR checks/review state, then proceed with the approved merge/tag workflow. Do not run a Production deployment command without presenting its exact target/effect and receiving separate approval.

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
  - Evidence: Vercel Preview for `62e0546` completed with no function TypeScript diagnostics. Standalone root config checks `api/index.ts` under strict ES2022/NodeNext; app/server references remain in `tsconfig.build.json`. Local root/API and project-reference typechecks pass.
- [x] P2 — select and align the Node runtime target across repository pins.
  - Deliverable: update both `package.json` `engines.node` and `mise.toml` `[tools].node` to Node 24.x; assess Node 24 compatibility for this app and its dependencies before changing them. Check for a Vercel project-level runtime override and do not change Vercel-side settings without separate explicit approval.
  - Verify: `mise` selects Node 24, `package.json` declares the matching supported range, and local Vercel build output resolves to Node 24; run applicable repository checks under that runtime.
  - Evidence: `package.json` and `mise.toml` both declare Node 24.x; `mise exec node@24.17.0` selected v24.17.0. The `62e0546` Preview completed without the previous warning that the project setting was 22.x while `engines.node` selected 24.x, confirming the Vercel setting is aligned.
- [x] P3 — resolve reported warnings and dependency notices, recording accepted lazy-media chunks and reviewed install-script policy.
  - Deliverable: remove Zod/Rollup false annotation warnings, deprecated package notices, and npm audit findings; allow only reviewed version-pinned install scripts for esbuild/unrs-resolver and explicitly deny MSW's unnecessary postinstall. Retain HLS/DASH/Mux playback through lazy imports without suppressing size diagnostics; document and accept provider-chunk warnings.
  - Verify: clean install has no deprecation/install-script warnings; Zod warnings are absent; initial app chunks remain under 500 kB; provider chunks are dynamically loaded only for supported in-viewport video; `npm audit` is clean; tests cover loading/fallback behavior; verify script policy on Vercel's npm version.
  - Evidence: clean Node 24.17.0 `npm ci` has no deprecation notices and `npm audit` reports zero findings. A reproducible `patch-package` patch changes only two Zod explanatory comments that Rollup mistook for annotations; actual `@__PURE__` call annotations remain and both warning messages are gone. `EvidenceBox` now dynamically imports ReactPlayer only after a supported video card enters the viewport. Three >500 kB chunks remain: Mux (533.35 kB), HLS (591.58 kB), and DASH (858.98 kB); they are provider-specific dynamic chunks, not initial HTML modulepreloads. Jonny chose to retain these formats and accept the documented lazy-chunk warnings; no build warning thresholds were raised. After Vercel reported pending install-script approvals, `package.json` now permits only reviewed `esbuild@0.28.2` and `unrs-resolver@1.12.2` scripts and explicitly denies `msw@2.15.0` (its postinstall is a no-op here because no worker directory is configured). The `62e0546` Vercel install emitted no pending install-script warning; npm audit reported zero vulnerabilities.
- [x] P4 — run full local/repository verification under Node 24.x and the PR Preview pipeline.
  - Deliverable: strict typecheck, app build, and Vercel Preview pass; the documented lazy-provider warnings are accepted.
  - Verify: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm audit`, and `git diff --check`; then verify the current commit's Vercel Preview and inspect final `git status`.
  - Evidence: Node 24.17.0 lint, root/API typecheck, project-reference typecheck, all 362 unit tests, build, `npm audit`, and fixture e2e (16 passed, 10 opt-in Analytics skips) pass. The `62e0546` Preview completed with no function TypeScript errors, install-script warnings, or Vercel Node-version mismatch warning. The only build warning is for the three accepted lazy provider chunks.
- [ ] P5 — deploy the verified build to Production.
  - Deliverable: the intended Dorothy Ann Production deployment is `READY` and serves the built app/API on its expected aliases.
  - Verify: first confirm exact Vercel project/environment and show the exact deployment command and expected effect; obtain Jonny's separate explicit approval for that command. Then inspect deployment status and perform a bounded read-only smoke check. No `vercel link` or other project mutation without its own explicit approval.
  - Evidence: pending; no deployment or Vercel-side mutation attempted.

## Desired Outcome

The app passes strict local typechecking and repository checks under Node 24.x; the latest Vercel Preview passes function type analysis and confirms Node 24; npm install/audit is clean; intentional lazy media-provider chunk warnings are documented and accepted; and the verified commit is deployed `READY` to the intended Production project/aliases after separate command-level approval.

## Current Reality

- Historical deployment `d95923a` exposed TS2339 union-narrowing errors in the server routes and TS2322 Zod/schema errors. The later Preview on `45838de` still had those diagnostics; the Preview for `62e0546` completed without them after the root-config correction.
- The release candidate preserves app/server project builds in `tsconfig.build.json`. Root `tsconfig.json` directly includes `api/index.ts` and supplies Vercel-compatible strict ES2022/NodeNext options; `vercel.json` does not pin a framework or build command.
- Under Node v24.17.0, root/API typecheck, project-reference typecheck, build, lint, 362 unit tests, audit, and fixture e2e pass. Vercel Preview at `62e0546` completed build and deployment with no TypeScript or install-script warnings and no Node-version mismatch warning. No Production deployment was performed.
- The `45838de` type diagnostics were resolved by moving project references out of root `tsconfig.json` and using standalone strict ES2022/NodeNext options for the API; local root-config typechecking and the `62e0546` Preview pass. No casts or skipped checks were introduced.
- `package.json` and `mise.toml` now declare Node 24.x; checks ran on Node v24.17.0. Node 26 remains outside the plan scope.
- Listed dependency updates removed npm install deprecation notices and the two moderate audit findings (`npm audit`: zero vulnerabilities). A reproducible Zod comment patch removes Rollup's false annotation warnings. App-entry chunks are below 500 kB; Mux, HLS, and DASH provider chunks remain above that threshold and load through ReactPlayer's dynamic provider imports. Jonny accepted retaining these formats and documenting the conditional chunk warnings under P3.
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
- **Production deployment is the intended finish line, not blanket deployment authorization** — before every state-changing command, present the exact command, target project/environment, and expected effect and receive separate explicit approval. No deploy has yet been authorized.

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

- Vercel Preview at `62e0546` completes with no TypeScript, install-script, or Node-version mismatch warnings. The only remaining build warning is the accepted set of three lazy video-provider chunks over 500 kB.
- Local lint, root/API and project-reference typechecks, 362 unit tests, build, audit, and fixture e2e pass. Vercel Preview is green for the candidate. Production release/deployment remains pending.
- Production deployment remains pending a confirmed project/environment, exact command proposal, and separate command-level approval.

## Handoff

Local verification and Vercel Preview for `62e0546` pass; intentional Mux/HLS/DASH lazy-chunk warnings are accepted and documented. Complete PR #15 review and proceed with merge/tag only after the release decision. Production is not deployed. Before any Production mutation, show the exact command, target project/environment (`jonnyjohannes-projects/dorothy-ann`, Production), and expected effect, and obtain separate explicit approval.

## Open Questions

- The exact Production deploy command and expected effect must be presented and separately approved before deployment.

## Sources

- Node.js release status and June 18, 2026 releases: https://nodejs.org/en/about/previous-releases and https://nodejs.org/en/blog/vulnerability/june-2026-security-releases
- Vercel supported Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Vercel Node.js function runtime and TypeScript compilation: https://vercel.com/docs/functions/runtimes/node-js
- Vercel deployment troubleshooting: https://vercel.com/docs/deployments/troubleshoot-a-build
