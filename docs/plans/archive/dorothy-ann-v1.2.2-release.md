# Dorothy Ann v1.2.2 release readiness

## Current State

- Status: complete; draft PR #16 is open. Merge, tag, and production deployment remain pending.
- Owner: Jonny
- Candidate branch: `release/v1.2.2`
- Base: `main` (`936c047`)
- Candidate head: `457da11`
- Current focus: none; release preparation and PR creation are complete.

## Summary

Prepare the existing release candidate for review. Align the package version and release inventory, remediate audit findings without changing application behavior, and record local verification and external gaps accurately. Do not deploy or tag.

## Plan Ledger

- [x] R1 — set the package and lockfile version to `1.2.2` without creating a tag.
- [x] R2 — add a v1.2.2 release inventory based on the branch diff and verified checks; distinguish fixture/local evidence from live or physical-device gaps.
- [x] R3 — remediate the audit findings by updating vulnerable dependencies, including the `@hono/node-server` major-version boundary; preserve the existing Node adapter behavior and drop the version-specific, comment-only Zod patch.
- [x] R4 — rerun lint, typecheck, unit tests, build, e2e, both audit scopes, and `git diff --check`; record the non-fatal Zod/player chunk warnings and external gaps.
- [x] R5 — present the PR title/body for approval and open draft PR [#16](https://github.com/jonnyjohannes/dorothy-ann/pull/16) from `release/v1.2.2` to `main`.

## Open Questions

- Buildkite status cannot currently be read because the local Buildkite credential is unauthorized; GitHub's Vercel deployment and Preview Comments checks were green for the pre-bookkeeping candidate commit.
- Physical-device keyboard/IME behavior and live provider behavior remain outside the fixture verification performed here.

## Handoff

Do not tag or deploy. The release inventory's PR, merge commit, and tag identity should remain pending until those events occur. <|°_°|>
