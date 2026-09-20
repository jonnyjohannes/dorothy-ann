# Dorothy Ann

Dorothy Ann is a browser-based information resolver and researcher. Ordinary requests and `/threads/new?q=...` create recursively resolved `ResearchTurn`s with bounded evidence and one synthesized answer. Use `/search <query>` or `/search?q=...` when you want ranked links without research synthesis.

## what it does

- ⚡ **`/search <query>`** returns ranked, normalized sources without extraction or LLM synthesis
- 🔎 **ordinary requests** research by default, recursively resolving evidence gaps within explicit search, source, depth, branch, and assessment ceilings
- 🧾 **thread history** keeps terminal turns, canonical source metadata, evidence projections, and read-only migrated legacy archive entries
- 🗂️ **browser workspace** provides focused home, thread, thread-list, settings, and unlock routes backed by typed product boxes
- 🔐 **private research desk** keeps authentication, storage, provider, and extraction implementations behind ports
- 🧪 **fixture mode** supports development without live provider credentials

## research flow

Ordinary research follows one retrieval-first protocol. Continued research may be one focused search or a bounded decomposition; both return to assessment before the root answer is synthesized:

```text
question
   |
   v
exact-question retrieval when admissible evidence is absent
   |
   v
extract useful results -> assess
                         | root resolved with ≥2 materially independent sources
                         +-------------------------------> synthesize once
                         | search (including unmet root corroboration)
                         +-> focused retrieval/extraction -> reassess
                         | decompose(all | any)
                         `-> bounded child resolution -> join -> reassess
```

The root uses the exact user question for its first search when no admissible extracted evidence already exists. The assessor returns one `resolved | search | decompose(all | any)` directive. `search` acquires focused missing evidence; `decompose` resolves genuinely independent child obligations and joins their supported knowledge. Both paths reassess the parent, and children never produce separate user-facing answers. A root `resolved` directive targets at least two materially independent evidence sources supporting the central conclusion, including for straightforward factual questions; when that target is unmet, the assessor requests one focused corroboration search where the existing budget permits. Independence is model-judged: different URLs or domains, syndicated copies, repeated reports, and same-publisher pages are not automatically independent, and the application does not enforce source count or publisher lineage. This target applies to the root only; child obligations retain their existing behavior. A sufficient or useful best-effort root synthesizes exactly once; no useful supported evidence produces an insufficient outcome. Search, source, assessment, and depth ceilings are shared across the complete tree and are hard limits rather than targets.

## architecture

The package is strict TypeScript targeting Node 22. Domain and application code remain provider/platform independent. The main boundaries are:

- `src/domain/` — canonical v3 types, schemas, identity, migration, knowledge, and context policies
- `src/application/` — assessor, evidence acquisition, recursive resolution, synthesis, turn execution, and terminal commit policies
- `src/ports/` — provider-neutral LLM, search, extraction, storage, identity, prompts, and turn-gateway contracts
- `src/infrastructure/` — Anthropic/Brave/extraction, browser gateway/storage, Redis, identity, and runtime adapters
- `src/server/` — portable Hono composition and authenticated HTTP/SSE turn boundary
- `server/` and `api/` — thin Node/Vercel runtime adapters
- `src/ui/` — route composition, workspace/turn controllers, semantic primitives, and typed `PromptBox`, `TranscriptBox`, `EvidenceBox`, `BrandBox`, `StickyHeader`, `SettingsBox`, `ThreadsBox`, `UnlockBox`, and `SystemStatusBox` components; `Hotkeys` is the non-visible layout-control box
- `tests/` — domain, application, contract, infrastructure, UI, and Playwright coverage

`ASSESSOR.md` and `SYNTHESIZER.md` are the only target LLM system-prompt assets. Runtime loading keeps them out of browser bundles and durable product data; dynamic context, schemas, retries, and evidence remain typed user/protocol input.

## development

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Fixture mode is the default. Live provider credentials are optional for local implementation and must never be exposed through `VITE_*` variables or browser assets.

### research timing logs

Set `RESEARCH_TIMING_LOGS=true` to emit one server-side structured summary per research execution. Logging is off by default; set `LOG_LEVEL=debug` for local research diagnostics (`info` is the example production default). The versioned allowlisted record contains only `event`, `schema_version`, bounded terminal/resolution/stop enums, answer position, bounded assessment directive history and failure/invalid-response enums, aggregate context counts, integer `execution_ms`, optional `resolution_ms` and `first_answer_signal_ms`, ledger counts, and aggregate `search`, `extraction`, `assessment`, and `synthesis` stage timings (`calls`, `succeeded`, `failed`, `cumulative_ms`, `max_ms`, and optional `first_output_ms`). Concurrent call durations overlap, so use execution/resolution wall time for critical-path latency and cumulative stage time only as workload data.

These records never contain request or prompt text, extracted content, URLs/source metadata, provider/model names, execution/turn IDs, credentials, provider payloads, or error messages/stacks. Keep normal production log access and retention controls in place because even bounded timing/count metadata is operationally sensitive. Timing data is not added to SSE, `/api/status`, durable turns, or browser storage.

## documentation

- [v1.1.0 release-candidate changelog](docs/releases/dorothy-ann-v1.1.0-rc.md) — durable detailed inventory, verification, and append-only RC patch log
- [v1.1.0 architecture plan](docs/plans/dorothy-ann-v1.1.0.md) — implemented boxes, contracts, migration policy, verification, and handoff
- [v1.0.0 plan](docs/plans/dorothy-ann-v1.0.0.md) — original product baseline
- [Repository guide](AGENTS.md) — working boundaries, verification, secrets, and implementation rules

made with curiosity, citations, and Miss Frizzle's timeless wisdom. <|°_°|>
