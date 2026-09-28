# OpenAI LLM adapter and capability routing

## Current State

- Status: planning
- Verification: not run
- Owner: Jonny
- Executor: unassigned
- Last updated: 2026-09-27
- Current focus: preserve the OpenAI adapter and interface-tuning proposal for the next release; do not implement it in the current release.
- Next action: after the release push, resume BRAINS to settle provider-routing topology, evaluation criteria, and any provider-neutral interface changes before setting this plan to ready.

## Abstract

Add an OpenAI-backed implementation of Dorothy Ann's existing LLM capabilities without coupling application/domain code to OpenAI or changing research behavior by accident. Preserve the current Haiku-backed Anthropic path while deciding whether provider selection is deployment-wide or independently configurable for assessment and synthesis; update shared interfaces only where the second adapter proves a real contract gap.

## Flow

```text
ResearchAssessor ──assessResearch──▶ LLMProvider capability ──structured request──▶ selected provider/model
AnswerSynthesizer ──synthesizeResearch──▶ LLMProvider capability ──text stream──▶ selected provider/model
       │                                      │
       └── validates proposals/citations      └── normalizes failures, usage, provenance
```

The application owns capability semantics and validates untrusted assessment proposals. Concrete adapters own SDK/API schemas, request envelopes, stream decoding, provider error normalization, and provider/model references. Model and provider configuration remains server-only. Research, search, persistence, browser, and SSE contracts should remain unchanged unless a concrete gap is found and approved here.

## Plan Ledger

Status: `[ ]` not started, `[~]` in progress, `[x]` verified, `[!]` blocked.

- [ ] P1 — settle provider routing and model-selection policy.
  - Deliverable: explicit decision for deployment-wide selection versus independent assessment/synthesis provider selection, plus failure/fallback behavior.
  - Verify: this plan records one unambiguous policy and its configuration contract.
  - Evidence: —
- [ ] P2 — audit the provider-neutral port and durable provenance against both APIs.
  - Deliverable: minimal interface/config/provenance amendments, if needed, with no speculative generalized provider framework.
  - Verify: each proposed change is tied to a demonstrated API or operational requirement and has compatibility/migration implications documented.
  - Evidence: —
- [ ] P3 — implement and fixture-test the OpenAI assessment adapter.
  - Deliverable: structured assessment request, bounded parse/validation/retry policy, cancellation, sanitized failures, attempt diagnostics, and truthful model provenance.
  - Verify: fixture tests cover valid/variant/malformed/truncated/refused output, structured-output incompatibility if supported as a fallback, retry ceiling, signal abort, sanitized errors, and unchanged application-level support validation.
  - Evidence: —
- [ ] P4 — implement and fixture-test streamed OpenAI synthesis.
  - Deliverable: exact system prompt pass-through, typed synthesis envelope, stream-to-`AssistantContentPart` decoding, cancellation, bounded failures, and model provenance.
  - Verify: fixture tests cover text streaming, empty/refusal/error streams, abort, exact system prompt, citations, and durable bounds.
  - Evidence: —
- [ ] P5 — wire server-only configuration and provider construction.
  - Deliverable: OpenAI key/model configuration, validated startup/readiness behavior, fixture-mode isolation, deployment-bundle safety, and the agreed routing policy.
  - Verify: config/app tests cover missing, partial, valid, and invalid configuration; readiness reports actual configured capability availability; no key reaches browser assets, logs, or responses.
  - Evidence: —
- [ ] P6 — run provider-neutral and repository verification; document live-provider limits.
  - Deliverable: full adapter regression suite and synchronized operational documentation; live smoke only if separately approved and credentials are available.
  - Verify: focused tests, lint, typecheck, full tests, build, e2e, `git diff --check`, and `git status`; report any external/live check not run.
  - Evidence: —

## Desired Outcome

Operators can deliberately use OpenAI for the approved assessment and/or synthesis capability while retaining the current Anthropic/Haiku path. Both adapters satisfy the same application contract, invalid model proposals remain untrusted, streaming and cancellation remain correct, and terminal records identify the actual provider/model used for each capability. No provider selection silently changes product behavior or falls back to another provider without an explicit policy.

## Current Reality

- `src/ports/llm.ts` exposes `assessResearch` and `synthesizeResearch` on one provider-neutral `LLMProvider` interface.
- `src/infrastructure/providers/anthropic.ts` is the sole live adapter. It owns Anthropic JSON-schema assessment, validation/parsing, bounded correction behavior, streamed synthesis, cancellation, and sanitized provider errors.
- `server/app.ts` constructs one `AnthropicProvider` from `ANTHROPIC_API_KEY`, `ANTHROPIC_ASSESSMENT_MODEL`, and `ANTHROPIC_SYNTHESIS_MODEL`; fixture mode injects its own implementation.
- `server/runtime/config.ts` validates those environment variables. `.env.example` documents the Anthropic configuration.
- Completed research provenance currently stores `assessmentModelRef` and `synthesisModelRef` in `src/domain/types.ts`; the names suggest model refs, not provider identity. The schema is strict and persisted/imported turns retain these values.
- `server/runtime/research-timing.ts` decorates one `LLMProvider`; its stage boundaries are capability-based and should remain so.
- Anthropic remains the intended current provider/model choice (Haiku); adding OpenAI is an additional adapter/capability option, not an instruction to switch production credentials or deploy.

## Scope

### Goals

- Implement an OpenAI adapter behind the existing `LLMProvider` port wherever its semantics fit.
- Keep prompts exact and provider-neutral; do not append provider-specific system instructions or move application validation into provider code.
- Preserve capability-specific model configuration and accurate per-turn execution provenance.
- Allow fixture tests to exercise both adapters with injected clients/transports and no credentials.
- Tune only interfaces/configuration that materially improve correct provider selection, failure isolation, and provenance.

### Non-goals

- Switching the current production provider/model from Anthropic Haiku.
- Automatic provider failover, hedging, load balancing, or per-request model routing unless explicitly selected in the routing decision.
- Changing assessor policy, source thresholds, research budgets, synthesis UX, durable answer format, SSE protocol, or provider-independent application behavior.
- OpenAI web search/tools, embeddings, vision, audio, fine-tuning, or other capabilities outside structured assessment and streamed synthesis.
- Adding broad SDK-agnostic abstractions beyond what the two concrete adapters require.
- Deploying, editing Vercel settings/environment variables, or using live credentials without separate explicit approval.

## Decisions

- **Provider-neutral application boundary** — preserve the `LLMProvider` capability contract unless OpenAI demonstrates a specific mismatch; keep OpenAI SDK types and payloads inside `src/infrastructure/providers/`.
- **No silent failover** — provider/model choice is explicit; a failed request follows the existing typed failure contract rather than retrying another provider invisibly.
- **Release sequencing** — defer OpenAI adapter implementation and related interface tuning until after the current release push; keep the plan uncommitted and do not route it to an executor before then.
- **Existing Haiku route stays valid** — OpenAI support is additive and must not make existing Anthropic-only deployments invalid or require OpenAI credentials.
- **Interface tuning is evidence-led** — audit task/capability configuration, provider/model provenance, and normalized failure details, but avoid changing stable contracts just for symmetry.

## Detailed Plan

### Provider routing and configuration (decision pending)

Choose exactly one initial topology before implementation:

1. **Per-capability provider/model routes** — configure provider and model independently for assessment and synthesis. Supports Anthropic assessment + OpenAI synthesis (or vice versa), but expands configuration, readiness validation, and provenance.
2. **One deployment-wide provider, separate capability models** — select Anthropic or OpenAI once, with distinct assessment/synthesis model IDs inside that provider. Simpler and avoids mixed-provider turns, but cannot flex providers between roles.
3. **Other** — Jonny specifies another bounded policy.

For any option, default remains the current Anthropic/Haiku route; OpenAI credentials are optional unless selected. No implicit fallback. Define whether invalid or partial route configuration fails startup/readiness or disables only that capability, consistent with truthful `/api/status` behavior.

### Provider-neutral contract and provenance review

Compare `ResearchAssessmentInput`, `ResearchSynthesisInput`, `ResearchAssessmentProposal`, `AssistantContentPart`, and `LLMProvider` with OpenAI's actual structured-output and streaming contracts. Preserve application ownership of schema semantics, support-reference validation, citation reachability, and output bounds. Review whether durable `assessmentModelRef` and `synthesisModelRef` need provider identity, e.g. a provider-qualified opaque ref or explicit provider/model fields. Any strict-schema change must account for old persisted/imported turns and the bounded read-only legacy archive. Do not put secrets, endpoint URLs, raw provider payloads, or request content into provenance/logs.

### OpenAI assessment adapter

Map the exact assessor system prompt to the provider system/developer channel and the existing typed dynamic envelope to user/protocol input. Use provider structured output when supported; continue application/provider-boundary parsing and validation rather than trusting schema enforcement alone. Preserve two-attempt bounded policy, cancellation, and count-only diagnostics where those semantics can be mapped faithfully. Do not assume Anthropic's status codes, stop-reason vocabulary, or structured-output fallback behavior transfer directly; define and test OpenAI-specific normalization into provider-neutral errors/observations. Unknown/refusal/truncated output must fail through the existing bounded invalid-assessment path, never fabricate a directive.

### OpenAI synthesis adapter

Pass `systemPrompt` byte-for-byte unchanged and keep the dynamic `synthesisEnvelope(input)` in the user/protocol message. Decode only valid text-delta events into existing assistant text parts; do not synthesize citation parts from provider content or bypass `AnswerSynthesizer` validation. Preserve abort propagation and ensure empty, refused, incomplete, and failed streams become sanitized typed synthesis failures. Coalesce/bound output through existing application policy.

### Runtime composition, compatibility, and docs

Add optional OpenAI configuration without exposing it to frontend build variables. Construct the selected adapter(s) only at the server runtime composition root, keep fixture mode deterministic, report actual capability readiness, and keep timing decorators/provider diagnostics provider-neutral or safely namespaced. Update `.env.example`, README operational setup, and AGENTS only to describe the implemented current state. Existing configurations without OpenAI settings continue working unchanged.

## Verification

### Automated

- Focused OpenAI adapter tests with injected fake SDK/client or transport; no live credentials.
- Config, runtime composition, `/api/status`, timing decorator, and durable provenance/schema tests for the selected routing policy.
- Regression tests proving existing Anthropic adapter behavior and Anthropic-only configuration remain intact.
- Tests for exact prompt pass-through, structured output parsing/normalization, retries, cancellation, sanitized errors/diagnostics, streamed text ordering, refusal/empty/error handling, and source/citation restrictions.
- Repository checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `git diff --check`, and `git status`.

### Manual / operational

- Compare both adapters on a fixed, redacted evaluation set covering straightforward factual resolution, complex multi-obligation synthesis, decomposed research, follow-up context, truncation/correction, and synthesis citation discipline; record quality, invalid-output rate, latency, token usage where reported, and cost without retaining prompts/provider payloads in logs.
- Live OpenAI/Anthropic smoke and any provider/deployment setting change require available credentials and separate owner authorization. Fixture success is not evidence of live provider behavior.

### Not verified / external pending

- OpenAI API schema/stream semantics and current model availability must be checked against first-party documentation at implementation time.
- Relative research quality, production latency, and cost under Dorothy Ann's prompts are unknown until measured on the same evaluation set.

## Open Questions

- Which routing topology should ship first: independently configurable providers for assessment and synthesis, or one selected provider per deployment with separate model IDs? — Jonny — blocks readiness.
- Should persisted execution provenance add an explicit provider identifier, or should existing model refs become provider-qualified strings? — resolve during P2 against schema compatibility and diagnostics; blocks readiness if required by the selected routing policy.
- Should the initial OpenAI adapter target a particular model, or keep both model IDs configurable and leave selection to operator evaluation? — Jonny — blocks implementation configuration; can default to configurable model IDs.
- What fixed/representative evaluation cases and acceptance thresholds should determine whether an OpenAI capability is approved for assessment versus synthesis? — Jonny — blocks readiness of the evaluation/rollout criterion.
