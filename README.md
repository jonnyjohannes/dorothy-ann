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

Ordinary research follows a simple retrieval-first path and only recurses when the retrieved evidence leaves genuinely independent gaps:

```text
question
   |
   v
exact Brave search
   |
   v
extract top useful results
   |
   v
can we answer simply and responsibly?
   | yes                     | no
   v                         v
synthesize          recursively split material gaps
                                 |
                                 v
                       targeted child searches
                                 |
                                 v
                            join + synthesize
```

The root uses the exact user question for its first search when no admissible extracted evidence already exists. The assessor then evaluates the extracted evidence. Simple questions resolve and synthesize immediately; genuinely compound questions may decompose into bounded child problems, whose supported knowledge is joined and reassessed at the root. Children never produce separate user-facing answers. Search, source, assessment, and depth ceilings are shared across the complete tree and are hard limits rather than targets.

## architecture

The package is strict TypeScript targeting Node 22. Domain and application code remain provider/platform independent. The main boundaries are:

- `src/domain/` — canonical v3 types, schemas, identity, migration, knowledge, and context policies
- `src/application/` — assessor, evidence acquisition, recursive resolution, synthesis, turn execution, and terminal commit policies
- `src/ports/` — provider-neutral LLM, search, extraction, storage, identity, prompts, and turn-gateway contracts
- `src/infrastructure/` — Anthropic/Brave/extraction, browser gateway/storage, Redis, identity, and runtime adapters
- `src/server/` — portable Hono composition and authenticated HTTP/SSE turn boundary
- `server/` and `api/` — thin Node/Vercel runtime adapters
- `src/ui/` — route composition, workspace/turn controllers, semantic primitives, and typed `*Box` components
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

Set `RESEARCH_TIMING_LOGS=true` to emit one server-side JSON summary per research execution. Logging is off by default. The versioned record contains only `event`, `schema_version`, bounded terminal/resolution/stop enums, integer `execution_ms`, optional `resolution_ms` and `first_answer_signal_ms`, ledger counts, and aggregate `search`, `extraction`, `assessment`, and `synthesis` stage timings (`calls`, `succeeded`, `failed`, `cumulative_ms`, `max_ms`, and optional `first_output_ms`). Concurrent call durations overlap, so use execution/resolution wall time for critical-path latency and cumulative stage time only as workload data.

These records never contain request or prompt text, extracted content, URLs/source metadata, provider/model names, execution/turn IDs, credentials, provider payloads, or error messages/stacks. Keep normal production log access and retention controls in place because even bounded timing/count metadata is operationally sensitive. Timing data is not added to SSE, `/api/status`, durable turns, or browser storage.

## documentation

- [v1.1.0 architecture plan](docs/plans/dorothy-ann-v1.1.0.md) — implemented boxes, contracts, migration policy, verification, and handoff
- [v1.0.0 plan](docs/plans/dorothy-ann-v1.0.0.md) — original product baseline
- [Repository guide](AGENTS.md) — working boundaries, verification, secrets, and implementation rules

made with curiosity, citations, and Miss Frizzle's timeless wisdom. <|°_°|>
