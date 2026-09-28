# Search-surface primitives, evidence, and meaningful synthesis

## Current State

- Status: exploration / unrefined notes; no product contract, implementation scope, or release decision approved.
- Owner: Jonny. Next reader: a fresh agent should use this as conversation context, verify the current code before proposing changes, and discuss alternatives with Jonny rather than treating these notes as instructions to implement.
- Intent: explore how Dorothy Ann could meaningfully compose `/link`, `/news`, `/image`, and `/video` discovery with inspection, research assessment, and an aesthetically coherent, informative synthesis. The question is broader than adding four interchangeable tools to the assessor.
- This file records the discussion, not an approved architecture or a commitment to media understanding, new budgets, UI changes, or provider calls.

## Existing behavior to preserve as context, not as the desired endpoint

- Explicit `/link`, `/news`, `/image`, and `/video` commands create raw `SearchTurn`s with bounded, durable result metadata; ordinary input creates a `ResearchTurn`. Raw result metadata is not automatically factual research evidence. `/news` discovers article links; its results are link-shaped sources with discovery provenance, not a separate article evidence type. Image/video results and thumbnails never enter the current text extractor as evidence.
- Research starts with an exact-question **web** search, even on follow-ups. The assessor then receives context and acquired evidence and returns `resolved`, one focused `search`, or `decompose(all | any)`. Validated assessor searches currently have **no surface choice** and use web discovery only. This supersedes the older news plan's assessor-selected-news behavior; `/news` remains a raw command and historical news research tasks remain readable.
- The text acquisition loop finds up to five candidates/request, selects and extracts the first three, and can try ranks four/five one charged attempt at a time while fewer than two viable distinct root source IDs are available. Only nonempty viable extracted page text enters evidence packs. Failed/empty selections still consume source budget. Existing ceilings are three searches, twelve charged selections/turn, eight accepted assessments, and depth two. A duplicate/no-new-knowledge stop may leave budget unused.
- Child findings are joined and the parent reassessed; only the root synthesizes, at most once. Root synthesis (including best effort) requires two distinct viable extracted source IDs, possibly including relevant follow-up context. That count is a floor, not proof of relevance, independence, agreement, or two required citations. With fewer than two at a bounded stop, the turn is insufficient without synthesis. The assessor still decides which obligations the text supports.
- EvidenceBox currently displays durable raw media and article results alongside research sources. Displaying a card or mounting a paused video player does **not** imply the model inspected the content.

## Working vocabulary to test, not yet a data model

```text
user obligation
  → discover candidate(s) OR receive a specific user-supplied target
  → inspect underlying content through an appropriate, bounded mechanism
  → admit validated usable material into research context
  → assess which particular claims it supports (or what gap remains)
  → synthesize once only when the root can truthfully do so
```

- **Discovered:** normalized identity, rank, link and display metadata; title/snippet/thumbnail alone do not establish the source's contents.
- **Inspected:** the underlying content was actually obtained and examined. Inspection may fail, return empty/unsupported material, or reveal something irrelevant. For text, the current safe extraction roughly fills this role; there is no corresponding research media inspector today.
- **Admissible:** inspected material passed modality-specific safety/viability checks and may enter assessor context. This is **not** a semantic claim that it answers the user's question. Current viable extracted text is the closest analogue.
- **Supported:** a specific assessed observation is grounded in allowed admitted references. Keep this distinct from admission and from a source's mere presence in the UI.

The stages might be a conceptual lens, explicit runtime outcomes, or something else. Do not add a durable status enum merely because the words are useful. Also distinguish a failed inspection from an unattempted one, and a valid but irrelevant inspection from supported evidence.

## Questions worth riffing on together

1. **Discovery versus target inspection.** `/image cats` means find images; “what is in *this* image [URL/attachment]?” asks to inspect a particular target. Likewise for a video and a time-specific question. Should supplied targets bypass the unconditional first web search? What can be done truthfully before media inspection exists?
2. **Link versus news.** News is a discovery index for link-shaped articles, not a freshness or truth guarantee. When, if ever, should research route to news rather than web? Should the assessor specify a missing evidence obligation while code constrains available surfaces, or should it explicitly choose a surface? Recent work deliberately removed the latter; revisit that decision openly, not accidentally.
3. **Media as evidence.** A media asset URL, thumbnail, description, source page, transcript, frames, and actual audio/video contents are different things. What question types warrant inspection of which material? What are the safety, rights, size, access, provenance, temporal, and retention boundaries? Do not present search-result metadata or human playback as model perception.
4. **Research-loop continuation.** Separate “not enough inspectable material” from “material was inspected but does not address the obligation.” Today backfill chases a viability floor, while `no_new_knowledge` may stop with unused search budget. When should a distinct query, a different surface, a direct inspection, decomposition, or an honest stop be preferred? Keep work bounded; no automatic extra searches implied by this note.
5. **Aesthetic and informative synthesis.** What should an answer communicate about what was found, actually inspected, supported, contested, and still unknown without turning the transcript into a tool log? How should cited text, discovered media, and user-supplied targets coexist visually and accessibly without implying false evidentiary status? The existing app owns transcript separators and forbids model-generated headings/horizontal rules; do not silently revise that contract.
6. **Evaluation.** Which representative text, latest-reporting, image-target, video-target, and mixed-source questions would distinguish a useful composition from surface-hopping or decorative media? Separate fixture proof from live provider/model acceptance.

## Plan Ledger

- [ ] Discuss the evidence-stage vocabulary and representative user journeys with Jonny; identify what is observation versus intended behavior.
- [ ] Revisit the present acquisition/assessment/continuation loop against those journeys, including current limits and failure stops; compare a small number of routing options.
- [ ] Only after product choices are made, turn the selected slice into an implementation contract with boundaries, verification, and explicit deferred scope. No implementation is authorized by this planning-stage ledger.

## Open Questions

- Which first use case matters most: better text web/news routing, direct inspection of a supplied image/video, or mixed-media synthesis?
- Is the initial exact-question web retrieval still the right default for every research turn?
- Are discovered/inspected/admissible labels internal reasoning aids, visible disclosures, persisted provenance, or some combination? No answer yet.
- What would a useful synthesis show about a media source before actual media inspection is available?

## Handoff

Read `src/application/research-resolver.ts`, `evidence-acquirer.ts`, `research-assessor.ts`, `research-synthesis-policy.ts`, `src/infrastructure/extraction/safe-content-extractor.ts`, `ASSESSOR.md`, and the search-result/news and two-source archived plans before drafting a contract. Later amendments override historical descriptions: `docs/plans/archive/assessor-compact-web-only.md` and `assessor-surface-free.md` explain why current assessor searches are web-only. `docs/plans/archive/dorothy-ann-two-source-synthesis.md` distinguishes shipped extraction rules from removed experimental fallbacks. Other active plans and uncommitted work may coexist; do not overwrite them. Start with discussion, not code or a prescriptive redesign.
