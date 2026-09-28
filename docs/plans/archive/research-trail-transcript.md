# Research trail in transcript

## Current State

- Status: done
- Verification: verified locally
- Owner: jonny
- Executor: worker
- Last updated: 2026-09-20
- Current focus: completed research trails are visible in transcript order
- Next action: manually inspect a multi-search browser thread when convenient
- Branch / PR / session: release/v1.2.0

## Abstract

Show a read-only research activity trail inside completed research transcript items, between the user's request and Dorothy Ann's final answer. Derive it from already durable, validated `ResearchResolution.tasks`, display only bounded submitted query strings, and do not create fake turns or expose reasoning.

## Flow

```text
completed research turn ──projection──▶ user request ──▶ research activity ──▶ final answer
```

`TranscriptBox`/UI policy owns presentation. `ResearchResolution.tasks` remains durable research state and is not converted into conversation turns or future context input.

## Desired Outcome

For a research turn with submitted tasks, the transcript renders an accessible research-activity section immediately after the user request and before the final answer. Each task contributes a bounded, escaped query display. Search turns, failed/interrupted turns without a valid research resolution, legacy archive entries, and research turns with no tasks do not gain a research trail.

## Scope

### Goals

- Project validated research task queries into transcript items.
- Render the trail between request and answer.
- Keep the trail read-only and clearly labeled.
- Preserve existing answer, citation, separator, keyboard, and accessibility behavior.
- Add focused tests for presence, ordering, omission cases, and bounded display.

### Non-goals

- Do not create new domain turn types or persisted transcript turns.
- Do not expose assessor reasoning, prompts, purpose, success criteria, provider payloads, evidence passages, or child answers.
- Do not add research activity to future thread context or synthesis input.
- Do not change resolver behavior, budgets, storage contracts, routing, or provider adapters.
- Do not alter search-turn or legacy archive presentation.

## Decisions

- Placement is immediately after the user request and before the final answer.
- The visible label is application-owned and human-readable, such as `Research activity`.
- Display query strings only; preserve task order and use the existing durable bounded task data.
- Use semantic read-only markup (`section`/list or equivalent) with accessible labeling.
- Existing transcript separators remain application-owned; the activity is part of the turn presentation, not a separate turn.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] R1 — Render durable research queries in transcript order
  - Deliverable: UI projection/rendering, styling if needed, and focused regression coverage
  - Verify: focused UI tests, `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`
  - Evidence: `tests/ui-boxes-v3.test.tsx` now covers request → research activity → answer ordering and query display; focused tests passed (20), full suite passed (258), lint/typecheck/build passed, and repository `git diff --check` passed.

## Verification

### Automated

- Focused transcript/UI tests for research trail ordering and omission cases.
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

### Manual / operational

- Inspect a completed multi-search research thread and confirm request → activity → answer order and readable density.

### Not verified / external pending

- Manual browser inspection of a completed multi-search live thread remains pending; no e2e run was needed because the change is a local transcript projection.

## Open Questions

- None blocking implementation.
