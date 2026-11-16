# Mobile refresh token

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-16 |
| **Date last updated** | 2026-11-16 |
| **Status** | inprogress |

## Why

The phone app signs in with a 15 minute access token and today has no way to renew it without the password. Students are signed out of the phone constantly. A rotating refresh token lets the phone stay signed in for a fixed 30 days from sign-in, while a password reset, deactivation or status change still ends it.

## How

Design option approved by Ethan: option-a. A Student or Faculty sign-in stops bumping `accounts.auth_version`, so a phone and the web can be signed in together. A web sign-in revokes only `client='web'` sessions, a phone sign-in only `client='mobile'` ones. Password reset, deactivation, admin status change and role consolidation keep bumping `auth_version`. Staff keep today's bump. (Those sign-in changes land in later plans; this branch step only adds the refresh path.)

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

- [x] 07-01 migration 039, refresh service, `/refresh` route, PGlite test (tracer)
- [ ] 07-03 reuse detection, expiry, account checks, revoke endpoint
- [ ] 07-05 rate limiters
- [ ] 07-07 sign-in issues the refresh token (`client: "mobile"`) and option-a sign-in changes
- [ ] 07-09 trusted-device handling
- [ ] 07-10 draft PR for John

## Change log

- 2026-11-16: created with the tracer (migration 039, `createMobileRefreshService`, `POST /api/v1/auth/refresh`).
- 2026-11-16: with MOBILE_REFRESH_ENABLED on, a Student/Faculty web logout through `/api/auth/logout` ends only that session's `library_login_sessions` row and no longer bumps `auth_version`, so it cannot kill the same account's phone refresh family (D-14). Staff and flag-off logouts still bump.
