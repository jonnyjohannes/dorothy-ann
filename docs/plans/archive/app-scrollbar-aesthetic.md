# App-wide accent scroll indicators

## Current State

- Status: done
- Verification: Node 24 repository checks and CI browser suite run; lint/unit failures match documented baseline blockers
- Owner: Jonny
- Executor: implementation worker
- Last updated: 2026-06-18
- Current focus: delivered app-wide native-synchronized accent indicators
- Next action: verify actual iOS/iPadOS device behavior when available; WebKit automation is not physical-device validation
- Branch: `release/v1.2.1`

## Abstract

Make scroll indicators feel intentional and consistent across the app, including mobile Safari, by showing app-accent-colored, square-ended custom indicators rather than relying on native scrollbar appearance. Keep browser-native scroll containers and their touch/momentum/keyboard behavior; do not emulate the scrolling mechanics.

## Flow

```text
native scroll container ──scroll/resize/content change──▶ custom accent indicator
        │                                                        │
        └──native touch, wheel, keyboard, scroll physics─────────┘
```

The scrollbar thumb is a custom visual/control synchronized with existing native overflow. It must not replace the browser's scroll mechanics or capture normal touch/wheel input. The current CSS-only styling on the thread picker does not reliably style iOS Safari's system overlay indicator, so the approved option A requires a custom app-rendered indicator where the app owns the scroll surface.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] S1 — inventory app-owned scroll surfaces and define one accessible, reusable indicator contract.
  - Deliverable: identify document/page and nested scroll containers (including thread picker, listbox menus, and horizontally scrollable code); define how indicator visibility, pointer/keyboard operation, and accessible semantics work without duplicating the scroll container's accessible role.
  - Verify: review the scroll-surface inventory against `src/ui` CSS/markup and the keyboard/accessibility contracts in `AGENTS.md`; record any surface deliberately left native with rationale.
  - Evidence: DOM/CSS inventory: document scrolling element, `.threadPicker ul`, `.ui-listbox-menu` (prompt/settings listboxes), and `.ui-markdown pre` horizontal overflow. `.ui-fuzzy-listbox` is not independently overflow-constrained; no uncovered app-owned overflow surface was found. Each replacement uses a named, focusable `role=scrollbar` referencing its native scroll surface; keyboard, pointer drag, and native scroll synchronization retain the existing native overflow. Native bars stay visible for short/no-overflow or failed setup. S1 review covered GlobalShortcuts and box-owned keyboard contracts.
- [x] S2 — implement app-wide sharp accent indicators while retaining native scrolling.
  - Deliverable: replace dependence on native scrollbar styling for in-scope scroll surfaces with a synchronized custom indicator using `--accent`, square ends, and no rounded thumb/track; preserve touch momentum, wheel, keyboard scrolling, reduced-motion behavior, and safe-area/layout behavior. Hide a native indicator only where the custom equivalent is mounted and functioning.
  - Verify: unit/component tests cover scrolling, thumb sizing/position, content/viewport resize, pointer/keyboard behavior (as designed), cleanup, and accent-theme updates; no indicator intercepts normal touch scrolling.
  - Evidence: `src/ui/ScrollIndicators.tsx` synchronizes document, saved-thread list, listbox and horizontal code indicators from native overflow. Scroll/resize/mutation listeners and observers update geometry and clean up on unmount; native scroll is never intercepted, and native bars stay visible absent measurable overflow or successful custom setup. Indicators have named scrollbar semantics, `aria-controls`/value state, keyboard movement, pointer dragging, square `--accent` thumbs and no motion animation. Focused Chromium/WebKit browser assertions cover all four surfaces, accent, keyboard and Chromium pointer drag.
- [x] S3 — verify desktop and mobile behavior and accessibility.
  - Deliverable: browser coverage demonstrates consistent visual treatment on standard scroll surfaces and the saved-thread list at desktop and mobile sizes, with no clipping, layout shift, stuck/stale thumb, or inaccessible scroll path.
  - Verify: focused tests, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `CI=1 npm run test:e2e -- --workers=2`, and `git diff --check`; exercise Chromium/WebKit at narrow and desktop viewports where available. Note the repository's existing unrelated lint/test blockers from the build/runtime plan separately; do not silently modify that plan or broaden into its dependency cleanup.
  - Evidence: focused ESLint, strict typecheck, build and diff check pass. Full lint reports the same four existing ESLint errors documented in `vercel-build-node-runtime.md`; full unit suite has its two documented failures (Node engine assertion expects 22.x and jsdom color expectation); no unrelated files or blocked plan were changed. CI e2e passes 18 and skips 10 conditional Analytics cases on both Chromium desktop and iPhone-sized WebKit project. Automated geometry/content insertion, accessible surface labels, keyboard movement, accent color and Chromium pointer drag pass. No physical iOS/iPadOS device was available, so native touch/momentum and actual Safari overlay appearance remain device-unverified.

## Desired Outcome

All app-owned scroll surfaces present a clear square-ended indicator in the active app accent, including on mobile browsers that do not honor CSS scrollbar theming. Native scrolling remains the source of truth for movement and continues to work with touch, momentum, wheel, and keyboard. No rounded scrollbar ends remain in the app's own scroll indicator treatment.

## Current Reality

- Commit `eb399b1` added CSS styling for only `.threadPicker ul` in `src/ui/App.module.css`: `scrollbar-width: thin`, `scrollbar-color: var(--accent) transparent`, and WebKit scrollbar pseudos, with `border-radius: 0` on the thumb.
- The S1 DOM/CSS inventory found the document/page, `.threadPicker ul` (`overflow: auto`), `.ui-listbox-menu` (`overflow: auto`), and `.ui-markdown pre` (`overflow-x: auto`); `.ui-fuzzy-listbox` has no independent overflow constraint.
- iOS/iPadOS Safari uses system overlay scrollbars; CSS legacy scrollbar pseudo-elements do not provide a reliable custom visual there. Hiding the browser indicator alone would leave no app-styled indicator, so only hide it on a surface after the replacement is mounted and verified.
- A separate plan, `docs/plans/vercel-build-node-runtime.md`, is blocked on warning-free bundling and full checks. This scrollbar work must remain scoped to UI scroll behavior and not change that plan or its dependency/toolchain.

## Scope

### Goals

- Apply one intentional accent-color scrollbar aesthetic to app-owned scrollable areas, including mobile.
- Make custom indicators square-ended (no radius) and synchronized with native scroll position and size.
- Preserve native scrolling interaction and accessibility.
- Test narrow/mobile and desktop behavior.

### Non-goals

- Reimplementing scroll physics or replacing native overflow/touch scrolling.
- Changing content, route behavior, keyboard navigation contracts, or product box semantics.
- Hiding native scrollbars on surfaces that lack a verified custom replacement.
- Modifying the separate build/runtime plan or its blocked warning policy.

## Decisions

- **Option A approved:** custom app-rendered indicators across the app, including mobile, while native scroll mechanics remain. This is broader than just changing the current CSS color and requires component/browser testing.
- **Square geometry:** the thumb and any visible track/caps have sharp square ends; no rounding.
- **Accent source:** use the existing `--accent` token so current theme/color-scheme preferences remain authoritative.
- **Progressive safety:** preserve the native indicator if the custom indicator cannot mount or fails; do not hide a browser affordance before its replacement works.

## Detailed Plan

### Inventory and interaction contract

Inspect actual scrollable DOM elements and CSS, including nested and horizontal overflow. Avoid intercepting touch/wheel events. Keep each underlying scrolling element natively scrollable; the indicator must remain synchronized when scrolling through any supported input, content growth, viewport changes, or theme/accent changes. The custom control must not create duplicate or misleading screen-reader scrollbar semantics. Prefer native scrollbar keyboard behavior where it remains available; if hidden native controls mean the custom thumb is interactive, support pointer/touch drag and keyboard operation with appropriate accessible name/value semantics.

### Implementation

Use the smallest UI-layer component/adapter that fits existing React composition. Do not add global state or a generic cross-application event abstraction. Handle observer/listener cleanup and resize/content changes. Indicator visibility may follow the existing/native transient behavior if it remains discoverable and usable; do not add distracting animation, and respect reduced motion. Hide native visuals only on covered elements after interaction and fallback behavior are tested.

### Verification

Cover long and short content, top/middle/bottom positions, content resize, viewport resize/orientation, listbox and thread picker nested areas, horizontal code overflow, custom accent schemes, keyboard access, pointer operation, and mobile touch scrolling. Ensure the indicator does not obscure focus rings or content and does not cause layout shifts. Use Chromium and WebKit browser checks where available; state any platform/device limitations rather than claiming universal behavior from CSS-only tests.

## Verification

### Automated

- Focused component tests for geometry, synchronization, resize/content updates, accessibility, and cleanup
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `CI=1 npm run test:e2e -- --workers=2`
- `git diff --check`

### Manual / operational

- Test narrow/mobile and desktop viewports in Chromium and WebKit when available.
- Confirm touch/momentum scroll remains native and every hidden native bar has its visible, functioning replacement.

### Not verified / external pending

- iOS physical-device behavior is not established until exercised on an actual iOS/iPadOS device/browser; WebKit automation is useful but not a substitute for that check.
- Full repository lint/tests may currently fail for unrelated reasons recorded in `docs/plans/vercel-build-node-runtime.md`; report exact current evidence.

## Handoff

Shipped behavior: `ScrollIndicators` mounts named custom scrollbars for native document, thread list, listbox, and horizontal code surfaces. It retains native scrolling and only hides platform scrollbar visuals while the matching custom indicator has valid overflow. Chromium/WebKit automated suites pass. Node 24 full lint and unit checks retain the unrelated four-error/two-failure blockers recorded in the separate Vercel build/runtime plan; that plan was not edited. Actual physical iOS/iPadOS Safari behavior remains unverified. No deploy or push was performed.

## Open Questions

- None blocking readiness. During implementation, if the full-page document scrollbar cannot be safely covered without changing layout/focus behavior, stop and ask before narrowing the approved app-wide scope.

## Sources

- WebKit, Safari 18.2 scrollbar support and iOS overlay behavior: https://webkit.org/blog/16301/webkit-features-in-safari-18-2/
- WebKit, Safari 26.2 scrollbar color support: https://webkit.org/blog/17640/webkit-features-for-safari-26-2/
- WebKit issue on iOS `::-webkit-scrollbar` styling: https://bugs.webkit.org/show_bug.cgi?id=246371
