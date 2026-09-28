# Research trail footnote placement

## Current State

- Status: done
- Verification: local passed; manual browser inspection pending
- Owner: jonny
- Executor: worker on release/v1.2.0
- Last updated: 2026-09-21
- Current focus: completed research activity renders as a muted footnote after the answer
- Next action: manually inspect a completed multi-search thread when available
- Branch / PR / session: release/v1.2.0

## Abstract

Place the existing read-only research activity trail at the bottom of Dorothy Ann's completed research turn, after the final answer and its citations. Preserve the durable task projection and make the activity read as muted answer provenance rather than an interruption to chronological reading flow.

## Flow

```text
user request ─▶ Dorothy answer + citations ─▶ muted research activity footnote
```

The activity remains a presentation-only projection of validated `ResearchResolution.tasks`; it is not a separate turn and does not enter future context.

## Desired Outcome

A completed research transcript item renders its request, final answer, and then a subdued `Research activity` footnote containing submitted query strings. Existing separators, citations, accessibility, and omission behavior remain intact.

## Scope

### Goals

- Move the existing research activity section after the rendered final answer.
- Keep it inside the same research transcript item.
- Preserve muted/small footnote styling and read-only semantics.
- Update focused ordering tests.

### Non-goals

- Do not change resolver, storage, context, provider, or domain behavior.
- Do not change query projection, task order, labels, or omission rules.
- Do not create turns or expose reasoning, prompts, purposes, success criteria, evidence passages, or child answers.

## Decisions

- Research activity appears after answer content and inline citations.
- It remains omitted for turns without projected research queries.
- No new separator is added between answer and footnote; existing turn separators remain unchanged.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [x] F1 — Move research activity to the bottom of the answer turn
  - Deliverable: transcript ordering update, footnote styling adjustment if needed, and regression coverage
  - Verify: focused UI tests, `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`
  - Evidence: `tests/ui-boxes-v3.test.tsx` passed with 20 tests; lint, typecheck, production build, and repository `git diff --check` passed. Build retained existing Zod annotation and chunk-size warnings.

## Verification

### Automated

- Focused transcript test asserting request → answer → research activity ordering.
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

### Manual / operational

- Inspect a completed multi-search thread and confirm the answer reads continuously with a quiet activity footnote below it.

### Not verified / external pending

- Manual browser inspection remains pending until a multi-search thread is available.

## Open Questions

- None blocking implementation.
