# Unified route scrolling and command swatches

## Current State

- Status: done
- Verification: typecheck, affected-file ESLint, production build, full e2e, focused contrast/browser checks, and diff check recorded below
- Owner: Jonny
- Executor: implementation worker
- Last updated: 2026-06-18
- Current focus: unified scrolling, width framing, `/unlock`, and command swatches are implemented and verified
- Next action: retain this shipped behavior record in the archive
- Branch: `release/v1.2.1`

## Abstract

Unify app-owned scrolling around one primary native vertical scroller per route, with header and prompt rows outside its range; preserve only deliberate local scrollers for active menus/overlays and horizontal content. Use the existing custom square accent indicator consistently across axes and surfaces. Let short pages such as `/new` remain naturally non-scrollable. Strengthen slash-command tile swatches while preserving readable text in every supported theme.

## Flow

```text
viewport-sized route shell
  ├── sticky header (not part of content scroll)
  ├── one primary vertical route scroller ──custom accent indicator follows this region
  └── prompt footer, when present (not part of content scroll)

open menu/overlay ──owns temporary local scroll──▶ background route stays fixed
long code/content ──local horizontal scroll──▶ no page-width expansion
```

Browser-native overflow remains responsible for scroll movement, touch momentum, wheel, and normal keyboard navigation. The custom indicator introduced in `bc965d7` provides a consistent visual/keyboard/pointer scrollbar treatment; it must follow the actual owner scroller, not the document/header/footer. There must be no accidental second vertical page/list scroll. Horizontal code and an active menu may scroll locally, using the same design and input/accessibility rules.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] R1 — settle route and local-scroll ownership.
  - Deliverable: record the intended common viewport model, routes, width reference, and deliberate local-scroll exceptions.
  - Verify: owner chose a shared viewport-contained model across `/new`, `/threads`, `/settings`, `/threads/:threadId`, and `/unlock`; thread view is the width/gutter reference; vertical, horizontal, and local overlay scrolling use a consistent contract. Menus may scroll while open only if their background route is prevented from also scrolling; horizontal code remains local.
  - Evidence: Jonny confirmed shared layout, added `/unlock`, requested consistency across all scrolling, and directed all pages to use near-full-width framing based on the thread view on 2026-06-18.
- [x] R2 — implement a shared viewport route shell with one primary vertical scroller.
  - Deliverable: apply the shared layout to `/new`, `/threads`, `/settings`, `/threads/:threadId`, and `/unlock`; header and optional prompt footer are separate rows, and route content is the only primary vertical scroller. Remove the saved-thread list's nested `55vh` vertical scroll and document-level overflow. `/new` and `/unlock` have no overflow/indicator when their content fits, but can scroll on short viewports or if content grows. Give `/unlock` the shared header, an `/unlock` title, and a simply styled passphrase input with the exact hint `passphrase`; retain an accessible name and existing password/autocomplete/submit/error behavior.
  - Verify: assert document has no unintended vertical overflow at target viewports; one primary route scroller handles long content; header and prompt remain visible and are excluded from its scroll track; short `/new` and `/unlock` fit; the passphrase hint/input remain accessible; dynamic content, messages, and mobile keyboard/viewport changes do not clip content or trap focus.
  - Evidence: Playwright route checks covered `/new`, `/threads`, `/settings`, an active `/threads/:threadId`, and `/unlock` at 360×640, 768×900, and 1440×900; document overflow was absent. Short `/new` and `/unlock` had no route overflow or indicator. `/unlock` retained the accessible “Passphrase” label, password type, current-password autocomplete, and exact placeholder.
- [x] R3 — standardize deliberate local and horizontal scroll surfaces.
  - Deliverable: inventory and classify every app-owned scroll surface. Retain local vertical scrolling only for active menus/overlays that need it, with background route scroll locked; retain horizontal scrolling for overflowing code/content. Align overscroll containment, indicator thickness/accent/square geometry, focus semantics, keyboard/pointer operation, visibility, and fallback behavior across all surfaces; preserve native scroll input/physics.
  - Verify: each intentional local/horizontal scroller is reachable and usable by pointer, keyboard, and touch as applicable; no route/page double-scroll; no accidental horizontal page overflow; closing overlays restores the underlying route's scroll state. No native bar is hidden unless a functioning custom replacement owns that surface.
  - Evidence: Chromium and mobile WebKit verified the actual thread content scroller indicator excludes header/footer; an active menu locked the background, kept its scroll position, and restored the route indicator after close. Horizontal code scrolled locally without document-width overflow. Native fallback remains available unless the replacement is mounted.
- [x] R4 — align page/content widths across all routes to the thread view.
  - Deliverable: use the existing thread view's fluid content width and responsive gutters as the reference for `/new`, `/threads`, `/settings`, thread views, and `/unlock`; make route-level content and primary panels feel near full width rather than narrowly centered. Keep long-form prose at its existing readable measure and do not arbitrarily stretch text lines.
  - Verify: compare content/panel bounds at phone, tablet, and desktop widths; all routes share the same outer gutters and near-full-width frame, while transcript prose retains its intended max reading width and no horizontal overflow is introduced.
  - Evidence: The same route checks measured main-frame width above 88% of viewport at phone/tablet/desktop widths; prose remains capped at its existing 90rem reading measure and no horizontal overflow was introduced.
- [x] R5 — tune `/new` slash-command swatches and text contrast.
  - Deliverable: make tile backgrounds more opaque while preserving the multi-accent swatch feel; choose readable foreground colors where needed without changing command behavior.
  - Verify: test every accent swatch under each supported color scheme and light/dark theme; maintain WCAG AA 4.5:1 contrast for normal-size command text in default/hover/focus/active states; keyboard focus remains visible.
  - Evidence: Browser WCAG contrast measurement covered each command tile's base, hover, focus, and active states across mono/Catppuccin/Rose Pine and light/dark variants; all normal text measured at least 4.5:1.
- [x] R6 — verify layout, all scrolling modes, widths, and accessibility.
  - Deliverable: browser coverage validates route scrolling, local overlay scrolling, horizontal content, viewport resizing, widths, and swatch appearance.
  - Verify: focused component/browser checks, `npm run typecheck`, affected-file ESLint, `npm run build`, `CI=1 npm run test:e2e -- --workers=2`, and `git diff --check`; exercise Chromium and narrow/mobile WebKit. Assert shared near-full-width bounds at phone/tablet/desktop sizes plus readable text measure. Record existing full-lint/unit blockers from `docs/plans/vercel-build-node-runtime.md` separately. Physical iOS verification remains external if unavailable.
  - Evidence: `npm run typecheck`, affected-file ESLint, `npm run build`, and `git diff --check` passed. `CI=1 npm run test:e2e -- --workers=2` passed 22 tests with 10 conditional telemetry skips on Chromium and mobile WebKit. Axe home check passed. Full `npm run lint` retains four known unrelated ESLint 10 errors; `npm test` retains two known unrelated baseline failures (Node 22 assertion vs approved 24.x pin and jsdom RGB-vs-hex expectation). Build passed with the already documented Zod/Rollup annotation and HLS/DASH chunk warnings. Physical iOS keyboard behavior remains unverified.

## Desired Outcome

The document does not scroll behind a route shell. `/new`, `/threads`, `/settings`, thread views, and `/unlock` share one primary vertical content scroller; header and optional prompt footer are outside it. Menus may own a temporary local scroll without moving the background; code may scroll horizontally without widening the page. Page content shares a near-full-width fluid frame and gutters modeled on the thread view, while long-form text keeps a readable line length. All indicators share the app's square-ended `--accent` treatment and consistent accessible interaction, while movement remains native. Short `/new` and `/unlock` content has no scrollback. `/unlock` presents a matching `/unlock` title and simply styled passphrase input hinted `passphrase`, without changing authentication behavior. Slash-command tiles are more vivid swatches with readable text in every theme.

## Delivered Reality

- All five routes use a viewport-contained grid shell with a header row and one native route-content scroller; the active thread prompt is a separate footer row. The document is not a competing vertical/horizontal scroller, and route content has natural no-overflow behavior when it fits.
- `/threads` list content now moves with the route scroller rather than a nested fixed-height list scroller. Local listbox menus own bounded overflow and lock route content without losing its scroll position; long code blocks scroll horizontally without widening the document.
- `ScrollIndicators` now follows route content, active menus, and horizontal code rather than the document; custom replacement styles retain the native scrollbar until the indicator mounts, with native fallback on setup failure.
- Route content shares thread-view responsive gutters and near-full-width framing (up to the existing 110rem maximum); long-form text retains the existing 90rem reading measure.
- `/unlock` uses the shared header/shell, a visible `/unlock` title, full-width simple password input, accessible “Passphrase” label and `passphrase` hint; submission/session/return-to behavior remains unchanged.
- Slash-command tile backgrounds are more opaque and retain accent order; `--ink` is used for foregrounds and a high-contrast focus outline is independent of swatch fill.
- Automated browser coverage exercised Chromium and mobile WebKit; physical iOS/iPadOS browser chrome and keyboard behavior remains external. Full lint/unit and build warning residuals are separately recorded in R6 and `docs/plans/vercel-build-node-runtime.md`.

## Scope

### Goals

- One primary vertical scroller per route across `/new`, `/threads`, `/settings`, `/threads/:threadId`, and `/unlock`.
- Near-full-width route content and shared responsive gutters modeled on the thread view, preserving readable prose measures.
- Header and prompt footer stay outside the primary scroll region.
- Standardized intentional local/menu and horizontal-content scrolling using the existing indicator treatment.
- Natural no-overflow behavior on `/new` and `/unlock` when content fits.
- A shared `/unlock` shell/title and simple passphrase input hinted exactly `passphrase`, preserving accessible labeling and auth behavior.
- Clearer slash-command swatches with accessible foreground contrast.
- Preserve native scrolling mechanics, theme/accent behavior, and the custom indicators from `bc965d7`.

### Non-goals

- Replacing native scroll physics or intercepting normal touch/wheel input.
- Changing route behavior, command semantics, evidence/transcript content, or global keyboard contracts.
- Changing passphrase submission, password handling, auth/session behavior, or return-to routing.
- Editing or unblocking the separate Vercel build/runtime plan.

## Decisions

- **Shared route shell approved:** use a dynamic viewport-sized shell (`100dvh` with a safe fallback), a fixed layout row for the header, a flexible `min-height: 0` native content scroller, and an optional prompt footer row for the research thread view. The document itself should not become a competing vertical scroller.
- **Routes:** `/new`, `/threads`, `/settings`, `/threads/:threadId`, and `/unlock` use the shared shell. `/unlock` has no prompt footer; use a visible `/unlock` title and a simple password input with placeholder/hint exactly `passphrase`, retaining a separate accessible name and existing auth semantics.
- **One means one primary vertical scroller per route:** open menus/overlays may own a temporary local vertical scroller while the background route is locked; horizontal code overflow remains local and does not count as a competing vertical page scroll.
- **No artificial minimum scroll:** use overflow only when content exceeds the available region; no visible scrollbar/indicator when content fits. Remove old fixed/min-height/bottom-padding causes of accidental page overflow.
- **Width consistency:** make page and main-panel framing fluid and near full-width across routes using the thread view's existing width/gutter treatment as the reference; preserve its readable prose measure instead of stretching every line.
- **Swatches stay swatches:** raise background opacity, retain accent ordering/theme variables, and select foreground colors by verified contrast rather than arbitrary opacity alone.
- **Preserve custom indicators:** retarget them to actual route/local scrollers, retain square geometry and accessible control semantics, and keep native fallback whenever a replacement is absent or fails.

## Detailed Plan

### Route layout and scroll ownership

Use consistent route shell/grid primitives or equivalent composition. Each route has explicit header, content, and optional prompt-footer rows. The active thread's transcript, research activity, and evidence occupy the one primary content scroller; the prompt remains outside. The `/threads` list moves with the route scroller instead of its own `55vh` scroller. Settings uses the same content row. `/new` and `/unlock` use the same shell but have no overflow when content fits. `/unlock` presents the common header and `/unlock` title, then a simple password input hinted `passphrase`; preserve its current hidden label/accessibility, password type, current-password autocomplete, Enter submission, clear-after-submit, error feedback, and safe return-to behavior. Keep page/document movement disabled only after every route remains reachable through its content region. Handle browser chrome changes, virtual keyboard, validation/status messages, responsive wrapping, and safe-area insets without clipping or focus traps.

### Local and horizontal surfaces

Inventory all overflow and design tokens/interaction rules for primary vertical regions, overlay menus, and horizontal content. Avoid intercepting native touch/wheel mechanics. While an overlay scroll surface is active, prevent background page scrolling and restore position on close. Ensure horizontally scrollable code/content cannot create document-level horizontal overflow. Use one visual indicator contract for all surfaces, with axis-aware geometry and consistent accent, square ends, focus, keyboard/pointer behavior, reduced motion, observers, and cleanup.

### Page widths and swatch treatment

Use the thread view as the visual reference for route-level width and horizontal gutters across all in-scope routes. Bring main panels and `/unlock` input presentation into the same near-full-width frame where practical, but preserve the transcript's comfortable text measure and existing paragraph max widths. Verify width at phone, tablet, and desktop breakpoints.

For command swatches, adjust command-tile base and interaction opacity based on measured contrast results. Evaluate active `--paper` and `--ink` against every accent palette in light and dark themes. Use the strongest readable foreground and keep focus treatment visible independently of fill.

### Testing

At narrow and desktop viewports, assert the document does not vertically scroll; one route-content element owns primary vertical movement; header/footer remain visible; route indicator bounds exclude them; long thread/list/settings content remains reachable; route/panel widths and gutters are consistent with the thread reference without oversized text lines; short `/new` and `/unlock` do not overflow; `/unlock` shows the expected title and passphrase hint while preserving password submission; overlays lock and restore the route; code scroll stays horizontal; viewport/keyboard resize does not clip controls. Test all command swatches/theme combinations for contrast and interaction states.

## Verification

### Automated

- Component/browser tests for shell sizing, scroll ownership, overlay lock/restore, horizontal overflow, indicator synchronization, and swatch contrast
- `npm run typecheck`
- Affected-file ESLint
- `npm run build`
- `CI=1 npm run test:e2e -- --workers=2`
- `git diff --check`

### Manual / operational

- Validate at phone-sized viewport with expanded/collapsed browser chrome when possible, plus desktop and keyboard-only navigation.
- Confirm no clipped input behind the mobile keyboard and no document/page scroll when route content fits.

### Not verified / external pending

- Physical iOS/iPadOS virtual-keyboard and overlay behavior require device validation when available; automated WebKit is not physical-device validation.
- Full lint/unit suites may still have unrelated failures documented in the build/runtime plan; capture exact current evidence.

## Handoff

Shipped behavior uses one viewport-contained route content scroller for all five routes, with a separate thread prompt footer; active local menus lock route movement, horizontal code stays local, and the custom indicator follows the actual overflow owner. `/unlock` keeps its existing auth flow while using the shared shell. Existing full lint/unit/build warning blockers remain documented separately and were not changed. No Vercel command or deployment was run.

## Open Questions

- None blocking readiness. `/unlock` is now in scope because it has no distinct behavior that requires a separate layout: it should use the shared shell with no prompt footer. If this cannot be done without changing its auth/accessibility behavior, mark the relevant row blocked and ask before narrowing or expanding scope.
