# Dorothy Ann — repository state audit

## Current State

- Status: reference document (audit snapshot, not an execution plan)
- Verification: `npm run lint` pass, `npm run typecheck` pass, `npx vitest run` → 260 pass / 1 fail; `npm run build` and `npm run test:e2e` not run for this audit
- Owner: Jonny
- Executor: audit only; no source changes
- Last updated: 2026-09-21
- Current focus: reconcile shipped code against `docs/plans/` and name what is actually outstanding
- Next action: decide on the uncommitted prompt-asset edits (see [Noteworthy](#noteworthy) item 1), then finish v1.2.1 ledger items P4–P6
- Branch / PR / session: audited on `release/v1.2.1` (one commit ahead of `main`)

## Abstract

`docs/plans/` holds twelve plan files and one release inventory covering six squashed release commits on `main`. Implementation coverage against those plans is high: every plan except `patch-research-state-sse-overflow.md` reports `done`/`complete`, and spot checks confirm the claimed code exists at the documented boundaries. The real gaps are documentation and release hygiene, not missing features — stale version pointers, missing git tags, an un-updated `package.json` version, a plan marked `blocked` whose blocker is external, and one uncommitted prompt-asset edit that currently breaks a test.

## Shipped versions (from `git log main`)

`main` has exactly six commits, each one squashed release.

| Commit | Date | Version | What it delivered |
| --- | --- | --- | --- |
| `9ca8037` | 2026-09-05 | v1.0.0-alpha0 | Repository foundation only: license, README, AGENTS, and the 2,234-line alpha specification. No application source. |
| `d236441` | 2026-09-06 | v1.0.0-alpha1 | The working prototype in one push (~10.8k lines, 55 files): Vite/Hono single package, owner auth with scrypt + signed sessions, Brave lookup, SSRF-bounded Readability extraction, Anthropic streaming with citation sentinels, SSE turn orchestration, IndexedDB storage, and fixture mode. |
| `4d55fea` | 2026-09-13 | v1.0.0-alpha2 | The persistent research workspace: fullscreen scrollback shell, sticky header, `/settings` + `/threads` routes, v2 thread envelope with migration and seven-day expiry, deterministic export, and terminal-`?` research routing. |
| `657dc89` | 2026-09-15 | v1.0.0 | Adaptive research launch: strict `ready` vs `needs_more_research` decision with 1–3 follow-up Brave searches before synthesis. Small diff (22 files), the point where Dorothy Ann became Jonny's default search engine. Also the only tagged release. |
| `cc04806` | 2026-09-19 | v1.1.0 | The big refactor (143 files, ~14.7k lines): explicit domain/application/ports/infrastructure/server/ui boundaries, v3 `Thread` aggregate with CAS commits, recursive `resolved \| search \| decompose` research protocol with one root synthesis, named product boxes, and runtime-loaded `ASSESSOR.md` / `SYNTHESIZER.md`. |
| `bb106fb` | 2026-09-20 | v1.2.0 | Image and video search support (59 files): `SearchResultKind = link \| image \| video`, `/link` `/image` `/video` prompt commands replacing `/search`, viewport-mounted video playback with thumbnail fallback, research activity footnotes, root two-source corroboration in the assessor, and centralized retention policy. |

In flight on `release/v1.2.1` (`ef93dd3`, "fix long-context research recovery"): a five-file patch touching `research-resolver.ts`, `turn-stream-boundary.ts`, `server/app.ts`, plus `app.test.ts` coverage and the patch plan. Not merged to `main`.

## Plan coverage

| Plan | Declared status | Code evidence | Verdict |
| --- | --- | --- | --- |
| `dorothy-ann-v1.0.0-alpha1.md` | "alpha2 implementation complete" | 11 items still `[~]`, 9 operator-checklist boxes `[ ]` | **Historical.** Superseded by alpha2/v1.0.0/v1.1.0; the open boxes are stale, not outstanding work. Worth an explicit `superseded` status. |
| `dorothy-ann-v1.0.0-alpha2.md` | complete | 8/8 `[x]` | Aligned. |
| `dorothy-ann-v1.0.0.md` | done | 22/22 `[x]` | Aligned. |
| `dorothy-ann-v1.1.0.md` | "release candidate; implementation and regression hardening complete" | 36/36 `[x]`; boundaries, boxes, and prompt assets all present | **Status lags reality.** v1.1.0 merged to `main` two days later; this should read `released`. |
| `dorothy-ann-search-result-kinds.md` | done | 10/10 `[x]`; `prompt-classifier.ts:7` maps `/link` `/image` `/video`, video player/preview tests present | Aligned and shipped in v1.2.0. |
| `dorothy-ann-independent-evidence.md` | done | 4/4 `[x]`; root two-source policy present in `ASSESSOR.md` | Aligned; live-provider smoke still noted as pending. |
| `centralize-thread-retention.md` | done | 1/1 `[x]`; `src/domain/retention.ts` exports `THREAD_RETENTION_MS` + `threadExpiryAt` | Aligned. |
| `research-trail-transcript.md` | done | 1/1 `[x]` | Aligned. |
| `research-trail-footnote.md` | done | 1/1 `[x]` | Aligned. |
| `dorothy-ann-color-schemes.md` | complete | 8/8 `[x]`; `src/ui/color-scheme.ts` + `color-scheme.test.ts` | Aligned. |
| `dorothy-ann-remote-storage.md` | done (was `blocked`) | 7 items, now 7/7 `[x]`; `redis-thread-store.ts`, `thread-store-base.ts`, `/api/storage/threads` route wired in `src/server/app.ts:34` | **Resolved 2026-09-21.** Items 1–6 were already verified; item 7 acceptance was `[!]` pending two-browser Upstash verification, which the owner has since confirmed working in deployed use. |
| `patch-research-state-sse-overflow.md` | planning | P1–P3 `[x]`, P4–P6 `[ ]` | **The only genuinely outstanding plan.** |
| `docs/releases/dorothy-ann-v1.1.0-rc.md` | release candidate | — | Stale; v1.1.0 shipped. No equivalent inventory exists for v1.2.0 or v1.2.1. |

Structural checks all pass: no domain/application imports of React/Hono/Vercel/provider SDKs were found out of place, the route table in `src/ui/App.tsx` matches the documented canonical routes, and `/search` is fully gone from `src/` as the search-result-kinds amendment requires.

## Outstanding work

```text
v1.2.1 patch plan ──┬── P4 progress-state recovery ──▶ browser UI never stuck on "analyzing"
                    ├── P5 structured-output compat ──▶ needs live Anthropic credentials
                    └── P6 release verification + docs ──▶ blocked on P4/P5
```

1. **P4 — progress-state recovery (not started).** `ThreadRoute.tsx` sets `message` on failure and clears `activeRequest`, but the only retry affordance wired through `onIntent` is `controller.current?.retryCommit()` — a save retry, not a research retry. The plan's deliverable ("exposes a bounded retry action" for interruption, connection loss, and timeout) is not met, and there is no UI test asserting the absence of an indefinite active state.
2. **P5 — assessment structured-output compatibility (not started).** Requires live-provider confirmation of whether the configured model supports `output_config.format.json_schema`. External dependency; fixture coverage for the fallback path can land without it.
3. **P6 — release verification and docs (not started).** Needs the full check suite plus a v1.2.1 release inventory. Note that no `docs/releases/` entry exists for v1.2.0 either, so this is really two releases of inventory debt.
4. **Four open questions in the patch plan** remain unanswered, including whether interruption retry should restart research or retain the candidate — that one gates P3/P4 design.
5. **External/manual verification carried across three plans:** two-browser Upstash check (remote storage), live-provider smoke after restart (independent evidence), and manual browser inspection of a multi-search thread (both research-trail plans). All are operational, none block code.

## Noteworthy

1. **Uncommitted prompt edits break a test.** `ASSESSOR.md` and `SYNTHESIZER.md` have unstaged reformatting (prose paragraphs → headed bullet sections, +98/−22 lines). The semantics look preserved, but `tests/system-prompts.test.ts:48` asserts the literal string `"For the root problem (depth 0), return \`resolved\` only when"`, which the rewrite deletes. Suite is **260 pass / 1 fail** because of this. These are runtime-loaded assets that change model behavior — decide deliberately: finish the reformat and update the exact-string assertions, or revert. Do not leave it dangling in the working tree.
2. **Only `v1.0.0` is tagged.** v1.1.0 and v1.2.0 both merged to `main` with release-shaped commit messages and no tag. Git history is the only version record.
3. **`package.json` still says `"version": "1.0.0"`** while v1.2.0 is shipped. The package is `private: true` so nothing breaks, but every `npm run` banner prints the wrong version.
4. **`AGENTS.md` points at the wrong source of truth.** It names `docs/plans/dorothy-ann-v1.1.0.md` as the active specification, but v1.2.0 shipped after it and v1.2.1 is in flight. The v1.1.0 plan also still describes `/search <query>` as the raw-link path, which the search-result-kinds amendment replaced with `/link`. A reader following AGENTS.md lands on superseded routing vocabulary.
5. **Plan-file size is becoming a liability.** `dorothy-ann-v1.1.0.md` is 3,331 lines / 248 KB and `dorothy-ann-v1.0.0-alpha1.md` is 2,335 lines / 169 KB — together 83% of the ~7,700 documentation lines. Both are historical. Consider an archive convention so the active set stays readable.
6. **Small plans, clean execution.** The v1.2.0-era plans (retention, research trails, independent evidence) are 80–142 lines with 1–4 ledger items each and all landed verified. That pattern is working noticeably better than the monolithic specs.
7. **Test suite is healthy and proportionate.** 34 test files / 261 tests against 79 source files, plus 3 Playwright specs run across Chromium and WebKit (the "six e2e tests" the plans cite). Lint and typecheck are clean.
8. **Branch state.** `release/v1.2.1` is one commit ahead of `main` and `patch/research-state-sse-overflow` still exists locally — the latter looks like an abandoned earlier attempt at the same work.

## Suggested sequence

1. Resolve the `ASSESSOR.md` / `SYNTHESIZER.md` working-tree edits and get the suite back to green.
2. Answer the patch plan's retry-semantics open question, then implement P4 with UI regression coverage.
3. Run the full check suite, write `docs/releases/dorothy-ann-v1.2.1.md` (backfilling v1.2.0), and close P5/P6.
4. Housekeeping: tag `v1.1.0` and `v1.2.0` retroactively, bump `package.json`, repoint `AGENTS.md` at the current plan, flip the stale `blocked`/`release candidate` statuses, and delete the dead local branch.

<|°_°|>
