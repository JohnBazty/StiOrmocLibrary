# Phase 1 logout token revocation repair

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

The owner requested repair of P1-02 from Phase 1 QA. Successful logout removed the cookie session but a copied bearer token still passed protected API requests until expiry (900 seconds).

## How

Use the existing account/user `auth_version` guards. Within a transaction, lock the linked account then user, compare the authenticated version with the current version, increment both versions and remove related cookie sessions only when the comparison matches. An older logout that was already in flight must not invalidate a newer login. Cookie login uses the same lock order. Logout prefers an explicitly supplied bearer token over a coexisting cookie identity, keeps CSRF enforcement and the existing redirect/cookie clearing behavior, and reports database failures instead of reporting successful revocation.

No schema migration or data reset. Postgres product migration 026 / next 027 and MySQL rollback reference 048 / next 049 remain unchanged. Existing passwords, account roles and library records are preserved. Live verification uses only disposable test accounts and removes them afterward.

## Implementation tracking

- [x] Identify the missing revocation and race between authentication and logout.
- [x] Implement transactional conditional revocation for bearer and cookie sessions.
- [x] Add and run focused replay, concurrency, cookie and failure-path regression tests.
- [x] Verify with disposable records in the configured Postgres database and remove fixtures.
- [x] Restart the local API and record results in the Phase 1 QA report.

## Verification

- **29 focused tests passed** for session repository, login/logout controller and JWT guards. Includes current-version revocation, divergent account/user versions, stale logout preserving a newer version, legacy unlinked cookie user, missing account and transaction/controller failures. Log: `output/phase1-logout-regression.log`.
- **63 authentication/consolidation tests passed** across the broader selected suite (includes the focused tests, not an additional 63). Log: `output/phase1-logout-full-auth.log`.
- API TypeScript check passed: `output/phase1-logout-typecheck.log`.
- **Six live acceptance groups passed** against the configured Postgres database in an isolated application, then the same six passed against the restarted local API on port 4000. Missing CSRF returns 403 without revocation; successful logout returns 303 and token replay immediately returns 401; repeated logout with that token is denied; fresh login succeeds; a deliberately delayed prior-version revocation is a no-op and the newer token remains valid; mixed cookie/bearer logout revokes the bearer identity; both `/api/auth/logout` and `/auth/logout` support cookie logout with linked-version revocation and session removal even when account/user versions differ. Logs: `output/phase1-logout-live.log`, `output/phase1-logout-server.log`; safe summaries use matching `-results.json` filenames.
- Reusable verifier: `apps/api/scripts/verify-phase1-logout.js` (isolated default; `--server` for localhost:4000). Each run seeds random, marker-scoped Student/Faculty fixtures, sends no mail, and removes its accounts/users/cookie sessions in `finally`; cleanup asserts zero matching account/user rows. Passwords/tokens are never printed or saved.
- The first acceptance attempt used an incorrect compatibility-route path (`/logout`); corrected the test to the actual mounted `/auth/logout` route and reran successfully. This was a test-tool error, not an additional application defect.
- Source whitespace check passed. The API was restarted with the fix; the existing web server on port 5173 was retained. No Git push, deployment, migration, RLS/grant change or existing-account/password edit.

P1-02 is resolved locally. Broader Phase 1 acceptance limits (real inbox recovery, browser approval interactions and physical-device testing) remain as documented in the QA report.

## Change log

- 2026-10-16: Started owner-authorized P1-02 repair. Chose existing version guards and transactional locking; retained route/CSRF contracts and migration numbers.
- 2026-10-16: Completed implementation, 63 selected regression tests, typecheck, isolated and running-server Postgres acceptance with fixture cleanup, and local API restart. Marked P1-02 resolved; no real account reset or schema change.
