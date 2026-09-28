# Post-facelift facelift

## Current State

- Status: active; shared keyboard scrolling and prompt Escape focus handoff are complete. Typography is queued; constellation accents need a mapping decision.
- Owner: Jonny
- Branch/worktree: `work/v1.2.2/post-facelift-facelift` in `../dorothy-ann-v1.2.2-post-facelift-facelift`, rebased onto local `release/v1.2.2` at `f4458e7` for owner-requested interim release-branch testing. No push or deployment has been authorized.
- Related completed work: [UI facelift: scroll ownership, threads, spacing, and swatches](archive/ui-facelift-scroll-and-threads.md). That plan stays closed and unchanged.
- Verification: `npm ci --no-audit --no-fund`, `npm run lint`, `npm run typecheck`, `npm test` (39 files, 366 passed), `npm run build`, `CI=1 npm run test:e2e -- --workers=2` (26 passed, 10 conditional skips), `git diff --check`. Browser coverage includes Chromium and mobile WebKit; physical-device keyboard testing remains open. Build has the existing large-chunk warning.
- Verification (Escape follow-up): `npm run lint`, `npm run typecheck`, `npm test` (39 files, 368 passed), `npm run build`, `CI=1 npm run test:e2e -- --workers=2` (26 passed, 10 conditional skips), `git diff --check`. The first full e2e run exposed a fixture-dependent route-shell test assumption and a URL wait that also matched `/threads/new?q=...`; both were tightened and the focused and full suites then passed. Physical-device keyboard testing remains open.
- Owner feedback: Escape still requires a click before arrow/page scrolling in the version Jonny tested; determine whether that was the unintegrated release/Production build or this worktree before calling operator validation complete. Double Escape works in his test. He favors semantic color relationships but wants a livelier, spatial constellation and a more visible prompt caret.
- Rebase verification: `npm ci --no-audit --no-fund`, `npm run lint`, `npm run typecheck`, `npm test` (39 files, 373 passed), `npm run build`, `CI=1 npm run test:e2e -- --workers=2` (26 passed, 10 conditional skips), `git diff --check`. Build retains the large-chunk warning.
- Next action: integrate this verified scroll/Escape milestone locally into `release/v1.2.2` for Jonny to test; keep this active plan/worktree for the undecided colors and queued typography. If Escape still fails on the release build, reproduce and diagnose before revising focus behavior.

## Abstract

A follow-up UI component pass after the completed facelift. Restore arrow and page-key navigation for every unified scroll area in the layout, including future registered surfaces, without hijacking inputs or listbox navigation. The separate approved typography change keeps Dorothy Ann's Helvetica-first interface and answer prose while using Source Code Pro only for code-like content. Additional component changes need Jonny's scope; this title is not permission for a general redesign.

## Flow

```text
completed facelift (unchanged) → post-facelift component pass
                                 ├─ unified overflow: focusable scroll areas + local key fallback
                                 ├─ Helvetica UI + answer prose / Source Code Pro code
                                 └─ further tweaks: awaiting scope
```

## Plan Ledger

- [x] P1 — scope the first component tweak: ArrowUp/ArrowDown and PageUp/PageDown should scroll any focused unified layout/code surface that overflows, including future registered areas. Inputs, menus, and nested controls retain their own key behavior. Keep native overflow and existing indicators.
- [x] P2 — overflowing shared scroll surfaces now receive a tab stop and local arrow/page-key fallback. Route and list regions are named; `.app-scroll-surface` registers future layout scrollers (with optional `data-scroll-axis="horizontal"`). Listbox/menu keys remain their own; no global key interception or focus stealing.
- [x] P3 — Playwright verified focused transcript, home, settings, saved-thread list, and newly registered nested layout surface in Chromium and mobile WebKit. Code scrolls horizontally by arrow/page keys; the prompt retains ArrowDown; existing indicator focus/drag and menu locking tests passed. Lint, typecheck, unit tests (366), build, e2e (26 passed, 10 conditional skips), and diff check passed. No physical-device keyboard test was run.
- [x] P4 — an open prompt suggester now consumes Escape locally without arming navigation. Otherwise the first eligible prompt Escape focuses the available route scroller (or blurs if none overflows) and arms the 500 ms pair; a second returns home/new. Modified/composing/repeated Escapes do not count. `/threads` and `/settings` route closes remain unchanged.
- [x] P5 — unit tests cover suggester precedence, second Escape, expiry, modifiers, and repeat. Chromium and mobile WebKit fixture tests verify prompt Escape → transcript focus → page scrolling and paired Escape → home. Existing route Escape and prompt/listbox checks pass; full checks recorded in Current State. Owner-reported behavior is not yet matched to a tested build.
- [~] P6 — decide and scope removal of the Primary accent setting and scheme-role color allocation. `--accent` currently controls prompt focus, scrollbars/indicators, thread selection, focus outlines, blockquotes, and status, while command/evidence/Markdown accents have separate slot policies. Do not change preference/storage behavior or relationship slots until Jonny chooses static roles versus time cycling, contrast handling, and mono behavior.
- [ ] P6a — validate the Escape-to-scroll handoff on Jonny's testable `release/v1.2.2` after interim integration; if it still fails, add a failing browser case before changing focus logic.
- [ ] P7 — establish a reusable monospace font token and load Source Code Pro for browser use with an appropriate license and fallback. Preserve the existing Helvetica-first stack for the interface and answer prose.
- [ ] P8 — apply the mono token to fenced and inline Markdown code, `/commands`, keyboard shortcuts, route-title code, and genuinely technical identifiers. Keep navigation, prompts, headings, answers, ordinary labels, and citations in the sans stack; do not turn whole boxes or answers monospace.
- [ ] P9 — verify loaded-font and fallback rendering, long Markdown answers with inline/fenced code and tables, command swatches, narrow screens, and light/dark themes. Run applicable UI tests, lint, typecheck, build, and `git diff --check`; record what actually ran. Extend verification as further component tweaks are scoped.

## Desired Outcome

The completed facelift behavior remains intact. Readers can focus any overflowing unified layout/code region and scroll with arrow and page keys, while the prompt, menus, and nested controls keep their keys. Helvetica stays the recognizable reading and UI voice; Source Code Pro gives code and command syntax a deliberate, legible secondary voice without turning the interface into a terminal. Future component tweaks have explicit outcomes before code changes begin.

## Current Reality

`src/ui/styles/global.css` defines `--display` and the root font as `"Helvetica Neue", Helvetica, Arial, sans-serif`. `src/ui/App.module.css` gives the signature and route-title code a system monospace stack. `src/ui/styles/primitives.css` styles Markdown code blocks but does not choose a font family for Markdown code; browser defaults apply. No font files are currently bundled. The earlier facelift's scroll, thread-list, spacing, and swatch decisions are complete and documented in its archived plan. Overflow remains native. The shared controller now makes overflowing layout/code surfaces focusable and handles arrow/page keys locally on the surface (mobile WebKit did not scroll the focused transcript natively in the initial fixture test). Listboxes retain their own selection keys and custom indicators remain keyboard-accessible. The prompt still autofocuses and keeps its key behavior. Before this follow-up, PromptBox blurred on Escape without focusing the scroll region, and the global handler did not count that editable Escape; the second did not complete the intended pair. Now prompt Escape transfers focus to an overflowing route scroller and counts toward the same 500 ms pair; a command suggester consumes its own Escape first.

## Scope

### Approved goals

- Let focused unified overflow areas scroll with arrow and page keys: routes, saved-thread list, Markdown code, and future `.app-scroll-surface` layout areas. Retain keyboard access to prompts, menus, links, and custom scrollbars.
- From an idle prompt, an eligible Escape should focus the overflowing route scroller (when available), so arrow and page keys work without a pointer click; keep the second Escape/new-thread and local-menu precedence.
- Keep the existing sans-serif stack for UI and prose; do not introduce another display or body family.
- Give code-like text a consistent Source Code Pro face, with a reliable fallback if the font has not loaded.
- Preserve Markdown legibility, syntax distinction, responsive behavior, and the completed facelift contracts.

### Awaiting scope

- Remove Primary accent from settings and distribute scheme colors across unrelated UI roles using a stable, non-random allocation. Jonny has not yet chosen the mapping/contrast policy; amend this plan and implement only after that decision.
- Additional UI component tweaks Jonny plans to describe. Amend this plan's ledger, boundaries, and verification before implementing any of them.

### Non-goals

- A site-wide typography redesign, new font picker, or general permission to rework all components.
- Making citations, whole answers, labels, or general UI text monospace.
- Changing generated answer contracts, thread behavior, scroll ownership, persistence, or the completed facelift behavior beyond keyboard access to existing unified scroll areas.

## Decisions

- Keep native overflow and the existing custom visual scrollbar. Register overflowing layout/code surfaces as focusable, with local keyboard fallback because mobile WebKit did not scroll a focused thread region with arrow keys in fixture tests. Menus retain their own selection keys and accessible indicator; no global keyboard interception, prompt-autofocus change, or route-shortcut change. Future layout scroll surfaces opt into the shared controller with `.app-scroll-surface`, optionally `data-scroll-axis="horizontal"`.
- An open prompt suggester owns and consumes Escape. Otherwise the idle prompt's first Escape hands focus to the route scroller and counts toward the existing 500 ms pair; the second returns home/new. If no route region overflows, the first Escape simply blurs the prompt but still arms the pair. Modified/composing Escape does not count. Do not change `/threads` or `/settings` route-close behavior.
- Jonny chose Helvetica + Source Code Pro over a replacement sans-serif. Keep Helvetica for navigation, prompts, headings, and all answer prose.
- Use Source Code Pro for fenced and inline code, `/commands`, shortcuts, and technical identifiers only where they are actually rendered as code-like content. Avoid classifying ordinary text as code merely because it contains a number or label.
- Prefer a self-hosted licensed web-font asset for predictable browser rendering; retain a system monospace fallback. Do not assume a locally installed font is available to every user.
- Keep the previous facelift archived; this is a new follow-up plan on its own branch/worktree.

## Detailed Plan

1. In the shared scroll controller, give overflowing layout/code areas a tab stop and local arrow/page-key navigation. Name route and list regions, register future layout areas with `.app-scroll-surface`, and avoid overriding input, menu, link, and nested code handling.
2. Record any further component requests and agree on their scope and tests before implementing them.
3. Source the needed Source Code Pro web-font files and license; load only weights actually used, and define a shared monospace token without changing the body font.
4. Replace scattered system-mono declarations and cover Markdown `code` and `pre code` deliberately. Check rules that force code to inherit prose styling before deciding whether they represent true code or merely a semantic tag.
5. Compare representative UI and transcript screens before/after, including mobile wrapping and horizontally scrollable code blocks; adjust code sizing/line-height only where necessary.

## Verification

- Test arrows and PageUp/PageDown on overflowing transcript, home/settings, saved-thread list, and newly registered nested layout area (including focus by pointer); verify horizontal code scrolling and prompt/listbox/nested interactive key ownership. Keep the indicator's keyboard and wheel movement tests.
- Check computed font family for answer prose versus inline/fenced code, route-title code, command syntax, and shortcuts, both after font load and when the asset is unavailable.
- Visually check long answers, tables, code blocks, command tiles, and keyboard-heavy UI at narrow and wide viewports in light and dark themes.
- Add focused checks for each subsequently approved component tweak; run applicable repository checks and report manual device gaps. Do not claim checks before they run.

## Open Questions

- Jonny likes semantic color relationships but wants them to feel less static. Should the layout distribute distinct hues in a deliberate spatial progression, while the caret alone rotates over time, or should the prompt border visibly track the caret too? Actual DOM-order indexing can shift after dynamic content and is not recommended; semantic region order/route seed can produce stable but lively placement. Keep related descendants sharing an inherited role token, and maintain contrast when accent colors are used as text/focus against light/dark backgrounds.
- A thicker native prompt caret has no portable CSS width control. `caret-shape: block` is a limited-availability shape option, not an adjustable-thickness bar; a custom overlay would take responsibility for IME, selection, mobile editing, bidi, and caret positioning. Prefer strengthening the prompt focus treatment unless Jonny explicitly chooses an experimental shape.
- `mono` has only one accent hue, so unrelated roles cannot receive distinct colors without changing that scheme. Should it remain intentionally monochrome?
- Which other UI components and behaviors does Jonny want to adjust in this pass?
- Which existing technical identifier surfaces, if any, need mono beyond the explicit code/command/shortcut locations? Decide from actual rendered UI, not a blanket selector.

## Handoff

- Shared keyboard scrolling and prompt Escape handoff are implemented and fixture-verified; Jonny requested interim local integration into the release branch for his testing. Typography is approved but not started, and primary-accent removal needs a mapping decision before code. Physical-device keyboard behavior and release-branch operator validation remain open. Do not implement unspecific UI tweaks. The archived facelift is not reopened; later changes remain on `work/v1.2.2/post-facelift-facelift` until scoped and verified.
