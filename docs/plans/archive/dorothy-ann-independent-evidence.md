# Dorothy Ann — root independent-evidence target

## Current State

- Status: done
- Verification: local passed; external live-provider smoke pending
- Owner: Jonny
- Executor: worker
- Last updated: 2026-09-18
- Current focus: completed root corroboration policy implementation
- Next action: restart/redeploy before live-provider smoke because prompt assets load once at startup
- Branch / PR / session: current working tree

## Abstract

Dorothy Ann should avoid resolving a root research question from one plausible but weak source, such as a single opinion blog returned by Brave. The assessor will therefore target at least **two materially independent evidence sources for the root research conclusion** before returning `resolved`. This is a prompt-owned policy and remains a soft semantic requirement: the application will not attempt to infer publisher independence, hard-reject a one-source proposal, or add a new recursive budget.

## Flow

```text
user question
    │
    ▼
[root research problem]
    │
    ├── retrieve and extract evidence within existing ceilings
    ├── assess whether the root conclusion has ≥ 2 materially independent sources
    │       ├── no → one bounded focused corroboration search / reassessment
    │       └── yes → resolved
    │
    ▼
[root synthesis]
    │
    ▼
answer + visible evidence sources
```

The two-source target applies to the root conclusion only. Recursive child problems retain their existing obligation-specific resolution behavior; they do not each acquire a separate two-source minimum. The model judges material independence from the supplied evidence. Different URLs, domains, syndicated copies, repeated reporting, or same-publisher pages are not automatically independent. The application continues to expose admitted sources to the final answer and does not claim to verify that judgment mechanically.

Existing hard ceilings remain unchanged: three searches, nine consumed additional sources, depth two, eight assessments, and three child problems per decomposition. If those ceilings prevent corroboration, Dorothy Ann may still synthesize useful best-effort knowledge or report insufficient evidence according to the existing resolution policy.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] P1 — Make root corroboration policy explicit in the assessor prompt
  - Deliverable: `ASSESSOR.md` requires at least two materially independent sources for every root research conclusion, while preserving the existing simple-question and recursive protocol guidance.
  - Verify: prompt asset tests and focused assessor-envelope assertions.
  - Evidence: `npm test -- --run tests/system-prompts.test.ts` passed (6 tests).
- [x] P2 — Preserve bounded recursive behavior
  - Deliverable: assessor instructions request one focused corroboration search when the root target is unmet; no new budget, source validator, publisher classifier, or hard application rejection is added.
  - Verify: resolver tests covering focused continuation, existing ceilings, and best-effort fallback.
  - Evidence: `npm test -- --run tests/research-resolver.test.ts tests/research-assessor.test.ts` passed (15 tests).
- [x] P3 — Document the root-only two-source target
  - Deliverable: README, active plan handoff/current state, and a compact flow diagram explain that the target is root-only, prompt-owned, model-judged, and intentionally not app-enforced.
  - Verify: documentation review and forbidden-policy drift search.
  - Evidence: README and active v1.1.0 plan now describe root-only two-source corroboration, model judgment, visible evidence, and unchanged ceilings.
- [x] P4 — Remove provisional session scaffolding
  - Deliverable: remove the uncommitted `MIN_INDEPENDENT_EVIDENCE_SOURCES` configuration/type scaffolding from the interrupted implementation attempt; this slice remains hardcoded and prompt-owned.
  - Verify: scoped `git diff --check`, typecheck, and config tests after reconciliation.
  - Evidence: `npm test -- --run tests/config.test.ts tests/system-prompts.test.ts` passed (18 tests); `npm run typecheck` passed; scoped diff check passed. Repository-wide diff check remains blocked by the unrelated pre-existing `SYNTHESIZER.md` EOF blank line.

## Desired Outcome

For an ordinary root research question, Dorothy Ann’s assessor treats one source as insufficient corroboration and continues with bounded focused research when possible. The final answer still renders whatever sources were actually admitted, allowing the user to inspect whether the model’s independence judgment was reasonable. No recursive ceiling is raised and no new provider/publisher-analysis subsystem is introduced.

## Current Reality

`ASSESSOR.md` now requires root-depth resolutions to target at least two materially independent sources, while retaining the existing broader four-source policy for complex comparative, causal, contested, or multi-obligation requests. The resolver retains bounded search, source, depth, and assessment ceilings and can continue with focused corroboration through the existing protocol. Independence remains a model judgment; the application has no publisher-lineage classifier and does not hard-reject a one-source proposal.

The provisional `MIN_INDEPENDENT_EVIDENCE_SOURCES` scaffolding was removed from `.env.example`, `server/runtime/config.ts`, `src/application/evidence-acquirer.ts`, and `src/ports/llm.ts`. Unrelated working-tree modifications remain outside this plan.

## Scope

### Goals

- Require a root-only target of at least two materially independent evidence sources in assessor behavior.
- Keep independence semantic and model-judged.
- Keep the target visible in flow diagrams and product/developer documentation.
- Preserve current recursion and resource ceilings.
- Preserve visible source evidence so users can audit the result.

### Non-goals

- Enforcing source independence in application code.
- Counting distinct URLs or domains as proof of independence.
- Requiring two sources for every recursive child problem.
- Adding publisher ownership, syndication, or source-lineage infrastructure.
- Increasing searches, sources, depth, assessments, or decomposition limits.
- Adding configuration in this change.

## Decisions

- **Root-only** — the minimum applies to the final root research conclusion, not every recursive child.
- **Two sources** — use two as the fixed target for now; three is deferred until actual usage shows a need.
- **Prompt-owned** — `ASSESSOR.md` owns the semantic policy; application validation does not reject a proposal that fails to meet it.
- **Model-judged independence** — the model must distinguish independent primary evidence from syndicated, repeated, or same-publisher material, but the application does not pretend to verify that judgment.
- **Bounded continuation** — an unmet target should cause one focused corroboration attempt through the existing protocol and ceilings, not an unbounded loop.
- **User-auditable output** — admitted sources remain visible in the evidence presentation so the user can make the final judgment.
- **No dormant configuration seam** — remove the provisional threshold config scaffolding rather than preserving an unapproved future product surface.

## Detailed Plan

### Assessor policy

Replace the current complexity-only source language with an explicit root policy. The prompt should say that a root `resolved` directive requires direct support for every material obligation and at least two materially independent sources supporting the root conclusion. A straightforward question may still be resolved efficiently after obtaining two good sources; the policy does not require exhaustive research or four sources unless the existing complexity policy calls for it.

When fewer than two independent sources are available, the assessor should return one focused `search` directive for the most consequential missing corroboration. Decomposition remains reserved for genuinely independent obligations. The prompt must not imply that source count alone establishes independence.

### Runtime and application boundary

No hard source-count validator will be added in this slice. The resolver continues to trust the validated assessor directive and existing bounded convergence behavior. The incomplete threshold scaffolding from the interrupted implementation attempt must be reconciled before implementation is considered complete.

### Documentation

Update the active README and plan handoff/current-state material so a fresh executor and future operator can see the root-only two-source target, its prompt ownership, the model-judged independence rule, and the unchanged ceilings. Include the flow diagram above or an equivalent compact diagram.

## Verification

### Automated

- Focused prompt-asset tests assert the root-only two-source policy and independence caveats.
- Resolver regressions show a `search` continuation can precede root resolution without changing ceilings.
- Existing full suite, lint, typecheck, build, and `git diff --check`.

### Manual / operational

- Run representative live-provider questions where Brave returns one opinion/blog result plus stronger or independent alternatives.
- Inspect the rendered evidence list and confirm the final answer visibly exposes the sources used.
- Confirm a simple question does not recurse indefinitely and a bounded failure becomes best-effort/insufficient under existing policy.

### Not verified / external pending

- The model’s real-world ability to classify independence remains deployment-dependent and cannot be proven by fixture tests alone.
- No publisher-lineage or syndicated-content classifier is included.
- `npm run test:e2e` was attempted; four existing browser smoke cases could not find the prompt on the repository-default server while two accessibility cases passed. This was not attributable to the prompt/documentation diff.
- Repository-wide `git diff --check` remains blocked by the unrelated pre-existing `SYNTHESIZER.md` EOF blank line; the scoped implementation diff is clean.

## Open Questions

- Should the wording say “at least two” or “two or more” in user/developer docs? (Recommendation: “at least two.”) — planning — non-blocking.
- After live observation, should the fixed target become configuration or remain prompt policy? — Jonny — deferred until usage evidence exists.
