# Post-facelift facelift

## Current State

- Status: active. Keyboard scrolling and prompt Escape handoff are implemented and integrated locally; the color and typography items below are scoped but not implemented.
- Owner: Jonny
- Branch/worktree: `work/v1.2.2/post-facelift-facelift` in `../dorothy-ann-v1.2.2-post-facelift-facelift`. The work branch contains plan-only color decisions after the verified keyboard milestone. Local `release/v1.2.2` advanced independently to `f2a64c7` as of this planning pass; rebase/retest the work branch before the next integration. The release branch, not this worktree, is Jonny's testable branch. No push or deployment is authorized.
- Related completed work: [UI facelift: scroll ownership, threads, spacing, and swatches](archive/ui-facelift-scroll-and-threads.md). It stays closed.
- Integrated milestone: shared arrow/page scrolling, accessible scroll regions, prompt Escape → scroll focus, and paired Escape → home were merged locally at `63a8f5a`; plan handoff was recorded at `1b68496`. No color or font code has been integrated.
- Verification of that milestone on both the rebased worktree and local release: `npm ci --no-audit --no-fund`, `npm run lint`, `npm run typecheck`, `npm test` (39 files, 373 passed), `npm run build`, `CI=1 npm run test:e2e -- --workers=2` (26 passed, 10 conditional skips), and `git diff --check`. Build retained a large-chunk warning. Physical-device keyboard and owner validation on the integrated build remain open.
- Next action: implement the newly approved color items in ledger order on this work branch, then the previously approved typography. Rebase/retest before any further owner-requested local release integration; do not silently push to a release branch that may be Vercel's Production Branch.

## Abstract

Keep the completed native overflow and keyboard behavior. Remove the user-selectable Primary accent. Use ink/paper for the *editing or scrolling focus cue*, not for thread-row selection. Give each visible scrollbar thumb a scheme color drawn unpredictably on page load; let thread-row highlights advance through scheme accents each time the active row changes by pointer or keyboard, wrapping both the row index and hue sequence. Keep Helvetica for UI and prose and add Source Code Pro only to code-like text. Other color-constellation redesign is out of scope.

## Flow

```text
editing focus: native caret + input focus border ──ink on paper (or paper on ink)
scroll focus: matching indicator cue ──ink/paper; thumb ──scheme hue drawn for this load
/threads: active row changes ──next hue ──wrap hue; arrow keys wrap row index
other commands/evidence/Markdown accents ──existing relationship policies
```

## Plan Ledger

`[ ]` pending, `[~]` in progress, `[x]` verified; execute pending implementation items in the order shown. The owner-validation item is external and does not block unrelated color/font work.

- [x] P1–P3 — scope, implement, and verify shared scroll-surface keyboard navigation on overflowing routes, saved threads, Markdown code, and registered future layout surfaces. Inputs and menus retain their keys; Chromium and mobile WebKit fixture checks passed.
- [x] P4–P5 — scope, implement, and verify prompt Escape handoff and 500 ms paired Escape. The prompt suggester consumes Escape first; route-close and modified/composing/repeated-key behavior remain intact. Unit and browser fixture checks passed.
- [x] P6 — record Jonny's narrowed color decision: ink/paper means focus in editing/scrolling, **not** selected thread rows; scrollbar thumbs and row highlights use scheme accents. This item is a spec decision, not implementation.
- [ ] C1 — remove the Primary accent setting and its active preference application. Preserve color-scheme and theme settings; ignore (do not interpret or delete) existing `dorothy-ann-primary-accent` storage values. Keep `--accent` only as an explicit compatibility/fallback token while migrating its consumers; never use it to pick a single UI-wide hue. Verify old saved values have no visible effect.
- [ ] C2 — implement ink/paper focus for the native prompt and `/threads` search carets and their existing focus borders, and for scroll regions/indicators. Remove the native caret hue-rotation behavior from these inputs; retain native editing/IME, no fake or thicker caret. Suppress the full-height scheme-colored transcript outline only when a matching accessible indicator supplies a visible ink/paper focus cue; use an ink/paper outline on the scroll surface as fallback if the custom indicator is absent. Do not remove the global focus-visible safety net for other controls. Test keyboard focus, pointer focus, light/dark, auto, forced-colors, and reduced-motion behavior.
- [ ] C3 — assign scrollbar *thumb* hues from the selected scheme using a freshly drawn random permutation on each document load. Assign distinct palette slots to simultaneous scroll surfaces until the palette is exhausted; keep a mounted surface's slot stable across updates/scrolling. Apply the same slot to the custom indicator and native fallback scrollbar. A new load redraws rather than restoring a preference; repeats across independent loads are allowed. Monochrome has one hue and therefore cannot make different bars distinct; repeated colors in a scheme also cannot be forced unique without changing its palette. The focus cue stays ink/paper regardless of thumb hue. Do not randomize layout, keyboard behavior, command swatches, or source identity.
- [ ] C4 — make `/threads` active-row background use the current scheme's ordered `--accent-1..8` sequence, mixed with paper enough to retain readable ink text. On a *change to a different active row* via ArrowUp/ArrowDown or pointer entry, advance the hue slot by one modulo available palette slots; repeating the same row, rendering, and scrolling do not advance it. ArrowDown on the final visible row wraps to the first, ArrowUp on the first wraps to the final, and hue rotation continues independently of row index. Initialize active index and hue to zero on mount; query/filter changes retain the current hue without advancing it and clamp/reset active index to a valid row. Empty results are safe. Keep hover and keyboard on the same active state, and preserve Enter, Delete/Backspace confirmation, and Escape behavior. In `mono`, the slot stays zero.
- [ ] C5 — verify C1–C4: stored legacy primary preference ignored; schemes and light/dark/auto, several simultaneous scrollbars, a stubbed random draw per new page and stability within a page, no accidental focus-colored thumb/row, keyboard focus cues with and without an indicator, caret editing/composition, thread hover/arrow/wrap/color progression, filtering and empty results, keyboard activation/deletion, and contrast. Run focused UI/browser checks, then lint, typecheck, unit tests, build, e2e, and `git diff --check`; record actual results and manual gaps.
- [ ] P7 — bundle licensed Source Code Pro web fonts at weights actually used, define a shared mono token and system fallback, and keep the current Helvetica Neue → Helvetica → Arial UI/prose stack.
- [ ] P8 — apply the mono token only to Markdown inline/fenced code, `/commands`, keyboard shortcuts, route-title code, signature, and genuinely code-like identifiers. Audit rules that currently force code to inherit prose. Keep navigation, prompts, headings, answers, labels, and citations in sans.
- [ ] P9 — verify computed font families after load and under font failure, Markdown tables/long answers/code blocks, mobile widths and horizontal code scrolling, light/dark themes, and existing keyboard focus. Run applicable repository checks and record results.
- [ ] P6a — Jonny validates Escape → scroll → arrow/page behavior on his local `release/v1.2.2` at or after `63a8f5a`. If it still requires a click, reproduce that exact focus state against the same build, add a failing browser case, and fix separately before marking it closed. Physical-device keyboard behavior also remains external.

## Desired Outcome

The interface clearly distinguishes *where editing/scrolling focus is* (ink/paper) from *which row is active* (a rotating scheme tint) and *which scroll surface is moving* (its own scheme-colored thumb). No Primary accent control or hidden preference picks one color for everything. Keyboard navigation remains visible and functional. Code has a deliberate Source Code Pro face without replacing Helvetica prose.

## Current Reality

- `src/ui/styles/global.css` defines ink/paper, eight accent slots per scheme, one `--accent` fallback, a global scheme-colored `:focus-visible` outline, and already-inverted `::selection`. `src/ui/App.tsx` applies the persisted Primary accent to `--accent`.
- `SettingsBox`/`SettingsRoute` expose and store Primary accent. The prompt and thread-search native caret currently cycle through scheme slots every 2 seconds via `use-rotating-caret-color.ts`; their focus borders, scrollbars, thread-row highlights, quotes, and focus outlines also use `--accent`. Command swatches and evidence/Markdown relations have separate mappings that must not be flattened by this work.
- `ScrollIndicators` mounts separate accessible indicators for overflowing surfaces and temporarily makes layout/code surfaces focusable; the new transcript focus exposes the global 3px yellow outline around an entire route. Indicators are portaled to `document.body`, so their color/focus cue cannot rely on inheriting the scroll surface's local CSS variables.
- `ThreadsBox` currently clamps ArrowUp/ArrowDown at list ends; hover selects the same active index, and the row tint is fixed to `--accent`. The menu/listbox active styles are separate and remain out of this row-color change.
- The source text still says no fonts are bundled. Typography work has not begun.

## Scope

### Goals

- Color the *native insertion caret* and existing focus borders of the prompt and `/threads` search in ink/paper; color the focused scroll region or its matching indicator in ink/paper. Keep a visible accessible focus cue; avoid a giant accent-colored transcript frame.
- Randomize only scrollbar thumb accent slots at document load, and rotate only `/threads` active-row highlights on user selection movement. Retain the existing ordered palette, dark/light variants, and source/command mappings.
- Remove Primary accent from settings and effective preference behavior without destructive storage migration.
- Ship the approved Helvetica + Source Code Pro split without changing answer or prompt behavior.

### Non-goals

- Inverting selected evidence, menus, command chips, links, or buttons as part of this limited focus decision; their keyboard focus must remain visible, but redesigning those states needs a separate request.
- Timed animation of row highlights or scrollbar hues, random palette colors outside the chosen scheme, guaranteed distinct hues in mono or duplicate-color palettes, or a new accent preference.
- A custom/fake caret, a portable caret-width promise, or changing keyboard shortcuts, scroll ownership, persistence, thread search ranking, research behavior, or answer contracts.
- Integrating unfinished font/color work into the release branch or pushing/deploying without the owner-requested release workflow.

## Decisions

- **Focus vs constellation:** editing/scrolling focus is ink/paper. Thread-row selection is **not** focus color; it moves through the scheme. Scrollbar thumbs are decorative scheme colors even when their surface has monochrome focus.
- **Cursor:** keep a native thin insertion caret and replace its hue rotation with an ink/paper caret in the prompt and thread search. CSS does not provide a portable numeric caret thickness; `caret-shape: block` is limited availability and is not a thicker bar. No overlay or companion mark in this pass.
- **Randomness:** one fresh randomized palette order per document load, never persisted; a repeated hue on a later load is valid randomness. Stub the random source in tests, not the production color choice. Distinctness is bounded by actual palette variety.
- **Thread row sequence:** user-driven active-index change increments an independent palette counter. Both row navigation and hue sequence wrap; filtering does not consume a color. Selected-row fill remains a tint with readable text, not an ink/paper inversion.
- **Preserved relationships:** command hue order/AA foreground choices and source/evidence/citation accent identity remain independent. Monochrome remains monochrome.
- **Delivery:** keyboard/Escape milestone is only local on `release/v1.2.2`; Jonny tests release branches, not worktrees. Future color/font work stays on the isolated work branch until verified and explicitly integrated.

## Detailed Plan

1. After rebasing this work branch onto the current release tip, inspect every `--accent` consumer and classify it as caret/editing focus, scroll focus/thumb, thread active row, independent relationship color, or unaffected fallback. Change only the scoped categories; remove the Primary accent UI/runtime path and add a test for legacy storage being ignored.
2. Make the ink/paper editing and scroll focus cues explicit. Give the portaled indicator a corresponding focused state; preserve a native scrollbar/focus-outline fallback, screen-reader labels, and its arrow/page/drag behavior. Verify contrast rather than relying on color alone.
3. Generate one bounded random permutation of scheme slots at app load in the shared scroll controller. Give each mounted surface a slot; apply it to the thumb and native scrollbar, not the focus ring. Keep theme changes reactive through the palette tokens.
4. Split thread active index from hue position in `ThreadsBox`; advance hue only on effective user moves, add wraparound navigation, and use the selected scheme's ordered CSS slot. Retain accessible active semantics and confirmation behavior.
5. Run focused and full verification for the color work and update this plan's Current State/Handoff before any release integration.
6. Complete P7–P9 for typography in the same isolated work branch, with their own verification milestone. Jonny may request local interim integration into `release/v1.2.2` to test; never describe worktree-only changes as available in his build.

## Verification

- Color: fixture UI and browser tests for focus placement (including Escape handoff), caret/style contrast, random scroll hue assignment and mount stability, multi-surface distinctness where possible, fallback native scrollbar, row movement and hue wrapping, hover/keyboard equivalence, filtering, action keys, all schemes and theme modes, and text legibility. Re-run route-scroll and swatch contrast tests; check forced-colors and reduced-motion behavior. Physical-device keyboard/IME remains an owner validation gap unless actually tested.
- Typography: computed font family for sans prose versus code, font-load failure, Markdown/table/code/layout regressions, keyboard focus, and light/dark/mobile.
- Integration: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `CI=1 npm run test:e2e -- --workers=2`, `git diff --check`, `git status`; report warnings and conditional skips. Rebase/retest after release advances. No release push or Vercel mutation is authorized by this plan.

## Open Questions

- No color/typography implementation decision is blocking. Later visual tweaks need their own explicit scope here before code.
- Did Jonny's release-branch test after `63a8f5a` confirm Escape hands focus to a long scroll surface without a click? This is external validation, not evidence for or against the fixture checks.
- Does a physical iOS/iPadOS keyboard and IME preserve the same focus behavior? Not yet verified.

## Handoff

- This planning update changes no UI code. Implement C1–C5, then P7–P9 on `work/v1.2.2/post-facelift-facelift`; keep P6a open for owner validation. Commit verified milestones with `<|°_°|>`. Only `release/v1.2.2` is Jonny's testable branch. This work branch is behind the advancing release branch and must be rebased/retested before integration; do not push or deploy without separate authorization. The archived facelift remains closed.
