# Dorothy Ann v1.2.0 release inventory

- Status: released
- Release commit: `bb106fb`
- Tag: `v1.2.0`
- Release date: 2026-09-20
- Source inventory: [`dorothy-ann-search-result-kinds.md`](../plans/archive/dorothy-ann-search-result-kinds.md)

## Release summary

v1.2.0 adds image and video search to the existing research workspace. Direct `/link`, `/image`, and `/video` retrieval share one `SearchTurn` lifecycle; ordinary unprefixed prompts remain research. The release commit also includes root-level evidence corroboration guidance, research activity footnotes, generated-title and thread-retention improvements.

## Shipped scope

- Added provider-neutral `SearchResultKind` (`link | image | video`) and a shared prompt classifier. `/threads/new?q=<prompt input>` is the canonical prompt-input URL; `/search` is removed. Existing search records default to `link` when migrated.
- Added bounded, normalized image/video results and durable typed source metadata. Provider payloads are not persisted. Media results remain visible as search results but are excluded from page extraction and factual research evidence.
- Rendered link, image, and video results in a shared responsive evidence grid. Image attachments use linked thumbnails; supported video players mount paused when visible, use provider controls for playback, and retain linked-thumbnail fallback when offscreen, unsupported, or failed. Titles remain external source-page links.
- Refined search-command actions, thread-selector return navigation, and text-link presentation as recorded in the completed search-result-kinds plan.
- Added a prompt-owned target of at least two materially independent sources for root research conclusions. Independence is model-judged, not enforced by an application source-count check; existing research ceilings remain unchanged.
- Added research activity footnotes, extended generated thread titles, and centralized thread-retention policy.

## Verification

The completed search-result-kinds plan records lint, typecheck, the 257-test suite, production build, dependency resolution, and repository-wide `git diff --check` as passing. Its fresh isolated fixture-browser run passed four functional flows across desktop Chromium and mobile WebKit.

Known verification limits recorded at release: both browser accessibility flows reported the light-theme muted-text contrast issue (4.34:1) and the accepted muted-link contrast regression (3.91:1). Live Brave search and live provider video playback were not verified. The root corroboration plan reports its live-provider independence behavior as deployment-dependent and unverified.

## Release identity

Commit `bb106fb` is titled `v1.2.0 - image and video search support (#14)` and is tagged `v1.2.0`.
