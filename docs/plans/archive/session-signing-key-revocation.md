# Session signing key revocation

## Current State

- Status: done. A user-shared browser screenshot exposed a signed session cookie; the cookie value is not recorded here. The owner replaced Production `SESSION_SIGNING_KEYS` with **one fresh key only** on the linked `dorothy-ann` project and redeployed commit `d95923a` to a newer `READY` Production deployment (no security-specific tag). They were required to re-authenticate; the secret value was never inspected or shared. The owner enabled Standard Deployment Protection: read-only unauthenticated requests to two older generated Production URLs now redirect to Vercel Authentication, while the current Production alias serves the app. No project-level session-key entry was found in Preview or Development. Historical deployments retain their old environment snapshots behind Vercel Authentication; they were not deleted.
- `server/auth.ts` signs new cookies with the first configured key and verifies them with **any** configured key. Its `/api/auth/logout` route only deletes the browser cookie; it does not revoke a copied token. New sessions have a seven-day expiry, and refresh cannot exceed the initial 30-day absolute expiry. Old Vercel deployments retain their environment snapshot; read-only unauthenticated requests reached `/api/auth/session` on two older generated Production deployment URLs. Their signing-key values were not inspected, and no exposed token was replayed.

## Decision

- Treat the exposed session as potentially valid until a new Production deployment uses **one independent fresh signing key only**, with every exposed/previous key removed. Keep the passphrase hash and limiter key unchanged unless they were separately compromised. Do not place a key in chat, shell history, command arguments, logs, repository files, screenshots, or `VITE_*` variables.
- Review the project's Deployment Protection. Current Standard Protection with Vercel Authentication protects generated deployment URLs while leaving Production domains public; alternatively retire older generated deployments deliberately, accepting loss of rollback. Do not assume a new alias makes the old deployment's credentials unavailable. Preview/Development deployments and team-shared configuration need their own scope check if they use the old key.
- The owner performs Vercel changes, or each assistant-side mutation must first show exact command, target and effect and receive separate approval.

## Handoff

- Read-only checks confirmed a newer Production `SESSION_SIGNING_KEYS` update and a subsequent `READY` Production deployment of the current commit; the owner was required to re-authenticate and confirmed the value contains only a fresh key, not a comma-separated old fallback. The owner enabled Standard Protection; read-only unauthenticated requests to two formerly public older generated Production URLs returned an HTTP redirect to Vercel Authentication. The current Production alias still returns the application's unauthenticated session response, as expected. Preview and Development have no project-level session-key entry. Do not test by copying the exposed token into a request. Old tokens could still be accepted behind protection by authorized Vercel users or bypass holders; do not claim deletion of historical environments.
- [Vercel environment-variable management](https://vercel.com/docs/environment-variables/managing-environment-variables) says new values apply only to new deployments; [rotation guidance](https://vercel.com/docs/environment-variables/rotating-secrets) notes old deployments retain old values. [Deployment Protection](https://vercel.com/docs/deployment-protection) describes Standard Protection for generated URLs.

## Plan Ledger

- [x] S1 — Production key metadata, later `READY` deployment and re-authentication verified; owner confirmed **one fresh key only** with all old verification keys removed (no values shared).
- [x] S2 — owner enabled Standard Protection; two representative older generated Production URLs now redirect unauthenticated requests to Vercel Authentication, while the active Production alias remains public. No project-level Preview/Development session-key entries were found; no team-shared entry was identified in the project-level listing. Historical deployments remain stored, not deleted.

## Open Questions

- None for the linked project's Production incident. Historical deployments still have their original key snapshots behind Standard Protection, so Vercel-authenticated users or bypass holders may access them; the historical keys were not destroyed. Any independently configured team/shared environment outside the inspected project scopes needs its own rotation if it reused the old key. No exposed token was replayed to test it.
