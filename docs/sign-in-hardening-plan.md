# Sign-in hardening plan (safety sprint Part C)

## Why

Part C of the safety sprint (`docs/safety-sprint-plan.md` on `feat/durable-job-runner`, decisions S3 to S6 answered by Ethan 2026-11-11). The JWT sign-in kept its token in `sessionStorage`, where an injected script can read it; the per-account lockout allowed 8 wrong passwords; and accounts that cannot use the email reset (Faculty, wrong or missing school email) had no recovery path.

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-11 |
| **Date last updated** | 2026-11-11 |
| **Status** | `built` (gate 1 approved 2026-11-11; migration `036` applied on live Supabase 2026-11-11) |
| **Sources** | `docs/safety-sprint-plan.md` Part C; REA spec `accounts-sign-in` (#1) R11 to R16, R20, R21, R24; S3 to S6 |
| **Migration** | `036_sign_in_hardening.sql` (`034` = Part A job runner, PR #17; `035` = audit RLS fix) |

## Gate 1 for Ethan (2026-11-11, resumed session)

**Where it stands.** The branch is one commit (`e18dc9d`) on top of current `main` (`bead6ce`); no rebase was needed. The checks now pass on this branch: typecheck clean, API tests 399 of 399, web tests 281 of 281. These tests use fake databases; nothing has run against a real database or in a browser yet.

**Already built (in the WIP):**
- Wrong password 5 times in 15 minutes: sign-in pauses for 15 minutes, then unlocks by itself. Library staff can unlock early from user management, with a reason that is recorded.
- One lock only. It reuses John's existing lock table (`login_attempt_windows`, migration `029`) inside `login-security.service.ts`; no second lock was added. The old session sign-in (`/api/auth/login`) already refuses to sign anyone in (`409`), so every password check goes through this one lock.
- The sign-in key now lives in a cookie that page scripts cannot read (httpOnly, Secure, SameSite). Every change request must also carry an anti-forgery code. The old header is still accepted for one release so signed-in people are not thrown out on deploy day.
- Admin can set a temporary password (shown once). The person must choose a new password before doing anything else.

**Changed this session:** migration renamed `035_sign_in_hardening.sql` → `036_sign_in_hardening.sql` (`034` = Part A job runner, PR #17; `035` = audit RLS fix) and the trackers updated. The file itself is unchanged: one new column, `accounts.must_change_password`, default off.

**Gate 1 approved by Ethan (2026-11-11). Done after approval:**
1. `036` run on a throwaway local Postgres 17 through the real runner (`run-supabase-schema.js`): applied, a second run says "Already applied", existing rows get `false`. The full chain cannot be rebuilt from empty (it needs Supabase's `storage` and `anon`), so `/api/health` was not checked there.
2. Vercel serves the web app and `/api/*` from one address (`vercel.json` rewrites), so the cookie is sent.
3. Browser check skipped by Ethan's choice: test sign-in on a Vercel preview after `036` is applied.
4. Reviews (plan check, security): nothing HIGH. Fixed: a failed sign-out now says "Sign out could not be confirmed" instead of silently leaving the cookie (which signed the user back in on reload); sign-out in a new tab first fetches the anti-forgery code; the change-password form survives a reload in a new tab; "password changed" now shows on the sign-in page; plainer anti-forgery message. Tracker "next free number" lines now say `037`.
5. `package-lock.json` keeps only npm `"peer"` marker churn and is not committed.

**Open for Ethan (not built):**
- Someone who knows an Admin's school ID can keep that Admin locked out by typing 5 wrong passwords every 15 minutes. Only another Admin can unlock an Admin. Options: let a Librarian unlock an Admin, or slow Admin sign-in down instead of locking it.
- Temporary passwords never expire (suggest 48 hours, needs a new column).
- No rate limit on the staff unlock and temporary-password actions.
- An Admin who resets a Librarian's password can sign in as that Librarian until it is changed (recorded in the audit log).
- The `Secure`/`__Host-` cookie depends on `NODE_ENV=production`; a staging deploy without it gets a weaker cookie.

**Risks:**
- Deploy order: `036` must be applied before the new API goes live, or sign-in reports "migration required". Done 2026-11-11 with Ethan's go-ahead.
- After one release, the old header must be removed in a follow-up, or the protection is only half done.
- The temporary password is shown to the Admin on screen; they must pass it on in person until Gmail SMTP is set up.

## Gap check (against `main` at `bead6ce`)

| Item | State on `main` | Part C does |
| --- | --- | --- |
| C1 lockout | **Exists**: `login_attempt_windows` (`029`), keyed by account (or by the typed ID when no account matches), 8 wrong passwords then a 10-minute pause, `429 LOGIN_PAUSED` | 5 wrong passwords, 15-minute window and lock; Admin unlock |
| C2 token storage | **Missing**: token in `sessionStorage`, sent as `Authorization: Bearer`; CSRF skipped for JWT | `httpOnly` cookie, CSRF on writes |
| C3 forgotten password | **Partial**: email reset (`020`, `password-recovery.service.ts`) for Students and library-created Staff only | Admin-set temporary password, forced change |

The parked WIP (`db7e90c`) was not reused: it used MySQL syntax, replaced John's lockout with a second one, and blocked sign-in instead of forcing the change.

## How

**Migration `036_sign_in_hardening.sql`:** `accounts.must_change_password BOOLEAN NOT NULL DEFAULT FALSE`. No lock columns: the lock stays in `login_attempt_windows`.

**C1. Lockout (S3, gap answers 1 and 2):**
- `ACCOUNT_LOCK_THRESHOLD = 5` and `ACCOUNT_LOCK_MS = 15 min` replace the 8 and 10 minutes in `login-security.service.ts`; the counting window is also 15 minutes.
- The reply stays John's: `429 LOGIN_PAUSED` "Sign-in is paused. Try again in N minutes", and "N attempts remaining" for the last three. A typed ID with no account has its own counter, so the reply does not reveal which accounts exist.
- `POST /api/v1/admin/users/:accountId/unlock` (`accounts.manage`), body `reason` (3 to 500 characters). Clears that account's window row. `409 USER_NOT_LOCKED` when not locked; `403 USER_STATUS_PROTECTED` for the actor's own account. A Librarian may act only on Student, Faculty and Staff accounts; an Admin also on Librarians, and may unlock (never reset) another Admin, so a guessed-into lock on an Admin can be cleared. Recorded in `account_management_events` as `SignInUnlocked` with actor and reason.

**C2. Cookie (S4):**
- Sign-in, code verify, device switch and resume, and `/activity` set the JWT in an `httpOnly`, `SameSite=Lax` cookie (`__Host-library-token`, `Secure`, in production; `library-token` locally), path `/`, lifetime = token lifetime. The JSON body no longer holds the token; it holds the token's public claims (`session`) and a `csrfToken`.
- The cookie path is `/`, not `/api/v1`: JWT users still call old `/api/catalog`, `/api/inventory`, `/api/categories` and `/api/reports` routes through `requireAuth`, which now also reads the cookie.
- `authenticateJwt`, `requireAuth` and `requireLogoutAuth` accept the `Authorization: Bearer` header for one release, then the cookie.
- CSRF: `csrfToken` = HMAC of the token's `sessionId` with the JWT secret, so it lives exactly as long as the sign-in and needs no server session row. Every non-GET request authenticated by the cookie must send it as `X-CSRF-Token` (`requireCsrfForStateChanges`, now on `/api/v1` and still on `/api`), else `403 INVALID_CSRF_TOKEN`. A Bearer request needs no CSRF token. Session sign-ins keep the existing session token.
- Sign-out (`/api/auth/logout`, device logout) clears the cookie; the existing logout already bumps `auth_version`, so an old token stops working at once.
- Web: `auth-storage.ts` keeps only the public claims and the CSRF token in `sessionStorage`; every `Authorization: Bearer` header becomes `X-CSRF-Token`.

**C3. Temporary password (S5, gap answer 3):**
- `POST /api/v1/admin/users/:accountId/temporary-password` (Admin), body `reason`. Generates a random 16-character password, returns it once (`Cache-Control: no-store`), sets `must_change_password = true`, bumps `auth_version` on `accounts` and `users`, revokes `library_login_sessions`, clears the lock. Same protection as unlock. Recorded as `TemporaryPasswordSet` (never the password).
- While `must_change_password` is set, `ensureActiveJwtAccount` answers `403 PASSWORD_CHANGE_REQUIRED` on every route except `GET /api/v1/auth/me`, `POST /api/v1/auth/activity`, `POST /api/v1/auth/change-password` and sign-out. Sign-in reports `mustChangePassword` and the web opens the change-password form.
- `POST /api/v1/auth/change-password` (signed in, CSRF; 5 wrong current passwords in 15 minutes pause it for 15 minutes, its own `login_attempt_windows` key): current password, new password (8 characters to 72 bytes, same rule as the email reset, different from the current one), confirmation. Clears the flag, bumps `auth_version`, revokes sessions, clears the cookie; the user signs in again. Recorded as `PasswordChanged`.

## Implementation tracking

- [x] `036` migration and trackers (`.cursor/agent-protocol.md`, `README.MD`, `database/supabase/README.md`, `docs/schema-context.md`, `schema-readiness.ts`).
- [x] C1 lockout at 5 and 15 minutes, reply unchanged (`login-security.service.test.ts`).
- [x] C1 Admin unlock with reason, protected targets, audit (`users.repository.test.ts`, `sign-in-hardening.routes.test.ts`).
- [x] C2 cookie set, token absent from body, cookie read, Bearer still read (`sign-in-hardening.routes.test.ts`).
- [x] C2 CSRF required for cookie writes, not for Bearer or GET (`jwt-cookie.test.ts`, `sign-in-hardening.routes.test.ts`).
- [x] C2 sign-out clears the cookie (`authController.test.js`).
- [x] C3 temporary password, forced-change gate, change-password route (`users.repository.test.ts`, `sign-in-hardening.routes.test.ts`).
- [x] Web: no token in storage, CSRF header sent, change-password form, Admin unlock and temporary password actions (Vitest).

## Change log

| Date | Change |
| --- | --- |
| 2026-11-11 | `036` applied to live Supabase (column `NOT NULL DEFAULT false`, all 9 rows `false`, `schema_migrations` checksum `3641915f…`). Browser check not run: no Vercel preview exists for this branch (repo deploys by CLI, not Git). |
| 2026-11-11 | Gate 1 approved. `036` checked on a throwaway Postgres; reviews found nothing HIGH; sign-out, new-tab change-password and message fixes with tests; open items listed for Ethan. |
| 2026-11-11 | Resumed: branch already on current `main`; migration renamed to `036` (`035` = audit RLS fix); typecheck, API 399/399 and web 281/281 pass on fakes; status back to `planned` for gate 1. |
| 2026-11-11 | Built on `feat/sign-in-hardening`: migration `035` (now `036`) (pending, not applied), C1 lockout 5/15 and Admin unlock, C2 httpOnly cookie with HMAC CSRF (Bearer still read for one release), C3 temporary password, forced-change gate and change-password form. Reviews: plan-verifier ready; security-reviewer 2 HIGH, 4 MEDIUM, 3 LOW and database-reviewer 1 HIGH, 2 MEDIUM, 3 LOW, all fixed (Librarian cannot reset a Librarian, Admin can unlock an Admin, login CSRF origin check always on, lock order attempt row then account, change-password attempt limit with bcrypt outside the lock, new-tab CSRF restore via `/auth/me`, legacy `/api/auth/me` 401, stale cookie no longer blocks session sign-out). |
| 2026-11-11 | Created from sprint Part C after the gap check. Ethan answered: reuse `login_attempt_windows` (5 wrong, 15 minutes, Admin unlock); keep John's "paused" reply; keep the Admin temporary password. Built on `feat/sign-in-hardening` from `origin/main`. |
