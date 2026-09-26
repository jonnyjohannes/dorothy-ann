# Dorothy Ann — release hygiene

## Current State

- Status: in progress
- Verification: `npm run lint` pass, `npm run typecheck` pass, `npx vitest run` → 260 pass / 1 fail (the known `tests/system-prompts.test.ts` exact-string assertion against uncommitted `ASSESSOR.md` edits, tracked as H8)
- Owner: Jonny
- Executor: worker
- Last updated: 2026-09-21
- Current focus: documentation, version, and tag metadata now match the shipped repository
- Next action: push the retroactive tags (H5), then resolve the prompt-asset working tree (H8)
- Branch / PR / session: `release/v1.2.1`

## Abstract

[`dorothy-ann-repo-state-audit.md`](dorothy-ann-repo-state-audit.md) found that Dorothy Ann's feature work is ahead of its release bookkeeping: five of six shipped releases were untagged, `package.json` still claimed `1.0.0`, `AGENTS.md` pointed at a superseded specification, and several plan statuses described blockers that no longer exist. This plan closes that bookkeeping debt only. It does not touch research behavior, provider integration, or UI code.

Research recovery work stays in [`patch-research-state-sse-overflow.md`](patch-research-state-sse-overflow.md). Its `P4` (progress-state recovery), `P5` (assessment structured-output compatibility), and `P6` (v1.2.1 release verification and release notes) are **not duplicated here**; only the v1.2.0 inventory backfill that `P6` does not cover appears below as H7.

## Flow

```text
shipped code ──▶ git tags + package version ──▶ agent guide / README ──▶ plan statuses ──▶ release inventory
```

Each step records what already shipped. No step may change runtime behavior, and documentation claims must be verified against `src/` before they are written.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] H1 — Tag the shipped releases retroactively
  - Deliverable: annotated local tags for `v1.0.0-alpha0`, `v1.0.0-alpha1`, `v1.0.0-alpha2`, `v1.1.0`, and `v1.2.0` at their squashed release commits
  - Verify: `git tag -l --sort=v:refname -n1`, `git log --oneline --decorate main`
  - Evidence: created `v1.0.0-alpha0` → `9ca8037`, `v1.0.0-alpha1` → `d236441`, `v1.0.0-alpha2` → `4d55fea`, `v1.1.0` → `cc04806`, `v1.2.0` → `bb106fb`; pre-existing `v1.0.0` → `657dc89` verified and left untouched. All six resolve as annotated tag objects on `main`.
- [x] H2 — Correct the package version
  - Deliverable: `package.json`/`package-lock.json` report the shipped `1.2.0` instead of `1.0.0`
  - Verify: `npm version 1.2.0 --no-git-tag-version`, `git diff package.json package-lock.json`, `npm run lint`, `npm run typecheck`
  - Evidence: both root `version` fields moved `1.0.0` → `1.2.0`; the package stays `private: true`, so no publish surface changes. Lint and typecheck pass.
- [x] H3 — Repoint the agent guide and refresh the README
  - Deliverable: `AGENTS.md` names the current-state audit and in-flight plans as the source of truth with v1.1.0 labeled as architectural baseline; both files state only behavior that exists in `src/`
  - Verify: grep the claimed vocabulary, routes, and boxes against `src/`; `npm run lint`; `npm run typecheck`
  - Evidence: confirmed `/link`, `/image`, `/video` in `src/ui/controllers/prompt-classifier.ts:7` with no `/search` command anywhere in `src/`, the route table in `src/ui/App.tsx:92-98`, and nine boxes in `src/ui/boxes/`. Removed the `Hotkeys` box claim from both files (global shortcuts live in `GlobalShortcuts`, `src/ui/App.tsx:37`), marked the search-result-kind amendment as shipped in v1.2.0, and refreshed the README plan links.
- [x] H4 — Flip the remote-storage plan to its real status
  - Deliverable: [`dorothy-ann-remote-storage.md`](dorothy-ann-remote-storage.md) reads `done` with a handoff that no longer frames deployment failures or two-browser verification as blocking
  - Verify: read the updated `Current State`/`Handoff`; confirm ledger items 1–6 remain `[x]` and the design content is unchanged
  - Evidence: status `blocked` → `done`, last updated `2026-09-21`, next action `none`. The handoff now records that the Upstash-backed store works in its current form in production use and that further work is net-new scope; historical ledger entries, including the `[!]` acceptance note, are preserved.
- [ ] H5 — Publish the tags to origin
  - Deliverable: the six release tags exist on `origin`
  - Verify: `git push origin v1.0.0-alpha0 v1.0.0-alpha1 v1.0.0-alpha2 v1.0.0 v1.1.0 v1.2.0` run by the owner, then `git ls-remote --tags origin`
  - Evidence: —
- [ ] H6 — Retire stale historical statuses
  - Deliverable: [`dorothy-ann-v1.1.0.md`](dorothy-ann-v1.1.0.md) reads `released` rather than `release candidate`, [`dorothy-ann-v1.0.0-alpha1.md`](dorothy-ann-v1.0.0-alpha1.md) reads `superseded` with its 11 dangling `[~]` items closed as historical, and [`../releases/dorothy-ann-v1.1.0-rc.md`](../releases/dorothy-ann-v1.1.0-rc.md) is labeled a historical RC log
  - Verify: read each `Current State` block; confirm no plan outside the in-flight set claims active work
  - Evidence: —
- [ ] H7 — Backfill the v1.2.0 release inventory
  - Deliverable: `docs/releases/dorothy-ann-v1.2.0.md` recording the shipped image/video search scope and its verification
  - Verify: cross-check against `bb106fb` and [`dorothy-ann-search-result-kinds.md`](dorothy-ann-search-result-kinds.md)
  - Evidence: — (the v1.2.1 inventory is `P6` of the v1.2.1 patch plan and stays there)
- [ ] H8 — Resolve the prompt-asset working tree
  - Deliverable: the uncommitted `ASSESSOR.md`/`SYNTHESIZER.md` reformat is either finished with updated assertions or reverted, and `tests/system-prompts.test.ts` asserts durable prompt contracts rather than brittle exact prose
  - Verify: `npx vitest run tests/system-prompts.test.ts`, then the full suite back to green
  - Evidence: — (owner decision; these are runtime-loaded model assets, so the choice is deliberate)
- [ ] H9 — Delete the abandoned local branch
  - Deliverable: local `patch/research-state-sse-overflow` removed once `release/v1.2.1` is confirmed to supersede it
  - Verify: `git branch --merged main`, then `git branch -d patch/research-state-sse-overflow`
  - Evidence: —

## Desired Outcome

A reader arriving at the repository can determine the shipped version from `git tag`, `package.json`, and `docs/releases/`, and an agent reading `AGENTS.md` lands on the plan that owns the current work with no superseded vocabulary. No plan claims a blocker that has already been resolved, and no documentation claim lacks a corresponding line of source.

## Scope

### Goals

- Tag every shipped release commit on `main` with an annotated tag.
- Make the reported package version match the shipped release.
- Keep `AGENTS.md` and `README.md` factually true against `src/`.
- Remove stale `blocked`/`release candidate` statuses from completed plans.
- Record release inventory debt explicitly instead of leaving it implicit.

### Non-goals

- Do not change research, provider, storage, server, or UI behavior.
- Do not duplicate `P4`, `P5`, or `P6` of the v1.2.1 patch plan.
- Do not rewrite or archive the large historical plans; only their status metadata is in scope.
- Do not push tags or branches automatically; publishing is an explicit owner action.
- Do not decide the `ASSESSOR.md`/`SYNTHESIZER.md` reformat on the owner's behalf.

## Verification

### Automated

- `npm run lint`
- `npm run typecheck`
- `npx vitest run`
- `git diff --check`
- `git tag -l --sort=v:refname` and `git log --oneline --decorate main`

### Manual / operational

- Owner pushes the tags to `origin` and confirms them with `git ls-remote --tags origin`.
- Owner confirms the shipped remote storage behavior matches the `done` status recorded in H4.

### Not verified / external pending

- `npm run build` and `npm run test:e2e` were not run for this documentation-only change.
- The suite is 260 pass / 1 fail solely because of the uncommitted prompt-asset edits tracked in H8.

## Open Questions

- Should the large historical plans move to a `docs/plans/archive/` convention, or is a `superseded` status enough? — owner — blocks nothing; affects H6 only.

<|°_°|>
