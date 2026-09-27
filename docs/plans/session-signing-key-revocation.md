# Session signing key revocation

## Current State

- Status: active security follow-up. A user-shared browser screenshot exposed a signed session cookie; the cookie value is not recorded here. The owner reported rotating security keys, but read-only metadata for the linked `dorothy-ann` project showed no recent Production `SESSION_SIGNING_KEYS` update and no new Production deployment after the exposure. This is an unresolved scope/application check, **not** evidence that the reported rotation did not happen elsewhere.
- `server/auth.ts` signs new cookies with the first configured key and verifies them with **any** configured key. Its `/api/auth/logout` route only deletes the browser cookie; it does not revoke a copied token. New sessions have a seven-day expiry, and refresh cannot exceed the initial 30-day absolute expiry. Old Vercel deployments retain their environment snapshot; read-only unauthenticated requests reached `/api/auth/session` on two older generated Production deployment URLs. Their signing-key values were not inspected, and no exposed token was replayed.

## Decision

- Treat the exposed session as potentially valid until a new Production deployment uses **one independent fresh signing key only**, with every exposed/previous key removed. Keep the passphrase hash and limiter key unchanged unless they were separately compromised. Do not place a key in chat, shell history, command arguments, logs, repository files, screenshots, or `VITE_*` variables.
- Review the project's Deployment Protection. Current Standard Protection with Vercel Authentication protects generated deployment URLs while leaving Production domains public; alternatively retire older generated deployments deliberately, accepting loss of rollback. Do not assume a new alias makes the old deployment's credentials unavailable. Preview/Development deployments and team-shared configuration need their own scope check if they use the old key.
- The owner performs Vercel changes, or each assistant-side mutation must first show exact command, target and effect and receive separate approval.

## Handoff

- Verify **metadata only** that `SESSION_SIGNING_KEYS` was updated on the linked project in Production and that a newer Production deployment is `READY` and promoted. Test fresh login and access through the active Production alias without showing cookies. Do not test by copying the exposed token into a request. Verify generated old deployment URLs are protected/unavailable without authentication. Old tokens remain valid wherever an old reachable deployment still verifies the old key.
- [Vercel environment-variable management](https://vercel.com/docs/environment-variables/managing-environment-variables) says new values apply only to new deployments; [rotation guidance](https://vercel.com/docs/environment-variables/rotating-secrets) notes old deployments retain old values. [Deployment Protection](https://vercel.com/docs/deployment-protection) describes Standard Protection for generated URLs.

## Plan Ledger

- [ ] S1 — owner confirms a new-only Production `SESSION_SIGNING_KEYS` value on the correct linked project (no old verification key) and a later `READY` Production deployment; confirm fresh login/current session behavior without printing secret material.
- [ ] S2 — owner confirms old generated deployment URLs with old env snapshots are protected or deliberately retired, and Preview/Development/team-shared scopes are accounted for. Do not claim global revocation until this is verified.

## Open Questions

- Was the reported rotation saved to the linked project's Production environment, or another scope/project?
- Which Deployment Protection mode currently governs older generated Production URLs?
