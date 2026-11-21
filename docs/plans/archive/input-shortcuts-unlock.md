# Input caret, shortcuts, and unlock alignment

## Current State

- Status: done. The implementation commit `840ed05` is an ancestor of local and pushed `release/v1.2.2` (at `93710c7` when this plan closed); no plan PR or release tag yet. Jonny accepted the current visual behavior for now. Physical-device/IME verification remains unperformed and is an accepted gap, not a passed check. No agent push or deployment was part of this closure.
- The [completed facelift plan](post-facelift-facelift.md) remains archived. This plan amends only its block-shaped caret choice, not the 4-second color cycle or native blink. The [route-layout plan](route-layout-visual-correction.md) owns full-width route layout and the shared prompt footer.

## Abstract

Keep the native editing caret but return its shape to the platform default; update global Alt shortcuts and homepage hints; align `/unlock`'s title with other route titles and make focused editable text fields visibly highlighted through a shared rule rather than a one-off unlock override.

## Flow

inspect existing contracts → change only scoped CSS/shortcuts/docs → test native editing, focus, responsive layout, and shortcut conflicts → local verification → owner review on release after separately requested integration.

## Plan Ledger

- [x] U1 — remove the `caret-shape: block` declaration only. Keep the current 32s color animation with 4s phases, reduced-motion behavior, and browser-native blink. Avoid guessed thickness or a simulated caret.
- [x] U2 — map `Alt+,` to `/settings`, `Alt+A` to `/new`, retain `Alt+S` for `/threads`, and update homepage hints, README, and `AGENTS.md` keyboard contract. Keep IME/editing and Escape behavior intact; remove the old `Alt+C` mapping.
- [x] U3 — remove `/unlock`'s centered title constraint; preserve full-width passphrase input. Centralize text-input focus highlighting so prompt, fuzzy/thread search, unlock, and other text-entry inputs receive a consistent focus cue without a special unlock-only rule.
- [x] U4 — focused UI (53 passed) and browser (4 passed), lint, typecheck, unit (383 passed), build, full fixture e2e (52 passed, 10 conditional skips), and `git diff --check` passed. Physical-device/IME testing was not run; owner visual acceptance was recorded at plan closure. The original isolated-branch verification did not itself authorize integration, push, or deployment.
- [x] U5 — confirmed `840ed05` is already an ancestor of `release/v1.2.2`; Jonny accepted the current visual behavior for now and explicitly deferred physical-device/IME verification. Close and archive the plan without claiming that external check passed.

## Desired Outcome

A default-shaped native caret with the existing color timing; discoverable, tested navigation shortcuts; left-aligned `/unlock` title; and a visible per-screen accent on every focused text-entry control without double rings or breaking layout.

## Current Reality

Before this change, the release baseline applied a 32-second caret-color cycle and feature-gated `caret-shape: block`; it mapped `Alt+S` and `Alt+C`, leaving `Alt+A` unassigned. `.unlockCard h1` centered the title over a full-width passphrase field, and the unlock form lacked the prompt/search focus border. The release branch now removes the block rule and centered title constraint, updates shortcuts/hints/docs, and gives direct-child text-input forms a shared focus border while standalone text fields receive the per-screen accent. No simulated caret or authentication change.

## Scope

Only UI input focus/caret shape, navigation shortcut hints/contracts, unlock heading alignment, and focused tests/docs. Preserve existing native caret blink/color phases, keyboard and IME behavior, scroll focus, selection, thread-row colors, authentication, navigation semantics, font faces, and route scrolling. No new simulated cursor, speculative Google clone, provider/runtime/storage changes, or Vercel state changes.

## Decisions

- Use native caret shape (`auto`, by removing the feature-gated block declaration). [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/caret-shape) describes `auto` as platform-defined; it provides no portable pixel thickness or blink cadence. Public [Chromium composebox changes](https://github.com/chromium/chromium/commit/e3a9a4087290267efcd8bfce8eeacb3d792be7a1) mention a 5-second color animation and contexts that disable it, but do not establish the exact Google AI Mode web caret in Jonny's screenshot. Keep the already-approved four-second color phases instead of copying an unrelated implementation.
- Use `KeyboardEvent.code === "Comma"` with `altKey` for the settings shortcut so an Alt-modified printable character does not depend on keyboard layout.
- Prefer a shared text-entry focus rule plus a shared bordered-form rule over an unlock-specific `:focus-within` patch; retain a visible cue for standalone inputs and a single outer border on wrapped inputs.

## Detailed Plan

1. Update `global.css` caret shape only. Test default computed shape on supporting browsers and preserve color animation/reduced-motion coverage.
2. Update `App.tsx`, `HomeRoute.tsx`, README, AGENTS and route tests for all three Alt shortcuts, including Alt from a focused prompt; assert old Alt+C no longer navigates.
3. Remove the centered `.unlockCard h1` override. Apply shared form/input focus selectors after inspecting existing prompt, fuzzy/thread search, and primitives specificity. Verify keyboard *and pointer* focus, light/dark, scheme color, accessible visible focus, no double ring, 360px/desktop width, and unlock behavior.
4. Complete checks and capture gaps before integration into `release/v1.2.2`; that branch may be the active Production Branch, so do not push without exact-command approval. Integration is now confirmed by ancestry; this plan closure adds no deployment.

## Verification

`npm ci`, `npm run lint`, `npm run typecheck`, focused Vitest (53 passed), `npm test` (383 passed), `npm run build`, focused Chromium/mobile WebKit (4 passed), full `npm run test:e2e` (52 passed, 10 conditional telemetry skips), and `git diff --check` passed. Build retains its large-chunk warning. An initial full browser run exposed an **existing release-baseline** smoke assertion comparing scrollbar color to obsolete `--accent` after the archived V12 focus-color change; it failed identically on clean local release (Chromium/WebKit). Corrected only that assertion to `--focus-accent` and reran focused/full browser tests successfully. Physical keyboard/IME and a measured visual comparison were not performed; the owner accepted the current appearance for now.

## Open Questions

- No open item for this plan. Integration is confirmed, and Jonny accepted the current visual behavior. Physical-device/IME behavior remains unverified; revisit only if a reproducible issue is reported.
- The reference screenshot shows Google AI Mode's composebox but no measured caret or public web-specific blink/thickness contract. Revisit only if Jonny supplies measurable browser evidence; do not rework the native caret based on a static image.

## Handoff

All ledger items are closed. The implementation is present on `release/v1.2.2`; Jonny accepted the current visual behavior for now, with physical-device/IME checks deferred. Leave the archived facelift record untouched and let this later amendment take precedence where they disagree. No release freeze or new deployment is implied.

<|°_°|>
