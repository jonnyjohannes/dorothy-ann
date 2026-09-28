# Scroll indicator edge and prompt footer spacing

## Current State

- Status: done
- Verification: automated checks passed; physical safe-area behavior remains external
- Owner: Jonny
- Executor: assistant
- Last updated: 2026-09-27
- Current focus: edge-aligned route indicator and prompt footer spacing implemented
- Next action: owner visual review in the reported browser/device
- Branch: `release/v1.2.2`
- Base: `e309e32` (window-scroll lock and prompt anchoring)
- Implementation commit: recorded after commit

## Goal

The owner reports the page now looks better and asks for two visual refinements: place the custom route scrollbar at the far-right edge where the native scrollbar was, and increase the gap below the prompt box while slightly reducing input vertical padding.

## Plan Ledger

- [x] F1 — align route scroll indicators with the viewport edge and refine footer spacing.
  - Deliverable: route-scroller indicators now sit against the viewport's right edge while respecting the device safe-area inset. Prompt footer bottom padding is at least `1.25rem` (or the larger safe-area inset); input vertical padding is reduced from `0.65rem` to `0.45rem`.
  - Evidence: Playwright asserts the indicator reaches the viewport edge, prompt border has ≥16px of viewport breathing room, and input vertical padding totals ≤15px; route scrolling and footer anchoring remain intact.
- [x] F2 — run repository checks and record residuals.
  - Evidence: `npm test` (38 files, 363 passed); `npm run lint`; `npm run typecheck`; `npm run build`; `CI=1 npm run test:e2e -- --workers=2` (22 passed, 10 conditional skips); `git diff --check`. Build reports existing third-party Zod annotation and large-chunk warnings.

## Constraints

- Preserve the fixed viewport shell and route-local native scrolling.
- Account for `safe-area-inset-right` and `safe-area-inset-bottom` without shifting indicators inward on ordinary desktop viewports.
- Do not touch untracked plans unrelated to this scope.

## Verification

- Playwright on desktop and mobile WebKit at phone, tablet, and wide viewports.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `CI=1 npm run test:e2e -- --workers=2`, `git diff --check`.

## Residual risks

- Physical iOS safe-area and visual viewport behavior remain unverified if no device is available.
- No Vercel changes or deployment were made.
