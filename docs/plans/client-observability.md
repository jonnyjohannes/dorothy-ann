# Optional client observability

## Current State

- Status: planned, not implemented or deployed. Jonny enabled Vercel Analytics and Speed Insights in the dashboard and selected coarse, anonymized route reporting (option A). Neither npm package is installed in this repository.
- The app is a Vite React Router SPA (`src/main.tsx` composes `BrowserRouter` and `App`). `/threads/new?q=...` can contain a prompt in the URL; `/threads/:threadId` contains an identifier; `/unlock` may carry a return URL. Browser telemetry is not a substitute for server `research_timing` assessment/extraction diagnostics.
- The repository guide points to a current-state audit that is absent in this checkout; the archived plans remain reference for shipped route and privacy contracts.

## Decision

- Implement one optional **client UI** telemetry mount at `src/main.tsx`, outside domain/application, with a concrete Vercel adapter under `src/infrastructure/`. Avoid a generic event bus, domain port, server dependency, or custom research events. Install `@vercel/analytics` and `@vercel/speed-insights` and mount their React components only in that adapter, once per app. A no-op is the default; a non-secret, build-time opt-in `VITE_TELEMETRY_PROVIDER=vercel` in an approved Vercel environment selects the adapter. Production build alone does not imply Vercel. Failed telemetry loading/reporting must not block routes, auth, research, or rendering. A future provider replaces this composition seam, not business logic.
- Both `beforeSend` policies must allowlist known routes, remove all query strings and fragments, group `/threads/:threadId` under a route template, and drop unknown/sensitive paths. Treat `/threads/new` and `/unlock` as sensitive until verified safe; do not collect prompts, IDs, passphrases, answer text, provider payloads, or raw URLs. Speed Insights' `route` must be a normalized pattern, never the concrete thread ID. Confirm initial-load script requests and Referrer headers do not carry prompt or thread identifiers; add a portable referrer policy or exclude affected routes before production enablement if needed. No silent privacy fallback.
- Verify generic React package behavior on React Router SPA navigation; no manual duplicate pageview instrumentation. Web Analytics reports page/route usage and Speed Insights browser vitals, **not** assessor/provider duration. Leave existing server timing logs in place.
- No Vercel-side mutation (env var, deployment, dashboard action) without showing exact command, target and effect and receiving separate explicit approval. `npm install` is local project work; it does not activate collection in Production by itself.

## Plan Ledger

- [ ] P1 — add two dependencies and an optional no-op/Vercel composition seam, with package code isolated from domain/application/server and telemetry failures nonblocking.
- [ ] P2 — implement and test conservative route/URL sanitization for both SDKs, including `?q`, thread IDs, `/unlock?returnTo`, unknown paths, and first-load Referrer/script requests. Decide/verify referrer handling before any live collection.
- [ ] P3 — focused unit and browser tests for disabled/non-Vercel mode, production opt-in, initial load + SPA navigation, no duplicate events, safe payloads and nonblocking SDK failure; run lint, typecheck, full tests, build, isolated fixture e2e, bundle/secret scan and diff/status. Record observed browser behavior and any limitations.
- [ ] P4 — separately request approval for the Production build-time opt-in and deployment; verify safe network traffic on the deployment before interpreting dashboard data. Document preview behavior and rollback (disable opt-in and redeploy). No implicit rollout.

## Open Questions

- Which implementation of portable Referrer-Policy best protects direct loads without changing unrelated embeds/navigation? Settle with a browser network test before P2 closes.
- Does the installed SDK version track React Router transitions automatically and support both `beforeSend` hooks as expected? Verify at implementation time; do not assume from generic framework docs.
- The shape of future non-LLM research routing and any server-side observability provider remain outside this plan.

## Sources

- Vercel [Analytics quickstart](https://vercel.com/docs/analytics/quickstart), [configuration](https://vercel.com/docs/analytics/package), [sensitive-data redaction](https://vercel.com/docs/analytics/redacting-sensitive-data)
- Vercel [Speed Insights quickstart](https://vercel.com/docs/speed-insights/quickstart), [configuration](https://vercel.com/docs/speed-insights/package)
