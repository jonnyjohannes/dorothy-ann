# Vercel build correctness and Node runtime tune-up

## Current State

- Status: blocked
- Verification: Node 24.17.0 clean install, strict typecheck, app build, e2e smoke, and npm audit completed; full lint/unit suite and Vercel build are blocked by the findings below
- Owner: Jonny
- Executor: implementation worker on `release/v1.2.1`
- Last updated: 2026-06-18
- Current focus: P3 cannot meet the warning-free contract without an owner-approved resolution for upstream Zod/Rollup annotation and ReactPlayer HLS/DASH chunk warnings; P4 is consequently incomplete
- Next action: obtain Jonny's direction on accepting/remediating the residual build warnings. No deployment; P5 remains separately gated on exact-command approval

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

- [~] P1 — align root compiler settings with the strict project configs used by local checks.
  - Deliverable: Vercel function type analysis uses strict null checking, with no suppression or weakened check.
  - Verify: reproduce the reported Vercel function build locally; run `npm run typecheck`, `npm run build`, and `vercel build` and confirm all listed server/schema errors are gone.
  - Evidence: root `strict: true` preserves project references; Node 24.17.0 `npm run typecheck` and `npm run build` pass with no TS diagnostics. Vercel CLI returns `project_settings_required`; supervisor explicitly prohibited pulling/linking/inspecting remote project settings for this slice, so the function build and its prior TS diagnostics remain unverified.
- [~] P2 — select and align the Node runtime target across repository pins.
  - Deliverable: update both `package.json` `engines.node` and `mise.toml` `[tools].node` to Node 24.x; assess Node 24 compatibility for this app and its dependencies before changing them. Check for a Vercel project-level runtime override and do not change Vercel-side settings without separate explicit approval.
  - Verify: `mise` selects Node 24, `package.json` declares the matching supported range, and local Vercel build output resolves to Node 24; run applicable repository checks under that runtime.
  - Evidence: both repository pins now declare Node 24; `mise exec node@24.17.0` selected v24.17.0. Clean `npm ci`, app build, and e2e smoke ran there. Vercel runtime override and build-output selection are unverified because remote project settings may not be inspected in this slice.
- [!] P3 — remove the warnings and dependency notices shown in the supplied build log.
  - Deliverable: resolve the Zod/Rollup PURE annotation warnings, oversized HLS/DASH chunks, deprecated package notices, and two moderate npm audit findings through compatible fixes; do not hide warnings by raising thresholds, suppressing diagnostics, or using breaking `npm audit fix --force`. If a warning cannot be removed safely, stop and get a decision.
  - Verify: clean install and build output contain no corresponding warnings; `npm audit` has no findings (or stop if safe remediation is unavailable); tests cover any changed loading behavior.
  - Evidence: clean Node 24.17.0 `npm ci` has no deprecation notices and `npm audit` reports zero findings after the listed-only dev-tool updates. Build still reports Zod 4.6.5/Rollup PURE-comment placement warnings at `node_modules/zod/v4/core/regexes.js` and `core/util.js`, plus HLS 591.58 kB and DASH 859.00 kB chunks (>500 kB) from `react-player`. Per supervisor direction, no warning suppression/threshold changes or provider-loading/availability changes were attempted; row blocked pending owner direction.
- [!] P4 — run full local/repository verification under Node 24.x and Vercel's build pipeline.
  - Deliverable: strict typecheck, app build, and Vercel function build all pass with clean logs.
  - Verify: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `vercel build`, `npm audit`, and `git diff --check`; inspect final `git status`.
  - Evidence: Node 24.17.0 `npm ci`, typecheck, app build, e2e (16 passed, 10 conditionally skipped), and audit passed, but lint fails four ESLint 10 diagnostics; unit tests have two failures (the Node-runtime assertion still expects 22.x, and an existing computed-color expectation differs under upgraded jsdom); `vercel build` is blocked by `project_settings_required` and remote setup is prohibited for this slice. Build also retains P3 warnings.
- [ ] P5 — deploy the verified build to Production.
  - Deliverable: the intended Dorothy Ann Production deployment is `READY` and serves the built app/API on its expected aliases.
  - Verify: first confirm exact Vercel project/environment and show the exact deployment command and expected effect; obtain Jonny's separate explicit approval for that command. Then inspect deployment status and perform a bounded read-only smoke check. No `vercel link` or other project mutation without its own explicit approval.
  - Evidence: pending; no deployment or Vercel-side mutation attempted.

## Desired Outcome

The app passes strict local typechecking and repository checks under Node 24.x; Vercel's local build completes without errors or the listed warnings; npm install/audit is clean; and the verified commit is deployed `READY` to the intended Production project/aliases after separate command-level approval.

## Current Reality

- Deployment log targets `release/v1.2.1` at `d95923a`. Vite completes, then Vercel's later function build reports TS2339 union-narrowing errors in `src/server/thread-storage-routes.ts` and `src/server/turn-stream-boundary.ts`, and TS2322 Zod/schema output errors in `src/domain/schemas.ts`.
- Implementation started from `release/v1.2.1` at `be477b4`, ahead of the specified `c0943c7` only by observability-plan commits; the source code baseline is unchanged. `tsconfig.json` now carries root `strict: true` while retaining app/server project references. `vercel.json` does not pin a framework or build command; `api/index.ts` imports the server/domain graph built after Vite.
- Under Node v24.17.0, local typecheck succeeds, but `vercel build` returns `project_settings_required`. The supervisor prohibited pulling/linking/inspecting remote project settings in this slice, so function compiler behavior and any Vercel runtime override remain unverified.
- Re-running TypeScript against `api/index.ts` with `strictNullChecks` disabled reproduces the same family of optional-property and discriminated-union errors in the log. This strongly indicates Vercel's function type analysis is using root compiler defaults rather than the referenced project configs. The likely correction is to make strictness explicit in the root config Vercel reads, then verify with `vercel build`; do not paper over the symptoms with casts or skipped checks.
- `package.json` and `mise.toml` now declare Node 24.x; checks ran on Node v24.17.0. Node 26 remains outside the plan scope.
- Listed dependency updates removed npm install deprecation notices and the two moderate audit findings (`npm audit`: zero vulnerabilities). Build output still contains Zod PURE-annotation notices and oversized HLS/DASH chunks (details recorded under P3); these are not TypeScript failures.
- A different active plan, `docs/plans/client-observability.md`, still has open P4/P5 items; this work does not change its Analytics/privacy scope.

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

- Vercel function build/effective root compiler behavior and the project runtime override remain unverified. CLI `vercel build` requires project settings; remote setup/inspection is prohibited in this slice.
- P3 warning-free build remains blocked on upstream Zod/Rollup annotation warnings and HLS/DASH chunk sizes. `npm audit` is clean and npm install deprecation notices are gone, but P3 is not complete.
- Lint reports four errors under ESLint 10; unit tests have two failures (a Node pin assertion still expecting 22.x, and a computed-color assertion differs under upgraded jsdom). These are recorded without further source/UI edits after the block decision.
- Production deployment remains pending a confirmed project/environment, exact command proposal, and separate command-level approval.

## Handoff

P3 is blocked; do not change warning policy or video provider loading to force a clean build without Jonny's direction. P4 is incomplete and P5 untouched. Before Vercel project setup/build, obtain explicit target confirmation because `vercel build` requires project settings; do not run `vercel pull` or link state in this slice. No exact Production command or target is confirmed, so no deployment command should run.

## Open Questions

- Vercel project-level runtime override, if any, must be discovered during implementation; changing that setting requires separate explicit approval.
- The exact Production project/command must be confirmed before the deployment step; command-level approval is mandatory and is not granted merely by this plan.

## Sources

- Node.js release status and June 18, 2026 releases: https://nodejs.org/en/about/previous-releases and https://nodejs.org/en/blog/vulnerability/june-2026-security-releases
- Vercel supported Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Vercel Node.js function runtime and TypeScript compilation: https://vercel.com/docs/functions/runtimes/node-js
- Vercel deployment troubleshooting: https://vercel.com/docs/deployments/troubleshoot-a-build
