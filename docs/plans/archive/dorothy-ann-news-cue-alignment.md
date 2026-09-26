# Dorothy Ann — icon-only news metadata cue

## Current State

- Status: done; implemented in `4ae8c1c` (no release tag).
- The archived [news discovery plan](dorothy-ann-news-search.md) owns search and evidence behavior. This amendment changes only the article card's metadata presentation.
- Verified: lint, typecheck, focused UI tests, build, and eight isolated fixture browser cases across Chromium and mobile WebKit. The browser case checks metadata alignment and persistence after reload.

## Decision

Use one aligned metadata row: an outlined newspaper glyph, `·`, and the existing publisher domain. Omit visible “News” text, but give the glyph the accessible name “News source.” Keep source identity, provenance, citation, and extraction rules unchanged.

## Plan Ledger

- [x] Replace the text badge and align glyph, separator, and publisher at desktop and mobile sizes; preserve the cue after reload.
- [x] Run focused checks and isolated fixture browser verification.

## Open Questions

- Whether explicit requests for latest news should *always* invoke news discovery after the mandatory web search remains a separate product decision; the resolver currently leaves that choice to the assessor.
