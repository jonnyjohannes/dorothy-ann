# Window scroll lock and prompt anchoring

## Current State

- Status: done
- Verification: automated checks passed; physical-device check remains external
- Owner: Jonny
- Executor: assistant
- Last updated: 2026-09-27
- Current focus: viewport/document scrolling is locked; prompt remains at the shell's bottom edge
- Next action: owner re-test the reported browser/device
- Branch: `release/v1.2.2`
- Base: `1cf8a12` (release branch workflow update)
- Implementation commit: recorded after commit

## Goal

The latest screenshots still show a native window scrollbar alongside the route indicator. Scrolling the native bar moves the long thread past the prompt footer. Prevent window/document scrolling from moving the app shell or separating the prompt from the viewport, while preserving the thread transcript's native scroll and accessible indicator.

## Scope

- Reproduce and identify the document-level overflow at screenshot-like wide/tall and phone viewports.
- Keep the app shell and prompt footer bounded to the visible viewport; keep the transcript as the only long-thread vertical owner.
- Add browser regression tests that attempt document/window scrolling and verify the prompt stays at the shell's lower edge.
- Preserve route-level native wheel/touch/keyboard scrolling and existing custom indicator behavior.

## Non-goals

- Changing prompt/auth behavior, thread content, route navigation, or the prior `/threads` list work.
- Modifying Vercel runtime/build configuration or the unrelated OpenAI adapter plan.

## Plan Ledger

- [x] F1 — lock window/document scroll to the app shell and keep the prompt viewport-anchored.
  - Deliverable: `html`, `body`, and `#root` are bounded with document overflow disabled; `#root` is fixed to the viewport, and route shells fill it. Transcript scrolling and its custom indicator remain route-local.
  - Evidence: Playwright injects an overflowing document sibling, attempts `window.scrollTo` and document scrolling, then confirms both scroll positions stay at zero and the prompt footer still meets the viewport bottom. The long thread route still scrolls and updates its route indicator.
- [x] F2 — run focused and repository verification; record residuals.
  - Evidence: `npm test` (38 files, 363 passed); `npm run lint`; `npm run typecheck`; `npm run build`; `CI=1 npm run test:e2e -- --workers=2` (22 passed, 10 conditional skips); `git diff --check`. Build warnings remain limited to third-party Zod annotations and large chunks.

## Verification

- Playwright at wide/tall (2000×1300), wide/short (2000×382), and phone/tablet sizes.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `CI=1 npm run test:e2e -- --workers=2`, and `git diff --check`.
- Physical iOS validation is external if unavailable.

## Residual risks

- The screenshots' exact viewport/zoom is unknown. Automated checks cover 2000×1300, 2000×837, 2000×382, 924×922, and standard phone/tablet/desktop sizes.
- Physical iOS/iPadOS browser-chrome resizing, touch momentum, and the owner's original environment remain unverified.
- No Vercel inspection or deployment was performed.
