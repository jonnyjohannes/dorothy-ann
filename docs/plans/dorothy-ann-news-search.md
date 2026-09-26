# Dorothy Ann — news discovery

## Current State

- Status: planned and deferred until the in-progress link-extraction patch completes; no implementation or live Brave News API verification
- Owner: Jonny
- Next action: finish the active extraction patch first, then implement this ledger in order against its settled extractor contract. This plan does not change existing research budgets, the two-source gate, or release work.

## Decision

`/news <query>` is a raw `SearchTurn`, symmetric with `/link`, `/image`, and `/video`: it returns ranked article destinations, not a summary. Ordinary input remains a `ResearchTurn`. Research always begins with its existing exact-question web search; after assessing that evidence, the assessor may request a focused **news** search when it would help (especially when the question needs timely reporting). News does not replace web or run on every turn. Both searches consume the existing shared search/source/assessment budgets; do not increase ceilings here.

News selects a **discovery surface**, not a new evidence standard. A news result is link-shaped article metadata until the existing safe extractor admits viable article text. Only admitted evidence can support assessment and synthesis/citations, under the current two-distinct-usable-source floor. News titles, snippets, and provider ranking alone are not evidence; two URLs do not guarantee independent reporting. Image/video results remain outside factual extraction.

## Contracts and UX

- Extend the existing prompt classifier, `SearchTurn.resultKind`, provider-neutral search options, HTTP/SSE, terminal, persistence, and reload contracts for `/news`. Brave's dedicated `GET /res/v1/news/search` stays inside its adapter; normalize bounded safe article URLs, titles, and snippets as **link-shaped** results, not a new `NewsSourceRecord`. Do not persist raw provider payloads. Preserve canonical URL-based identity so web and news return one source/catalog entry regardless of discovery order.
- Extend only the existing assessor **search** directive with a validated `web | news` surface (default `web` for compatibility); keep the deterministic first web search. The resolver may then route a news request through the **same EvidenceAcquirer and SafeContentExtractor used for web links**, counting searches and extraction attempts against normal limits. News article candidates retain `kind: "link"` so existing extraction admission/SSRF/byte/timeout/viability checks apply; only discovery surface differs. Duplicate-query detection distinguishes `(surface, query)` while URL/source deduplication remains cross-surface. A news result that fails extraction never becomes research evidence.
- Keep the EvidenceBox article layout shared with links. On the existing metadata line, use a small outlined newspaper glyph **and visible “News” text**, followed by the existing domain. Do not add a date or date-specific field for web or news in this pass. A web/news duplicate keeps one card; the badge means *discovered via news*, not fresh, factual, or citeable.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [ ] P1 — add `/news` raw retrieval through Brave normalization, typed boundaries, durable search destinations, and fixture reload/import tests; preserve existing command behavior and link-shaped article identity.
- [ ] P2 — add optional news selection to the assessor/resolver/acquirer path after the mandatory initial web search; persist the surface on admitted news research tasks so news discovery survives reload. Test web-only, news-if-helpful, repeated query across surfaces, shared budgets, duplicate article URLs in both arrival orders, extraction failures, unchanged link extractor safeguards, and the two-source synthesis gate.
- [ ] P3 — render the shared article card with an accessible News glyph/label on the existing metadata line; derive the badge by source ID from completed `/news` destinations and news research task evidence, not from a mutable source kind. Test deduplicated/reloaded presentation, citations, keyboard, and responsive layout.
- [ ] P4 — run focused checks, lint, typecheck, full tests, build, isolated fixture browser checks, `git diff --check`, and inspect `git status`; record live Brave endpoint checks separately if credentials are available. Refresh plan state and handoff before closing.

## Settled Decisions

- **Provenance:** do not mutate the first-admitted link source record or add a news flag to it. Derive a thread-level `discoveredViaNews` presentation flag from completed `SearchTurn` destinations with `resultKind: "news"` and admitted evidence refs on research tasks with `surface: "news"` (optional field, default web for older records). Dedupe by canonical `SourceId`. A later news hit may add the badge to an existing web card, not a second card or a change of source identity. Show the badge once the terminal turn is available; this avoids expanding live SSE solely for decoration. Failed/unadmitted research candidates do not create durable badges.
- **Date deferred:** Brave documents `page_age` on both web and news results, but it can mean publication *or* last modification. The existing adapter does not retain it. Do not normalize, store, or display a new date in this change: the cue should aid scanning without bloating the source and per-discovery contracts. Revisit a shared optional article date only if use in the wild demonstrates a need; never repurpose `publishedAt` for an ambiguous date.

## Source

- [Brave News Search API reference](https://api-dashboard.search.brave.com/api-reference/news/news_search/get) — dedicated endpoint and optional article metadata; verify response shapes with fixtures and a live smoke before claiming provider acceptance.
