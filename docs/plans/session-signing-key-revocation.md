# Session signing key revocation

## Current State

- Status: active security follow-up. A user-shared browser screenshot exposed a signed session cookie; the cookie value is not recorded here. The owner subsequently updated Production `SESSION_SIGNING_KEYS` on the linked `dorothy-ann` project, redeployed to a new `READY` Production deployment, and reported being asked to re-authenticate. Metadata and behavior support current-alias rotation; the sensitive value is encrypted, so absence of old fallback keys still relies on owner confirmation. The owner enabled Standard Deployment Protection. Read-only unauthenticated requests to two older generated Production URLs now redirect to Vercel Authentication, while the current Production alias serves the app. No project-level `SESSION_SIGNING_KEYS` entry was found in Preview or Development. Global revocation awaits owner confirmation that the new Production value contains no old fallback key.
- `server/auth.ts` signs new cookies with the first configured key and verifies them with **any** configured key. Its `/api/auth/logout` route only deletes the browser cookie; it does not revoke a copied token. New sessions have a seven-day expiry, and refresh cannot exceed the initial 30-day absolute expiry. Old Vercel deployments retain their environment snapshot; read-only unauthenticated requests reached `/api/auth/session` on two older generated Production deployment URLs. Their signing-key values were not inspected, and no exposed token was replayed.

## Decision

- Treat the exposed session as potentially valid until a new Production deployment uses **one independent fresh signing key only**, with every exposed/previous key removed. Keep the passphrase hash and limiter key unchanged unless they were separately compromised. Do not place a key in chat, shell history, command arguments, logs, repository files, screenshots, or `VITE_*` variables.
- Review the project's Deployment Protection. Current Standard Protection with Vercel Authentication protects generated deployment URLs while leaving Production domains public; alternatively retire older generated deployments deliberately, accepting loss of rollback. Do not assume a new alias makes the old deployment's credentials unavailable. Preview/Development deployments and team-shared configuration need their own scope check if they use the old key.
- The owner performs Vercel changes, or each assistant-side mutation must first show exact command, target and effect and receive separate approval.

## Handoff

- Read-only checks confirmed a newer Production `SESSION_SIGNING_KEYS` update and a subsequent `READY` Production deployment of the current commit; the owner was required to re-authenticate. Confirm privately that the value contains only a fresh key, not a comma-separated old fallback. The owner enabled Standard Protection; read-only unauthenticated requests to two formerly public older generated Production URLs returned an HTTP redirect to Vercel Authentication. The current Production alias still returns the application's unauthenticated session response, as expected. Preview and Development have no project-level session-key entry. Do not test by copying the exposed token into a request. Old tokens could still be accepted behind protection by authorized Vercel users or bypass holders; do not claim deletion of historical environments.
- [Vercel environment-variable management](https://vercel.com/docs/environment-variables/managing-environment-variables) says new values apply only to new deployments; [rotation guidance](https://vercel.com/docs/environment-variables/rotating-secrets) notes old deployments retain old values. [Deployment Protection](https://vercel.com/docs/deployment-protection) describes Standard Protection for generated URLs.

## Plan Ledger

- [~] S1 — Production key metadata, later `READY` deployment and re-authentication verified; owner still needs to confirm privately that **all** old verification keys were removed (no values shared).
- [x] S2 — owner enabled Standard Protection; two representative older generated Production URLs now redirect unauthenticated requests to Vercel Authentication, while the active Production alias remains public. No project-level Preview/Development session-key entries were found; no team-shared entry was identified in the project-level listing. Historical deployments remain stored, not deleted.

## Open Questions

- Did the owner replace the full key list with a new-only value, or temporarily retain an old verification key?
- Are any team-shared or separately configured environments using the old key outside the project-level entries inspected here?
