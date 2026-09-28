# Assessor compact output and web-only research

## Current State

- Status: done; local change not deployed or live-provider evaluated. Owner approved disabling assessor-selected news research while retaining `/news` raw search and readable historical news research tasks.
- Focused tests: 80 passed across seven files; full Vitest: 350 passed. Lint, typecheck, build, and 14 fixture browser tests across Chromium/mobile WebKit passed. `git diff --check` passed. No `npm ci` or live-model trial was run.
- `ASSESSOR.md` currently encourages a news search surface for latest-news questions. The provider schema, parser, and application validator accept `surface: "news"` on research search proposals. A separate `/news` SearchTurn remains live.
- The repository guide references a current-state audit and active plans that are not present in this checkout (`docs/plans/` contains only `archive/` before this plan). The archived news-discovery plan describes the shipped behavior this change amends.

## Decision

- Research still starts with the exact-question web search and may ask for further focused **web** searches. Time-sensitive and latest-news questions still require fresh evidence when available evidence is stale or insufficient; do not treat two web sources as automatically sufficient for the requested current reporting.
- Remove news-surface guidance from `ASSESSOR.md`; encourage short, nonduplicative valid JSON observations without losing material obligations, disagreement, or allowed support references. This is guidance, not an output-token guarantee or a changed evidence threshold.
- Reject model-proposed `surface: "news"` at both provider normalization and application validation. The live structured search schema offers no news surface. Omitted or explicit `web` is valid. Keep the two-source gate, output cap/retry policy, budgets, provider-neutral raw `/news`, historical task schema, news provenance UI, and persistence intact. Do not add another research surface or fetch.

## Plan Ledger

- [x] P1 — prompt now requests compact supported observations and web-only follow-up search. Structured schema omits `surface`; provider parser and application validator reject `news` while allowing omitted/explicit `web`. SearchTurn `/news`, historical task schema, and news provenance UI remain; README reflects the amended behavior, and focused/full tests cover the boundaries.
- [x] P2 — focused 80 tests, full 350 tests, lint, typecheck, build, 14 fixture browser checks, `git diff --check`, and `git status` passed. No `npm ci` or live-provider measurement.

## Open Questions

- Whether to remove dormant news routing from `EvidenceAcquirer` in a later clean-up; it is not reachable from validated research proposals after P1 but has independent historical/fixture uses. No removal in this plan.
- How often the revised prompt produces valid first attempts under 1,200 tokens in live runs; no live success or latency claim without measurement.

## Handoff

- No Vercel mutation or deployment was performed. Prompt assets are startup-loaded, so activation requires an independently approved restart/redeploy. Preserve archived news task provenance and `/news` behavior. The web-only research boundary is enforced for newly decoded assessor proposals, not retroactively on historical records.
