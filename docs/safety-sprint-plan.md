# Safety sprint plan

## Why

The comparison with STI ILMS REA (`docs/rea-comparison-report.md`, 2026-11-11) found risks on the live system:

1. **Scheduled work never runs in production.** Overdue escalation, reservation expiry and notification generation start as `setInterval` timers in `apps/api/src/server.ts`. Vercel serves the API through `api/index.mjs`, which only calls `createApp()`, so none of the three runs on the live site. Overdue status, fines shown before return, expired pickups and due-date notices are therefore wrong or missing.
2. **Mock data is served by live routes.** `GET /api/reports` returns `reports` and `GET /api/inventory/supplies` returns `supplies` from `apps/api/src/data/mock-data.ts`. The web app does not call either route.
3. **Row-level security is not checked by any test.** No migration has an explicit `ENABLE ROW LEVEL SECURITY`; protection relies on the `rls_auto_enable()` trigger and on the `anon` and `authenticated` revokes in `011_advisor_security_lockdown.sql`.
4. **Sign-in gaps.** There is no per-account lockout after wrong passwords (only an IP limit of 8 per 15 minutes in `jwt-auth.routes.ts`). The JWT is kept in `sessionStorage` (`apps/web/src/features/auth/auth-storage.ts`), where an injected script can read it. There is no way to recover a forgotten password.

Checked and safe (no work): the copy and thesis `DELETE` routes only remove a Lost copy with no loans, reservations or audit events (`physical-copy.service.ts`, `thesis-inventory.service.ts`).

| Field | Value |
| --- | --- |
| **Date created** | 2026-11-11 |
| **Date last updated** | 2026-11-11 |
| **Status** | `planned` |
| **Sources** | `docs/rea-comparison-report.md` F1, F2, F3, F5, F8; REA specs `job-runner` (#8) and `accounts-sign-in` (#1); earlier plan `docs/durable-job-runner-plan.md` on `feat/long-overdue-and-damage-case` (decisions D1 to D5 approved by Ethan 2026-10-10) |
| **Migrations** | `main` matches the live database since 2026-11-11: John's merge `d0321a0` and PR #16 (`bead6ce`, which restored 35 of 36 applied migrations byte for byte; `003_readiness_gapfill` differs, its schema verified live). Latest applied `032_login_devices`, `033_rename_system_brand` pending review, **next available `034`**. Re-check `.cursor/agent-protocol.md` before writing a migration |

Allowed status values: `planned` → `inprogress` → `built`.

## How

Three parts. Each is its own branch, plan-verifier run, review and PR, in this order: **A, then B, then C**. Part B is small and can be built at any time.

### Part A: Durable job runner (`feat/durable-job-runner`)

Port the approved October design to the Postgres-only `main`. Do not cherry-pick the old branch: it targets the MySQL-era code and also contains the long-overdue case feature. Read it for design only.

**Re-plan after John's merge (2026-11-11):** `codex/library-revision-updates` has its own job runner (`apps/api/src/modules/jobs/job-runner.ts`, migration `013_phase2_job_runner`, applied live), started from `server.ts` as `startOperationalJobWorker()`. Once that branch is in `main`, Part A finishes one runner and retires the other's tables; the October design below may no longer be the one to build.

**The schema already exists live.** `019_durable_job_runner.sql` from `feat/long-overdue-and-damage-case` was applied to the live database on 2026-10-10, and `scheduled_job_state` holds the three job rows, none of which has ever succeeded (`last_success_at` is null; checked 2026-11-11). So Part A **does not write a new migration**. It brings that exact `019_durable_job_runner.sql` file into `main` unchanged (same name and content, so the migration runner's checksum matches), and builds the code against it. Check whether the live `019` depends on `017_circulation_cases`; if it does, Part A must wait for that decision (see Decision S7).

**Flow** (approved D1 to D5, unchanged):

```text
Supabase Cron (one schedule per job, every minute)
  -> pg_net HTTPS POST to the Vercel URL, secret held in Supabase Vault
  -> POST /api/internal/jobs/:jobName   (header X-Job-Runner-Secret)
  -> lease claim in Postgres (90 s, database clock)
  -> existing service: expireReadyReservations / escalateOverdueTransactions / generateNotifications
  -> run row recorded, lease released, Admin status updated
```

**Schema (`019_durable_job_runner.sql`, already applied live; shown for reference):**
- `scheduled_job_state`: one row per allowed job (`reservation-expiration`, `circulation-overdue`, `notifications`) with lease token and expiry, last start, success and failure times, last outcome, a short error code and a cleaned message (at most 500 characters, no stack traces or secrets), bounded result counts, and an overdue progress cursor. The three rows are seeded.
- `scheduled_job_runs`: append-only history (job, start, finish, outcome, counts, error code and message), indexed by job and start time. Runs older than 30 days are deleted in bounded batches.
- Row-level security on; no grants to `anon` or `authenticated`.
- The Cron schedules are **not** created by the migration. They go in `docs/runbooks/durable-job-runner.md` as copy-paste SQL that Ethan runs once, after the deploy.

**API (`apps/api/src/modules/job-runner/`):** types, repository (claim, release, list state, list runs), service, routes.
- `POST /api/internal/jobs/:jobName`, mounted **before** the session, JWT and CSRF middleware. It accepts only `X-Job-Runner-Secret`, compared with `crypto.timingSafeEqual` after a length check (D1). Unknown job name: `404`. Secret missing or wrong: `401`, with nothing logged about the value. `JOB_RUNNER_SECRET` is read in `config/env.js` and must be at least 32 characters in production, like `JWT_SECRET`.
- Lease: an atomic `UPDATE ... WHERE lease_token IS NULL OR lease_expires_at < NOW() RETURNING *`. No row means another run holds the lease, so the run is recorded as `skipped` (D2). Only the holder of the current lease token may write the result.
- Health: a job is `failed` when its last outcome failed and nothing has succeeded since; `stale` when it has no success in the last 3 minutes; otherwise `healthy` (D3).
- `GET /api/v1/admin/jobs` (Admin only): state and the last 20 runs per job. Read-only: no manual "Run now" button in this part (D4).
- Backlog limits: the overdue scan walks a stored cursor (`due_at`, `transaction_id`) in batches of 100 so newer loans are not starved (D5). The notification queries that scan all reservations and all print requests get a time window (changes in the last 24 hours), so a run fits Vercel's 60-second limit.

**Web:** a read-only "Scheduled jobs" panel on `AdminDashboardPage`, showing each job's status in words (Healthy, Stale, Failed) plus an icon, never color alone, and the last success time in Manila time.

**Local development:** `server.ts` keeps the timers, but each tick calls the same runner service (claim, run, record), so local and production take one code path.

**Tests first:**
- The secret check: missing, wrong length, wrong value and right value.
- Lease: two claims at once, so only one runs; an expired lease can be reclaimed; a stale token cannot write.
- Each job records `succeeded`, `failed` (error cleaned) and `skipped`.
- The cursor advances and wraps.
- Health derivation for each state.
- The Admin route needs the Admin role.
- The dashboard panel renders each state with text.

**Activation (Ethan, after merge and deploy):** apply `019`, set `JOB_RUNNER_SECRET` in Vercel, enable `pg_cron` and `pg_net`, store the URL and secret in Vault, then run the runbook SQL. Each of these is a separate go-ahead.

### Part B: Remove mock routes and guard row-level security (`fix/remove-mock-routes`)

- Delete `GET /api/reports` (`reports.routes.ts` line 16) and `GET /api/inventory/supplies` (`inventory.routes.ts` line 26), and their imports of `data/mock-data.ts`. The real reports (`/api/reports/catalog/inventory.csv`, `.pdf`) and the real supplies routes in the printing module (`/supplies`, `/supplies/ink/...`, `/supplies/paper/...`) stay.
- If nothing else imports `data/mock-data.ts`, delete it. If something does, list it in the change log and leave it.
- New API test: no non-test source file imports `data/mock-data`.
- New RLS check (`tools/` script or an API test that skips without a database): every table in `public` has `relrowsecurity = true`, and `anon` and `authenticated` hold no table privileges. Run it against Supabase only with Ethan's go-ahead; in `npm test` it runs on a fake or skips with a clear message.
- No migration.

### Part C: Sign-in hardening (`feat/sign-in-hardening`)

Scope is the JWT sign-in (`/api/v1/auth`). The old session sign-in (`/api/auth`) is still used by about 18 web calls (catalog admin, inventory, reports, CSRF, `me`, logout). Merging the two is **out of scope** here and gets its own plan. Its accounts get the same lockout, because both sign-ins read the same `accounts` table.

**Check first:** JohnBazty's `codex/library-revision-updates` already has `020_revision_phase1_password_recovery.sql` (applied live) and, on 2026-11-10, "remembered browser sign-in and device switching". Read both before building C1 to C3, reuse what fits, and plan only the gaps.

**C1. Per-account lockout** (REA #1 R13 to R16):
- A new migration (`034` or later) adds `failed_sign_in_count`, `locked_until`, `last_sign_in_at` and `must_change_password` to `accounts`.
- A wrong password for an existing active account adds 1 to `failed_sign_in_count`. At the threshold, `locked_until` is set to the database `NOW()` plus the lock period.
- A locked account gets the same `401 INVALID_CREDENTIALS` reply as a wrong password. The existing `DUMMY_BCRYPT_HASH` check keeps the timing the same.
- A successful sign-in resets the count and clears the lock. A lock ends on its own when `locked_until` passes. An Admin can unlock an account from user management; that is recorded in `account_management_events` with the actor and reason.
- The IP limits stay.

**C2. Token out of `sessionStorage`** (REA #1 R11, R12, R20):
- On sign-in the API sets the JWT in an `httpOnly`, `Secure` (production), `SameSite=Lax` cookie scoped to `/api/v1`, and stops returning it in the JSON body.
- `authenticateJwt` reads the cookie. During one release it also accepts the `Authorization: Bearer` header, then the header is removed.
- Because a cookie is sent automatically, every `/api/v1` write needs the existing CSRF token (`/api/auth/csrf`, `requireCsrfForStateChanges`).
- The web drops `auth-storage.ts` token storage and the about 26 `Authorization: Bearer` headers. It sends `credentials: 'include'`, as the session calls already do.
- Sign-out clears the cookie and bumps `auth_version`, so an old token stops working at once.

**C3. Forgotten password without email** (REA #1 R21, R24):
- StiOrmocLibrary sends no email yet, so self-service reset waits for the notices feature.
- For now: an Admin sets a temporary password from user management. It follows the password rules and is shown once to the Admin. The account gets `must_change_password = true` and `auth_version` is bumped, signing out existing sessions.
- While `must_change_password` is set, every `/api/v1` route except "change password", "me" and sign-out answers `403 PASSWORD_CHANGE_REQUIRED`, and the web shows the change-password form.
- The change is recorded in `account_management_events` (never the password itself).

**Tests first:**
- Lockout: threshold reached, a locked account gets the same reply and timing path, lock expiry, reset on success, Admin unlock with reason, a non-Admin unlock refused.
- Cookie: the token is set as `httpOnly` and absent from the body; a request without the cookie or header gets `401`; a write without CSRF gets `403`; sign-out clears the cookie and old tokens are rejected.
- Forced change: the gate blocks other routes, and the change clears it.
- Web: sign-in, sign-out and the forced-change form; no token is written to storage.

## Decisions (answered by Ethan, 2026-11-11)

| # | Question | Answer |
| --- | --- | --- |
| S1 | Order | **A, then B, then C**, each its own PR |
| S2 | Job runner design | **Keep D1 to D5** (2026-10-10) unchanged; no "Run now" button |
| S3 | Lockout | **5 wrong passwords, 15-minute lock**, ends on its own, Admin unlock with a reason; named constants until a settings catalogue exists |
| S4 | Token storage | **`httpOnly` cookie**, with CSRF on every `/api/v1` write |
| S5 | Forgotten password | **Admin-set temporary password** with a forced change at next sign-in; email reset later with notices |
| S6 | Merging the two sign-ins | **Separate plan** after this sprint |
| S7 | Which branch is the product baseline? | **Resolved 2026-11-11:** John merged `codex/library-revision-updates` into `main` (`d0321a0`) and Ethan merged PR #16 (migration history). Build this sprint on current `main` |

## Implementation tracking

- [x] Ethan answers the open questions (2026-11-11, S1 to S6).
- [ ] Ethan approves the plan for building.
- [ ] Part A: `019` migration, runner module, internal route, Admin route, dashboard panel, local timers on the runner, tests, runbook.
- [ ] Part A: plan-verifier READY, security review, database review (new tables plus lease SQL), PR.
- [ ] Part A activation by Ethan (migration, secret, Cron).
- [ ] Part B: routes and mock file removed, import test, RLS check, PR.
- [ ] Part C: `020` migration, lockout, cookie token with CSRF, forced password change, Admin unlock and temporary password, tests.
- [ ] Part C: plan-verifier READY, security review, database review (`accounts` altered), PR.
- [ ] Trackers updated with each migration (`.cursor/agent-protocol.md`, `README.MD`, `database/supabase/README.md`, `docs/schema-context.md`).

## Change log

| Date | Change |
| --- | --- |
| 2026-11-11 | Created from `docs/rea-comparison-report.md`; status `planned`. Copy delete routes checked and found safe, so they are not part of the sprint. |
| 2026-11-11 | Ethan answered S1 to S6, all as recommended. Status stays `planned` until he approves building. |
| 2026-11-11 | S7 resolved: `main` now matches the live database (PR #16 merged). Next migration `034`. Part A follows the runner decision in PR #16's review item (John proposes moving all jobs to the `019` tables, matching D1 to D5). |
| 2026-11-11 | Read-only check of the live database: migrations applied up to `029` from unmerged branches; `019_durable_job_runner` already applied but never run. Part A reuses that `019` file; Part C moves to `030` or later and first reads JohnBazty's password-recovery work. Added open decision S7 (product baseline branch), which blocks building. |
