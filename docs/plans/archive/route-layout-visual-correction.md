# Route layout and dark swatch correction

## Current State

- Status: done, shipped in implementation commit (hash to follow)
- Verification: typecheck, affected-file ESLint, focused UI-link tests, production build, full e2e, contrast/footer browser checks, and diff check passed
- Owner: Jonny
- Executor: assistant
- Last updated: 2026-09-27
- Current focus: screenshot-reported route/footer/swatch corrections are implemented and verified
- Next action: record implementation commit and retain this shipped behavior in the archive
- Branch: `release/v1.2.1`

## Abstract

Correct three regressions visible after the previous route-layout pass: make dark-mode command tiles read as vivid accent swatches instead of muddy translucent fills; put the `/new` prompt in the same anchored footer position as the thread prompt, with no hover border; and let route content use the full available page width consistently rather than capping the main scroller at `110rem`. Preserve readable prose widths and keyboard focus visibility.

## Flow

```text
viewport shell
  ├── header
  ├── full-width route content ──one native vertical scroller
  └── prompt footer on /new and thread view ──same bottom position/width

command accent token ──opaque readable swatch──▶ keyboard focus remains visible
```

The prior plan's `110rem` cap on route content and distinct `/new` versus thread prompt placement explain the reported visual inconsistency. The `/new` prompt currently sits in the content scroller; thread prompts use a third grid row. The current 20%-accent fill over dark `--paper` is low-saturation, and the hover/focus selector adds an outline. This follow-up supersedes only those delivered visual/layout choices; keep the scrolling and auth behavior already shipped in `bc965d7` and `2d9d8f0`.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] V1 — align route frame and prompt footer placement.
  - Deliverable: make route scrollers and main panels fill the shell's available width with the existing responsive gutters (remove unintended `110rem` caps from page-level containers); retain explicit reading-width limits on long-form text. Put `/new`'s `PromptBox` in a shell footer row matching the thread route's bottom-anchored prompt position and width; both remain outside the route-content scroller.
  - Verify: at narrow and desktop viewports, `/new` and thread prompt boxes share the same bottom alignment and horizontal gutters; neither scrolls with route content; all in-scope routes use full available content width; long prose retains its readable max width; no horizontal overflow, clipping, or mobile-keyboard occlusion.
  - Evidence: Playwright checked full route frames at 360×640, 768×900, and 1440×900 with no document overflow. `/new` and active-thread footer bounds match their route scroller gutters and remain at the shell bottom; the prompt stays outside the route scroller. Existing readable answer measures remain bounded.
- [x] V2 — make command swatches vivid in dark mode and remove hover borders.
  - Deliverable: substantially increase swatch saturation/opacity in dark mode (not a 20% tint over dark `--paper`); select foreground colors for accessible contrast across all accent palettes and light/dark themes. Remove pointer-hover borders/outlines; retain a distinct `:focus-visible` indicator for keyboard users.
  - Verify: measure WCAG AA 4.5:1 contrast for normal-size command text in every scheme/theme and default/hover/focus/active state; assert hover adds no border/outline while keyboard focus remains clearly visible; inspect dark-mode swatches in a browser screenshot.
  - Evidence: Browser contrast checks pass WCAG AA (≥4.5:1) for all eight swatches in mono, Catppuccin, and Rose Pine palettes for light, dark, and auto-dark themes in default/hover/focus/active states. Hover has no outline; Chromium keyboard focus retains a visible outline.
- [x] V3 — verify the visual corrections and preserve existing route/scroll behavior.
  - Deliverable: browser tests cover `/new`, active thread, other route width frames, prompt-footer placement, dark swatches, and no-double-scroll behavior.
  - Verify: focused component/browser tests; `npm run typecheck`; affected-file ESLint; `npm run build`; `CI=1 npm run test:e2e -- --workers=2`; `git diff --check`. Record known full-lint/unit/build warning blockers from `docs/plans/vercel-build-node-runtime.md` separately. Physical iOS remains an external check if unavailable.
  - Evidence: `npm run typecheck`, affected-file ESLint, `npx vitest run tests/ui-link-treatment.test.ts` (4/4), `npm run build`, `CI=1 npm run test:e2e -- --workers=2 --retries=0` (22 passed, 10 conditional skips across Chromium/mobile WebKit), and `git diff --check` passed. Build retains documented Zod/Rollup annotation and HLS/DASH chunk warnings. Physical iOS keyboard behavior remains unverified.

## Desired Outcome

On `/new` and active thread pages, the prompt sits in a shared viewport-anchored footer at the same vertical position and width, outside the route scroller. Page-level content and panels use the full available width and consistent responsive gutters; prose retains readable measures. Dark-mode command tiles are vivid swatches with readable text. Hover does not add a border, while keyboard focus remains visible. Existing one-primary-scroll behavior and `/unlock` authentication behavior remain intact.

## Current Reality

- At the start of this follow-up, commit `2d9d8f0` capped `.routeLayout` and `.threadContent` at `110rem`; `/new` kept `PromptBox` inside its route scroller while thread prompts occupied a bottom grid row.
- The dark swatches used 20%-accent fills (28% hover/focus, 34% active) over `--paper`, and pointer hover shared an outline rule with keyboard focus.
- This follow-up removes the route-level width caps, puts `/new` and thread prompts in the same shell footer row, and uses solid accent fills with theme-aware foregrounds and keyboard-only focus outlines.
- The previous plan is archived at [`route-scroll-layout-and-command-swatches.md`](route-scroll-layout-and-command-swatches.md); this follow-up changes only the screenshot-reported polish.
- The separate [`vercel-build-node-runtime.md`](../vercel-build-node-runtime.md) remains blocked by full-check failures, build warnings, and unavailable Vercel project settings. It was not changed here.

## Scope

### Goals

- Full available width for route scrollers and primary panels, with shared gutters across `/new`, `/threads`, `/settings`, `/threads/:threadId`, and `/unlock`.
- Shared bottom-anchored prompt footer for `/new` and active thread views.
- Vivid, accessible dark-mode swatches; no hover border, but a visible keyboard-focus treatment.
- Preserve readable text line lengths, one-scroll-per-route behavior, custom indicator semantics, and `/unlock` auth behavior.

### Non-goals

- Removing the maximum reading measure from long-form answer/transcript prose.
- Changing route/content semantics, prompt submission, passphrase/auth behavior, or global keyboard shortcuts.
- Reopening the previous scrollbar behavior except as needed to keep its indicators aligned with the full-width scrollers.
- Resolving the unrelated blocked Vercel build/runtime plan or deploying.

## Decisions

- **Full width means available shell width:** page-level scrollers, content panels, and prompt footers fill the shell between responsive safe-area gutters; do not impose a narrower `110rem` page cap. Keep long text at its current readable measure.
- **Shared prompt footer:** `/new` and thread routes use the same bottom shell row; footer stays outside the primary content scroller. On mobile, account for safe areas and the software keyboard without clipping the prompt.
- **Swatches:** dark-mode fills must be substantially more opaque/saturated than the current 20% tint. Text color is selected against the actual resolved swatch fill and must pass contrast tests.
- **Hover versus focus:** pointer hover changes fill only, no border/outline; `:focus-visible` retains an independent clear keyboard indicator.

## Detailed Plan

### Route frame and footer

Remove the route-level width cap while retaining shell gutters and text-specific `max-width`. Keep content scrollers as the only primary vertical scroller. Add `/new`'s prompt as a footer grid row equivalent to the thread route's existing footer row; use one shared footer style/placement rather than route-specific vertical margins. Ensure short `/new` content does not push the footer upward and long route content scrolls behind neither header nor footer. Check input focus and mobile viewport/keyboard resizing.

### Swatches

Choose high-opacity dark-mode fills that preserve all accent identities. Set foregrounds through theme/accent tokens or a tested mapping; do not rely on low-opacity `--paper` blending that muddies the swatches. Keep hover styling borderless. Preserve a visible outline only for keyboard `:focus-visible` and measure text contrast in every supported color scheme and theme.

## Verification

### Automated

- Browser assertions for full-width bounds/gutters, prompt footer bounds and fixed position relative to the scroller, no document overflow, and preserved readable text measures
- Contrast checks across all accent schemes/themes and interaction states
- Assert hover has no border/outline; keyboard focus remains visible
- `npm run typecheck`
- Affected-file ESLint
- `npm run build`
- `CI=1 npm run test:e2e -- --workers=2`
- `git diff --check`

### Manual / operational

- Inspect `/new` in dark mode and an active thread at phone and wide-desktop sizes.
- Confirm footer position while scrolling and while the mobile software keyboard is open where available.

### Not verified / external pending

- Physical iOS/iPadOS keyboard behavior may require device validation.
- Full lint/unit checks and Vercel build may retain unrelated failures/warnings documented in the build/runtime plan.

## Open Questions

- None blocking readiness. If keeping shell-wide panels while preserving a readable text measure requires a layout compromise, keep the shell full width and limit only text-bearing descendants rather than narrowing the page frame.
