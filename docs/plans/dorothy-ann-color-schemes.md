# Dorothy Ann — playful color schemes

## Current State

- Status: complete
- Last updated: 2026-09-15
- Current focus: color schemes and primary accent options implemented
- Next action: commit the fixed accent refinement

## Handoff

The v1.0.0 launch is complete in [`dorothy-ann-v1.0.0.md`](./dorothy-ann-v1.0.0.md). This plan remains feature-scoped: color schemes affect the UI theme contract, browser persistence, accessibility, and transcript/source presentation, but not domain research orchestration.

The initial color scheme implementation is complete and committed. This follow-up adds two scoped refinements: selected Evidence items use their source identity accent, and Settings exposes a Primary accent selector for decorations outside the rotating constellation. The primary accent remains UI-only and does not alter source/citation identity. Settings also includes the fixed `#fbf719` option alongside the active scheme's default and named accents.

The current design direction is a colorful hypertext constellation. Each source gets a deterministic accent keyed by stable `sourceId`; its Evidence-box link and every corresponding answer citation share that accent. Headings inside the synthesized Markdown answer use a separate deterministic rotation for reading rhythm, not semantic meaning. Route and application UI headings are out of scope. Color supplements visible source numbers, labels, links, and structure rather than replacing them. No animation or per-stream random recoloring.

The three stored choices are `mono`, `catppuccin`, and `rose-pine`. Catppuccin and Rosé Pine are curated, official-palette-inspired accent sets maintained in Dorothy Ann's UI theme layer; no external theme package or complete imported theme is required. Each inspired scheme has separately tested light-surface and dark-surface accent values over the app's white/black surfaces.

Current UI has one theme mechanism in `src/ui/styles/global.css` and `ThemeControl` in `src/ui/App.tsx`. It persists `auto`, `light`, or `dark` in `localStorage` and exposes only `--paper`, `--ink`, `--muted`, `--accent`, `--line`, and related display variables. The current accent is yellow (`#f6c945`).

## Goal

Add a user-configurable color scheme that makes the interface and research output quick to parse, playful to read, and explicit about relationships between claims and evidence. Foreground/background remain high-contrast and stable within each scheme. Non-mono schemes use a deterministic color constellation: a source's accent follows it from the Evidence box to its citations, while headings and other repeated UI landmarks rotate through a complementary palette.

## Proposed Scheme Choices

The first setting should offer exactly three user-facing choices:

- `mono` — the existing white/black presentation: white paper, black ink in light mode; black paper, white ink in dark mode. Existing yellow remains the primary accent.
- `catppuccin` — Catppuccin-inspired accents on the existing high-contrast white/black foreground/background. Default accent family: lavender, mauve, blue, teal, green, yellow, peach, and maroon.
- `rose-pine` — Rosé Pine-inspired accents on the existing high-contrast white/black foreground/background. Default accent family: iris, foam, pine, gold, rose, love, and muted variants.

The initial implementation should not introduce tinted page backgrounds or low-contrast body text. This preserves the requested white/black foreground/background and keeps long transcripts readable. The `mono` scheme remains the restrained compatibility mode. Catppuccin and Rosé Pine schemes add the playful relational treatment: accent colors, borders, underlines, selection fills, labels, citation markers, source links, and other bounded decoration.

The named schemes are accent palettes rather than complete official themes. Curated values should draw from recognizable Catppuccin and Rosé Pine palette families, retain the app's white/black surfaces, and include a brief attribution/source comment in the UI theme module.

## Visual Direction

Favor a lively, non-hierarchical color rhythm:

```text
page surface:     white / black
body text:        black / white
answer headings:  rotating accents A–C
command hints:     rotating accent D
source links:      source identity accent
citations:         matching source accent
research plan:     rotating accents E + F
selected thread:   rotating accent G
focus ring:        current scheme focus accent
```

“Rotating” means a deterministic palette assignment across repeated/adjacent elements, not an animated color cycle. Color must not move or flicker while a user reads or while an SSE stream updates. Assign colors using stable element position or stable source/query identity so new streamed content does not recolor earlier content.

Use color as a playful parsing aid, not as the sole meaning carrier:

- retain labels, text, borders, underlines, and source numbering alongside color;
- never make body text depend on a bright accent for readability;
- preserve visible focus and selected states in every scheme;
- keep citations and source links distinguishable when printed/exported, where color may disappear;
- keep `prefers-reduced-motion` behavior unchanged because there is no color animation requirement.

## Relational Color Model

The themed schemes should behave like a colorful hypertext constellation rather than a random rainbow:

> use color to preserve relationships across distance, and use rotation to make the page pleasurable to scan.

```text
claim in answer ── source accent ── citation marker
                         │
                         └── matching Evidence-box link
```

### Source/citation identity

Each source receives a deterministic palette slot from its stable `sourceId`. The UI policy should expose an equivalent of `sourceAccentSlot(sourceId: string, paletteSize: number): number`. The same slot colors the source link in the Evidence box and every citation marker that points to that source. The mapping must survive React rerenders, SSE chunks, and source-list updates; it must not be based only on the current array index. When the palette has fewer usable contrast-safe colors than sources, slots may repeat, but the source number, title, and link target remain the authoritative identity.

Use the source accent primarily on Evidence-box link text and citation text, retaining visible underlines, citation numbers, and link targets as non-color identity. A small marker or restrained border may reinforce the relationship where contrast testing supports it; do not flood either surface with bright fills. The full source title and answer prose remain readable.

### Synthesized-answer heading rhythm

Headings inside the synthesized Markdown answer are decorative reading landmarks rather than evidence identities. Render the live and persisted answer through the existing sanitized Markdown renderer, with custom `h1`–`h6` components that assign accents deterministically by document heading order. Rotating colors should make conceptual chunks easier and more pleasurable to scan, but must not imply that heading color carries semantic meaning. Route and application UI headings remain unchanged and out of scope.

### Learning-oriented intent

This supports active reading and epistemic scaffolding by making the path from claim to citation to inspectable evidence visible. It externalizes source relationships instead of requiring the reader to remember them, while preserving the reader's freedom to follow the answer nonlinearly. The interaction should feel playful, but the color grammar must remain learnable and stable.

## Design Tokens

Extend global tokens with a provider-neutral, UI-only palette contract. Candidate tokens:

```css
--paper
--ink
--muted
--line
--focus
--accent
--accent-1 ... --accent-8
--accent-contrast-1 ... --accent-contrast-8
--selection
--selection-border
--source-accent-1 ... --source-accent-8
--source-accent-contrast-1 ... --source-accent-contrast-8
--heading-accent-1 ... --heading-accent-8
```

`--accent` remains the primary compatibility token. Existing components should continue to work while gradually adopting role-specific classes/tokens. Avoid scattering hex values through component CSS.

Use CSS custom properties for the palette and a `data-color-scheme` attribute on `document.documentElement`. Keep appearance/scheme selection separate in code even if both currently live in Settings:

```text
appearance: auto | light | dark
color scheme: mono | catppuccin | rose-pine
```

The `mono` scheme should preserve current appearance behavior. Catppuccin and Rosé Pine should respect the selected light/dark surface mode while retaining the same scheme accent family.

## Settings UX

Keep the existing `/settings` surface compact. Add a second labeled select beside/under Appearance:

```text
Appearance       auto
Colors           mono
Primary accent   scheme default
```

User-facing labels may be `mono`, `catppuccin`, and `rose pine`; stored values remain stable kebab-free identifiers. Persist the setting in local storage under a new key, for example `dorothy-ann-color-scheme`. Invalid or missing values fall back to `mono`. Existing users must retain their current appearance setting and must not be forced through a migration prompt.

Apply the scheme before first meaningful paint where practical to reduce a flash of the default palette. Keep the implementation browser-local; no server, thread, export, or provider contract should carry the selected UI scheme.

## Element Mapping

Initial mapping should cover the current visible surfaces:

- synthesized-answer Markdown headings, using a stable heading rotation;
- command hints and inline `<code>` labels;
- prompt/finder focus and borders;
- selected thread row and delete affordance;
- research direction block and generated-search query text;
- every Evidence-box source link, with one stable accent per source identity;
- every answer citation, matching the accent of its Evidence-box source;
- selected Evidence item highlighting, using that item's same source identity accent;
- evidence/source cards and source count markers;
- loader bars and progress labels;
- buttons, separators, and underlines where a bounded accent improves scanning.

Do not color every word or every paragraph. Use relational color where the reader needs to follow a connection, and repeatable accent rotation where the reader benefits from visual rhythm. The research answer itself should remain primarily `--ink`, with citations carrying source identity through accent plus their visible number.

## Accessibility and Export

- Verify contrast for body text, muted text, focus rings, links, citation markers, selected rows, and controls in all three schemes and both appearance modes.
- Keep `:focus-visible` at least as prominent as today’s yellow focus ring.
- Ensure selection is communicated by more than color through background/outline and existing row state.
- Preserve semantic headings and labels; no color-only legends.
- Markdown transcript/export remains scheme-independent and readable without CSS colors.
- Browser system forced-colors/high-contrast behavior must remain usable; allow system colors to override decorative accents when required.

## Architecture and Scope Boundaries

- Keep palette definitions in `src/ui/styles/global.css` or a small UI-only theme module.
- Keep storage key parsing/validation in the browser adapter or a small UI policy helper; do not add a global client store.
- Keep `ThemeControl` ordinary local React state and add a sibling `ColorSchemeControl` unless a demonstrated shared control need appears.
- Do not import React, browser storage, or CSS into domain/application code.
- Do not modify provider-neutral research contracts for presentation-only color metadata.
- Do not persist colors or theme names into thread transcripts, backups, reports, or server payloads.

## Implementation Plan

1. **Theme contract and tokens**
   - define `mono`, `catppuccin`, and `rose-pine` values;
   - preserve `--paper`/`--ink` behavior and existing `--accent` compatibility;
   - define accent rotation and contrast rules;
   - add pure validation/defaulting for stored scheme values.

2. **Browser preference lifecycle**
   - add a separate persisted color-scheme key;
   - add a persisted primary-accent choice, defaulting to the scheme's designated accent;
   - apply `data-color-scheme` during bootstrap and on Settings changes;
   - apply the selected accent to the shared `--accent` token used by focus, finder, and bounded decoration;
   - retain existing `auto/light/dark` appearance behavior;
   - verify invalid storage and first-load behavior.

3. **Settings control**
   - add the Colors selector without adding a new page or global store;
   - add a Primary accent selector whose labels come from the active scheme's accent family;
   - expose only `yellow` for `mono`; expose the named curated accents for the themed schemes;
   - keep the compact settings layout and accessible labels;
   - verify keyboard operation and persistence across reload.

4. **Relational and playful element mapping**
   - add a stable source-identity-to-palette-slot policy keyed by `sourceId`;
   - render live and persisted synthesized answers through one sanitized Markdown renderer;
   - apply the same source accent to each Evidence-box link and its answer citations;
   - assign deterministic rotating accents to synthesized-answer Markdown headings only;
   - ensure streamed content keeps existing source and heading colors and does not recolor earlier content;
   - retain readable ink for synthesis prose and preserve non-color source numbers/labels; leave route/application UI headings unchanged.

5. **Accessibility and regression coverage**
   - add theme token/selector tests, storage tests, UI tests for all schemes, and contrast assertions for critical roles;
   - update browser smoke/axe coverage for settings, finder, and research presentation;
   - verify export/transcript output is unchanged.

6. **Acceptance**
   - run focused tests, full tests, lint, typecheck, build, e2e, and `git diff --check`;
   - manually inspect light/dark appearance for all three schemes on `/new`, `/settings`, `/threads`, a lookup, and a research transcript;
   - update this plan’s Current State, Handoff, and ledger before committing.

## Plan Ledger

- [x] 1. Theme contract and tokens
- [x] 2. Browser preference lifecycle
- [x] 3. Settings control
- [x] 4. Playful element mapping
- [x] 5. Accessibility and regression coverage
- [x] 6. Acceptance
- [x] 7. Primary accent and source-highlight refinement

## Verification

- `npm test` — 12 files, 60 tests passed
- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run build` — passed (Vite emitted existing dependency/chunk-size warnings)
- `npm run test:e2e` — 4 Playwright smoke/accessibility tests passed
- `git diff --check` — passed

Follow-up verification also passed after the primary-accent refinement: lint, typecheck, build, full unit tests, and all 4 Playwright smoke/accessibility tests.

The fixed `#fbf719` option also passes the color-policy tests, lint, typecheck, and `git diff --check`.

## Acceptance Criteria

- Users can choose `mono`, `catppuccin`, or `rose pine` in Settings.
- The setting survives reload and invalid stored values recover to `mono`.
- Existing appearance selection still works independently.
- White/black foreground/background remain the base surfaces; accent colors do not turn long-form text into a low-contrast rainbow.
- Multiple UI elements use a stable, playful accent rotation in each non-mono scheme.
- Every visible source link and its corresponding citation share a stable accent derived from source identity.
- Synthesized-answer Markdown headings use a separate deterministic color rhythm that improves scanning without pretending to encode heading semantics.
- Research direction, generated searches, citations, sources, and transcript landmarks are quickly distinguishable without color being their only signal.
- Route and application UI headings retain their existing styling.
- No animated color cycling, recoloring on every streamed chunk, or random nondeterministic palette assignment.
- Focus, selected thread, links, citations, and controls remain accessible in every scheme.
- Exports, backups, persisted threads, SSE events, provider inputs, and server contracts remain unchanged.

## Implementation-Ready Decisions

- The stored choices are exactly `mono`, `catppuccin`, and `rose-pine`.
- Catppuccin and Rosé Pine are curated, official-palette-inspired accent sets in the UI theme layer; no external theme package is added.
- Primary accent is a separate browser-local preference. `mono` exposes only yellow; themed schemes expose their named accent slots plus a scheme-default option. Every scheme also exposes fixed `#fbf719`. The selected primary accent controls `--accent` for focus, finder, and non-relational decoration only.
- Each inspired scheme has separate light/dark accent values tested against the existing white/black surfaces.
- Source/citation identity is keyed by stable `sourceId`; heading rotation is keyed by synthesized-document heading order.
- The live and persisted synthesized answer share a sanitized Markdown renderer with custom `h1`–`h6` components.
- Route and application UI headings are unchanged and out of scope.
- Colors remain presentation-only: exports, backups, persisted thread contracts, SSE payloads, and provider inputs remain unchanged.
