# UI facelift: scroll ownership, threads, spacing, and swatches

## Current State

- Status: done
- Verification: automated implementation checks passed; manual device validation pending
- Owner: Jonny
- Executor: assistant
- Last updated: 2026-09-27
- Current focus: implementation complete; inspect the actual wide/short screenshots and physical iOS behavior before release
- Next action: owner review; no code work remains in this scope
- Branch: `release/v1.2.2`
- Comparison base: rebased onto `origin/release/v1.2.1` at `62e0546`
- Implementation commit: `05dc22f` (no release tag yet)

## Abstract

Continue the UI facelift on the current v1.2.2 branch, scoped against the existing scrollbar/layout diff from `origin/release/v1.2.1`. Investigate and remove the extra far-right scroll surface reported on long thread pages; keep `/threads` heading and fuzzy-search input fixed while only its thread list scrolls; make hovered thread rows share the keyboard-selected highlight; bring settings labels and controls back into a compact group on wide screens; and make command swatches follow a deliberate hue order with same-hue, readable text colors in light and dark modes.

## Flow

```text
thread/research route: one vertical owner ──custom/native fallback indicator
/threads: title + fuzzy search stay fixed; only saved-thread list scrolls
wide settings: full route frame, compact control group
command swatches: hue-ordered fill ──same-hue contrasting text
```

## Branch and Change-Range Context

This work continues the local UI change set on `release/v1.2.2`. `origin/release/v1.2.1` advanced from `bc965d7` to `62e0546` (including the scrollbar aesthetic revert, release verification fixes, and build config updates); the v1.2.2 commits were rebased onto that current tip before implementation. The rebased UI/layout history includes `a0d6d75` (route scrolling/layout), `fa36b06` (footer, width, and swatch corrections), and `bd9b4b9` (plan bookkeeping). The relevant comparison is now `origin/release/v1.2.1...HEAD`. Preserve those upstream release changes while refining the route-specific scroll behavior; do not reset or overwrite either side.

There is also an untracked `docs/plans/openai-llm-adapter.md`; it is unrelated and must remain untouched.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] F1 — eliminate duplicate vertical scrolling/indicators.
  - Deliverable: mounted the existing indicator controller so an attached custom scrollbar suppresses the native visual bar while native overflow remains the movement/fallback path. Verified long thread routes have one vertical owner, one accessible indicator, and no document overflow at the reported and standard viewport sizes.
  - Evidence: `CI=1 npm run test:e2e -- --workers=2` (route-shell test at 360×640, 768×900, 1440×900, 2000×837, 2000×382, and 924×922); existing indicator test retains keyboard movement and open-menu locking; Chromium wheel movement reaches the route scroller.
- [x] F2 — make `/threads` title and fuzzy search stationary; scroll only saved threads.
  - Deliverable: heading and `Find threads` remain outside the list viewport; only the populated list scrolls. Empty states do not get an indicator. Hover updates the same active row used by keyboard navigation and scrolls the active row into view.
  - Evidence: route-shell browser test injects an overflowing list, verifies the heading/search positions remain fixed, finds only one vertical owner and one indicator, and finds no document overflow. `tests/ui-boxes-v3.test.tsx` verifies pointer and arrow-key selection; the full suite retains Enter/Delete/Backspace behavior.
- [x] F3 — tighten wide-screen settings spacing and refine the swatches.
  - Deliverable: constrained settings controls to `44rem` while retaining the full-width route. Command colors use a cool-to-warm order; Rose Pine uses its available purple/cyan/rose/coral/gold hues; monochrome remains monochrome. Same-hue foregrounds pass WCAG AA.
  - Evidence: wide settings geometry verified in Playwright at 2000px; computed browser colors match the intended per-theme order, and all foregrounds meet ≥4.5:1 in light, dark, and auto themes.
- [x] F4 — run scoped verification and update the handoff.
  - Evidence: `npm test` (38 files, 363 passed); `npm run lint`; `npm run typecheck`; `npm run build`; `CI=1 npm run test:e2e -- --workers=2` (22 passed, 10 conditional skips); `git diff --check`. Build completes with existing Zod annotation and large-chunk warnings. Physical iOS remains unverified.

## Desired Outcome

Long thread pages show exactly one vertical scroll affordance and cannot accidentally scroll the document. On `/threads`, only saved threads move; heading and fuzzy search stay visible, and pointer-hovered rows match keyboard selection. Wide-screen settings remain easy to scan, with controls near their labels. Command colors read as an intentional spectrum, and each tile's text is a contrasting tonal variation of that tile's own hue.

## Current Reality

- The screenshot-reported duplicate scrollbar was not reproduced against a captured pre-fix browser state, so its original root cause remains unconfirmed. The updated browser fixture verifies one overflowing route surface, one custom indicator, and no document-level overflow at the screenshot-like and standard viewport sizes; `ScrollIndicators` now mounts app-wide and keeps native overflow as the fallback.
- Settings keeps the full-width route frame while `.settings` is capped at `44rem`; browser geometry checks confirm the controls group stays bounded at 2000px wide.
- `/threads` uses a fixed heading/search with only the saved-thread list as its vertical scroll owner. Empty state does not show an indicator; populated state uses an accessible list indicator. Pointer and keyboard selection share the row background.
- Command swatches now use explicit palette-specific cool-to-warm ordering and foreground shades chosen from each fill's hue family. The monochrome scheme still repeats one hue.
- The previous completed behavior records are [`route-scroll-layout-and-command-swatches.md`](archive/route-scroll-layout-and-command-swatches.md) and [`route-layout-visual-correction.md`](archive/route-layout-visual-correction.md). Preserve their native-scroll, width, footer, accessibility, and authentication decisions except where this plan deliberately refines them.
- The separate [`vercel-build-node-runtime.md`](vercel-build-node-runtime.md) remains blocked; it is outside this plan.

## Scope

### Goals

- Remove the reported duplicate vertical scroll/indicator on long thread pages without hiding the actual active scroll affordance.
- Keep `/threads` heading and fuzzy-search input fixed while only its saved-thread list scrolls.
- Make pointer hover and keyboard selection share a row highlight.
- Keep settings controls compact on wide screens without undoing full-width route framing.
- Order chromatic command swatches by hue and use same-hue accessible text shades.

### Non-goals

- Reverting the v1.2.2 route shell, prompt footer, width, or native scroll behavior wholesale.
- Changing thread search/ranking, persistence, route navigation, delete confirmation, auth, or keyboard shortcut contracts.
- Inventing distinct command hues for the monochrome scheme.
- Modifying the unrelated untracked OpenAI adapter plan, blocked Vercel build/runtime work, or deploying.

## Decisions and Open Questions

- **Double-scroll:** the exact original screenshot cause was not reproduced pre-fix. The implemented state is verified to have one vertical owner/indicator and no document overflow; inspect Jonny's actual screenshots/device if the extra bar remains.
- **Threads scroll boundary:** `/threads` title and `Find threads` input stay outside the sole saved-thread-list scroller. Keep status/error/empty content visible without an empty scroll control.
- **Hover selection:** pointer entry changes the same active index used by keyboard selection; hover never activates or deletes a thread.
- **Settings spacing:** constrain the controls block to a proposed `44rem` maximum while the route frame remains full width. Adjust only if browser measurements show labels still too far from controls.
- **Swatch ordering (confirmed):** use a consistent cool-to-warm spectrum from violet through red/pink for chromatic palettes. Monochrome retains its one hue. Same-hue foregrounds must pass 4.5:1; use the lighter/darker tonal direction that works for each actual fill rather than forcing one direction across themes.
- **Implementation status:** Jonny authorized implementation after rebasing on the latest `origin/release/v1.2.1` tip.

## Verification

### Automated

- Playwright at 2000×837, 2000×382, 924×922, and standard phone/tablet/desktop sizes
- Assert document overflow and enumerate the actual vertical scrollers/scrollbar indicators on long thread and `/threads` pages
- Assert `/threads` header/search remain fixed and only the saved-thread list scrolls
- Assert pointer hover and keyboard-active row highlight match; retain activation/deletion keyboard contracts
- Assert settings labels/selectors stay grouped on wide screens
- Assert hue order and ≥4.5:1 swatch text contrast for supported schemes/themes
- `npm run typecheck`
- Affected-file ESLint
- `npm run build`
- `CI=1 npm run test:e2e -- --workers=2`
- `git diff --check`

### Manual / operational

- Owner review of the actual screenshot-like wide/short thread and settings layouts, plus a long saved-thread list.
- Physical iOS/iPadOS touch momentum and visual indicator behavior remain unverified; browser automation covers mobile WebKit and Chromium only.
- No Vercel inspection or deployment was performed. The separately blocked Vercel build/runtime plan remains out of scope.

### Residual risks

- The original second scrollbar was not captured before the change, so automated post-fix evidence cannot establish its precise original source.
- The local build passes with Rollup warnings for third-party Zod annotations and large media chunks.
- Physical-device validation remains external.
