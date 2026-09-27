# Surface-free assessor search proposals

## Current State

- Status: done locally, not deployed. The preceding [web-only assessor amendment](assessor-compact-web-only.md) is committed at `fa2a6a9` but not deployed. The owner clarified that explicit `/news` remains a raw search primitive and the assessor should not have any discovery-surface choice; future non-LLM routing and lookup are separate work.
- Focused tests: 80 passed before the fallback regression; full Vitest: 351 passed. Lint, typecheck, build, and 14 fixture browser tests across Chromium/mobile WebKit passed. `git diff --check` passed. No live-provider trial or `npm ci` was run.
- The prior amendment removed news from the model schema and prompt but retained an optional `web` proposal field and special `news` rejection paths in the provider parser/application validator. Those paths can cost corrective model attempts if an unconstrained fallback returns a surface.

## Decision

- Live assessor `search` proposals/directives carry no `surface`. All research searches follow the existing default web path. The provider normalizer discards any extraneous surface field instead of selecting or specially rejecting a surface. Keep strict application validation for unexpected proposal keys, without a news-specific case.
- No change to explicit `/news`, `/image`, `/video`, Brave's raw endpoints, historical news task validation/provenance, source admission, budgets, or the compact prompt. Do not design future routing/lookup or claim latency improvements without measurement.

## Plan Ledger

- [x] P1 — proposal and decoded directive have no surface, the provider parser drops provider-supplied surface hints without a retry, and the resolver constructs only web requests and surface-free tasks. Strict application validation generically rejects unexpected keys; `/news` raw and historical news tasks/provenance remain covered. README links both amendments.
- [x] P2 — focused 80 tests before adding the fallback regression, then full 351 tests, lint, typecheck, build, 14 fixture browser tests, `git diff --check`, and `git status` passed. No Vercel mutation or live-provider measurement.

## Open Questions

- Future non-LLM routing and lookup semantics, including when to use different discovery surfaces, are deferred to a separate owner-approved plan.

## Handoff

- Prompt assets load at startup. Nothing is deployed; production behavior remains unchanged until a separately approved restart/redeploy. Unexpected model-emitted surface hints are ignored by provider normalization; they do not route research to another surface or consume a corrective attempt solely for that hint. A direct bypass of provider normalization still fails strict application validation for unexpected keys.
