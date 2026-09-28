# Post-facelift facelift

## Current State

- Status: planning; no implementation started.
- Owner: Jonny
- Branch/worktree: `work/v1.2.2/post-facelift-facelift` in `../dorothy-ann-v1.2.2-post-facelift-facelift`, branched from `release/v1.2.2` at `b38a3a6`. This local work branch targets the v1.2.2 candidate, not Production; no push or deployment has been authorized.
- Related completed work: [UI facelift: scroll ownership, threads, spacing, and swatches](archive/ui-facelift-scroll-and-threads.md). That plan stays closed and unchanged.
- Next action: collect and scope Jonny's upcoming UI component tweaks here before implementing them. The Helvetica + Source Code Pro direction is already approved; no other tweaks are assumed.

## Abstract

A follow-up UI component pass after the completed facelift. The first agreed change keeps Dorothy Ann's Helvetica-first interface and answer prose while using Source Code Pro only for code-like content. Additional component changes will be added only when Jonny describes and approves them; do not treat this plan title as permission for a general redesign.

## Flow

```text
completed facelift (unchanged) → post-facelift component pass
                                 ├─ Helvetica UI + answer prose / Source Code Pro code
                                 └─ further tweaks: awaiting scope
```

## Plan Ledger

- [ ] P1 — scope upcoming UI component tweaks with Jonny, recording each intended behavior and verification before implementation. Do not infer changes from the broad plan title.
- [ ] P2 — establish a reusable monospace font token and load Source Code Pro for browser use with an appropriate license and fallback. Preserve the existing Helvetica-first stack for the interface and answer prose.
- [ ] P3 — apply the mono token to fenced and inline Markdown code, `/commands`, keyboard shortcuts, route-title code, and genuinely technical identifiers. Keep navigation, prompts, headings, answers, ordinary labels, and citations in the sans stack; do not turn whole boxes or answers monospace.
- [ ] P4 — verify loaded-font and fallback rendering, long Markdown answers with inline/fenced code and tables, command swatches, narrow screens, and light/dark themes. Run applicable UI tests, lint, typecheck, build, and `git diff --check`; record what actually ran. Extend verification as further component tweaks are scoped.

## Desired Outcome

The completed facelift behavior remains intact. Helvetica stays the recognizable reading and UI voice; Source Code Pro gives code and command syntax a deliberate, legible secondary voice without turning the interface into a terminal. Future component tweaks have explicit outcomes before code changes begin.

## Current Reality

`src/ui/styles/global.css` defines `--display` and the root font as `"Helvetica Neue", Helvetica, Arial, sans-serif`. `src/ui/App.module.css` gives the signature and route-title code a system monospace stack. `src/ui/styles/primitives.css` styles Markdown code blocks but does not choose a font family for Markdown code; browser defaults apply. No font files are currently bundled. The earlier facelift's scroll, thread-list, spacing, and swatch decisions are complete and documented in its archived plan.

## Scope

### Approved goals

- Keep the existing sans-serif stack for UI and prose; do not introduce another display or body family.
- Give code-like text a consistent Source Code Pro face, with a reliable fallback if the font has not loaded.
- Preserve Markdown legibility, syntax distinction, responsive behavior, and the completed facelift contracts.

### Awaiting scope

- Additional UI component tweaks Jonny plans to describe. Amend this plan's ledger, boundaries, and verification before implementing any of them.

### Non-goals

- A site-wide typography redesign, new font picker, or general permission to rework all components.
- Making citations, whole answers, labels, or general UI text monospace.
- Changing generated answer contracts, thread behavior, scroll ownership, persistence, or the completed facelift behavior without a new decision.

## Decisions

- Jonny chose Helvetica + Source Code Pro over a replacement sans-serif. Keep Helvetica for navigation, prompts, headings, and all answer prose.
- Use Source Code Pro for fenced and inline code, `/commands`, shortcuts, and technical identifiers only where they are actually rendered as code-like content. Avoid classifying ordinary text as code merely because it contains a number or label.
- Prefer a self-hosted licensed web-font asset for predictable browser rendering; retain a system monospace fallback. Do not assume a locally installed font is available to every user.
- Keep the previous facelift archived; this is a new follow-up plan on its own branch/worktree.

## Detailed Plan

1. Record the forthcoming component requests and agree on scope and tests before implementing them.
2. Source the needed Source Code Pro web-font files and license; load only weights actually used, and define a shared monospace token without changing the body font.
3. Replace scattered system-mono declarations and cover Markdown `code` and `pre code` deliberately. Check rules that force code to inherit prose styling before deciding whether they represent true code or merely a semantic tag.
4. Compare representative UI and transcript screens before/after, including mobile wrapping and horizontally scrollable code blocks; adjust code sizing/line-height only where necessary.

## Verification

- Check computed font family for answer prose versus inline/fenced code, route-title code, command syntax, and shortcuts, both after font load and when the asset is unavailable.
- Visually check long answers, tables, code blocks, command tiles, and keyboard-heavy UI at narrow and wide viewports in light and dark themes.
- Add focused checks for each subsequently approved component tweak; run applicable repository checks and report manual device gaps. Do not claim checks before they run.

## Open Questions

- Which other UI components and behaviors does Jonny want to adjust in this pass?
- Which existing technical identifier surfaces, if any, need mono beyond the explicit code/command/shortcut locations? Decide from actual rendered UI, not a blanket selector.

## Handoff

- Plan-only so far; do not implement unspecific UI tweaks. The archived facelift is not reopened. Keep work and commits on `work/v1.2.2/post-facelift-facelift`, then integrate through the release workflow once scoped and verified.
