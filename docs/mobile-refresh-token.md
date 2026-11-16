# Mobile refresh token

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-16 |
| **Date last updated** | 2026-11-16 (draft PR prepared, migration 039 not applied, nothing deployed) |
| **Status** | inprogress |

## Why

The phone app signs in with a 15 minute access token and today has no way to renew it without the password. Students are signed out of the phone constantly. A rotating refresh token lets the phone stay signed in for a fixed 30 days from sign-in, while a password reset, deactivation or status change still ends it.

## How

Design option approved by Ethan: option-a. A Student or Faculty sign-in stops bumping `accounts.auth_version`, so a phone and the web can be signed in together. A web sign-in revokes only `client='web'` sessions, a phone sign-in only `client='mobile'` ones. Password reset, deactivation, admin status change and role consolidation keep bumping `auth_version`. Staff keep today's bump. With the flag on, a web logout of a Student or Faculty ends only that session's row. A second phone replaces the first and clears its trusted-device mark, so only the account's most recent phone signs in with the password alone (no emailed code). Reuse of a rotated refresh token revokes the whole family, with a 10 second grace (`REFRESH_REUSE_GRACE_MS`) for a lost reply. `MOBILE_TRUST_MAX_MS` is `null` (no cap on device trust; John can set one).

Migration `039_mobile_refresh_tokens.sql`:

- `library_login_sessions.client` (`web` or `mobile`, default `web`) and `trusted_since`.
- `mobile_refresh_tokens(token_hash, session_id, account_id, auth_version, issued_at, expires_at, rotated_at, replaced_by)`. Only `deviceTokenHash('refresh', token)` is stored, never the raw token. RLS is on; `anon` and `authenticated` have no grants.

`POST /api/v1/auth/refresh` with `{ refresh_token }` and no Authorization header, enabled by `MOBILE_REFRESH_ENABLED=true` (otherwise 404 `REFRESH_DISABLED`):

```json
{ "success": true, "data": { "token": "...", "tokenType": "Bearer", "expiresIn": 900, "refreshToken": "...", "refreshExpiresAt": "2026-02-04T00:00:00.000Z" } }
```

Each call rotates the token: the old row gets `rotated_at` and `replaced_by`, the new row copies the family deadline (`expires_at`) unchanged. Every timestamp comes from the service's injected clock, so tests move time by moving the clock.

Follow-up (accepted): rotated and expired `mobile_refresh_tokens` rows are not purged in this branch; plan 07-10 carries the line into the draft PR body with the suggested job-runner purge, so John decides the retention.

## Implementation tracking

- [x] 07-01 migration 039, refresh service, `/refresh` route, PGlite test (tracer): `mobile-refresh.service.test.ts`
- [x] 07-03 reuse detection, expiry, account checks: `mobile-refresh.service.test.ts`
- [x] 07-05 revoke endpoint, readiness, migration safety, rate limiters: `refresh-routes.test.ts`, `mobile-refresh.migration.test.ts`, `schema-readiness.test.ts`, `refresh-limits.test.ts`
- [x] 07-07 sign-in issues the refresh token (`client: "mobile"`), option-a sign-in changes, web logout keeps the phone: `session-coexistence.test.ts`
- [x] 07-09 trusted-device handling: `trusted-device.test.ts`
- [x] 07-10 Bearer-only access to every Student/Faculty `/api/v1` route (S3): `api-v1-bearer-only.test.ts`
- [ ] Draft PR opened for John (Ethan pushes; the migration is not applied and nothing is deployed)

## Change log

- 2026-11-16: created with the tracer (migration 039, `createMobileRefreshService`, `POST /api/v1/auth/refresh`).
- 2026-11-16: with MOBILE_REFRESH_ENABLED on, a Student/Faculty web logout through `/api/auth/logout` ends only that session's `library_login_sessions` row and no longer bumps `auth_version`, so it cannot kill the same account's phone refresh family (D-14). Staff and flag-off logouts still bump.
- 2026-11-16: sign-in, trusted phone, replace-by-second-phone, revoke endpoint, readiness gate, S4 limits and the S3 Bearer-only test are in; the full api and web suites and the typecheck pass. Status stays inprogress: draft PR for John, migration 039 not applied, nothing deployed.
