# Dorothy Ann v1.2.2 release inventory

- Status: release candidate; PR not yet opened.
- Candidate branch: `release/v1.2.2`
- Feature candidate: `457da11`; release-version and dependency-remediation changes are being prepared on top.
- Base: `main` at `936c047` (v1.2.1)
- Package version: `1.2.2`
- Release tag/date: pending merge and release.

## Release summary

v1.2.2 continues the research reliability work and ships the completed interface facelift. It adds operational visibility for research stages and thread-list work, while keeping provider payloads and user content out of diagnostics. Fixture and repository checks pass; live-provider and physical-device validation remain separate limitations.

## Shipped candidate scope

### Research and search

- Improves bounded evidence acquisition, safe extraction, assessment recovery, and evidence sufficiency handling.
- Adds raw `/news` discovery and source provenance while keeping result metadata distinct from factual research evidence.
- Streams a bounded, explicitly provisional synthesis preview; only the validated terminal answer is durable.
- Adds bounded research-stage metrics and selected-source failure diagnostics with privacy-safe logging.

### Interface and interaction

- Completes the route/scroll/focus facelift, including accessible scroll indicators, keyboard scrolling, focus cues, and bundled Source Sans 3 / Source Code Pro fonts.
- Improves saved-thread list presentation and keyboard behavior.
- Adds multiline prompt growth and a mobile-safe submit control while preserving newline entry behavior.
- Includes the iOS home-screen icon and responsive layout refinements.

### Operations

- Batches Redis thread-list reads with a safe fallback and adds thread-list timing instrumentation.
- Adds optional privacy-filtered Vercel Analytics and deployment/runtime housekeeping.
- Updates `@hono/node-server` to the patched 2.1.x line and refreshes vulnerable transitive dependencies.
- Drops the version-specific Zod comment patch; its two non-fatal Rollup annotation warnings are documented below.

### Deferred scope

- OpenAI adapter implementation remains deferred in `../plans/openai-llm-adapter.md`.
- Broader search-surface composition and media inspection remain planning-only in `../plans/search-surface-composition-and-synthesis.md`.
- No production deployment, release tag, or live-provider acceptance is claimed here.

## Verification and release gates

Verified locally after the release metadata and dependency-remediation edits:

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — 39 files, 388 tests passed.
- `npm run build` — passed with three non-fatal warnings: two Zod comment-annotation warnings and the accepted large lazy player chunks (about 533 kB, 592 kB, and 859 kB). The version-specific Zod patch was dropped because it only suppressed these warnings and added maintenance overhead.
- `CI=1 DOROTHY_E2E_VITE_PORT=5273 npm run test:e2e -- --workers=2` — 56 passed, 10 opt-in Analytics cases skipped.
- `npm audit` and `npm audit --omit=dev` — both report zero vulnerabilities after updating vulnerable dependencies. `@hono/node-server` is on 2.1.11; the existing Node adapter `serve` call remains in use and no removed Vercel adapter import exists.
- `git diff --check` — passed for the candidate comparison and working tree.
- GitHub checks on feature candidate `457da11` — Vercel deployment and Vercel Preview Comments succeeded; new checks should run after the release-preparation commit is pushed.

Security and external validation gaps:

- Buildkite status could not be read because the local credential returned HTTP 401.
- Ten opt-in Analytics browser cases were skipped by the test configuration.
- Live Brave/provider behavior and provider timing were not verified in this preflight.
- Physical-device keyboard/IME validation remains explicitly deferred in the archived facelift plan; fixture browser coverage is not a substitute for device validation.

## Release identity

- PR: pending.
- Merge commit: pending.
- Annotated tag: pending.
- Production outcome: pending; no deploy was performed as part of this candidate preflight. <|°_°|>
