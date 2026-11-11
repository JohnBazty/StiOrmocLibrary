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
| **Status** | `inprogress` (Part A built and reviewed on PR #17; Parts B and C not started as their own PRs) |
| **Sources** | `docs/rea-comparison-report.md` F1, F2, F3, F5, F8; REA specs `job-runner` (#8) and `accounts-sign-in` (#1); earlier plan `docs/durable-job-runner-plan.md` on `feat/long-overdue-and-damage-case` (decisions D1 to D5 approved by Ethan 2026-10-10) |
| **Migrations** | `main` matches the live database since 2026-11-11: John's merge `d0321a0` and PR #16 (`bead6ce`, which restored 35 of 36 applied migrations byte for byte; `003_readiness_gapfill` differs, its schema verified live). Latest applied `032_login_devices`, `033_rename_system_brand` pending review, **next available `034`**. Re-check `.cursor/agent-protocol.md` before writing a migration |

Allowed status values: `planned` → `inprogress` → `built`.

## How

Three parts. Each is its own branch, plan-verifier run, review and PR, in this order: **A, then B, then C**. Part B is small and can be built at any time.

### Part A: Durable job runner (`feat/durable-job-runner`)

**Re-planned 2026-11-11 against `main` at `bead6ce`.** `main` has two job systems. Part A keeps one: every active job moves to the `019` tables, as John proposed in PR #16, and both entry points switch together.

**What runs today (read-only check of the live database, 2026-11-11):**
- John's runner (`apps/api/src/modules/jobs/job-runner.ts`, table `library_job_runs` from `013`) runs nine steps in one chain called `operational-minute`. It starts from `server.ts` (`startOperationalJobWorker()`, every 60 s) and from `POST /api/jobs/run` (`Authorization: Bearer`, 32+ character `JOB_RUNNER_SECRET`). Admin reads it at `GET /api/v1/admin/jobs/status`.
- **No Supabase Cron schedule exists** (`cron.job` is empty). `pg_cron` 1.6.4, `pg_net` 0.20.4 and Vault are already installed.
- `library_job_runs` shows 3,618 runs, last success 2026-11-09 17:19 UTC, last run 5.9 s. With no Cron, these came from **laptops running `npm run dev` against the live database**. On Vercel nothing has run.
- One failing step stops every later step in the chain (for example, an enrollment failure stops the overdue scan).
- The `019` tables (`scheduled_job_state`, `scheduled_job_runs`) are on `main` and live, with row-level security on and no `anon` or `authenticated` grants. The three seeded rows have never run.

**Job map (John's nine steps onto `019`):**

| # | Step in `runOperationalJobs` | `019` job name | Backlog bound |
| --- | --- | --- | --- |
| 1 | `createEnrollmentService().closeDue()` | `enrollment-close` | due windows only |
| 2 | `createAttendanceOperations().autoCheckout()` | `attendance-auto-checkout` | cutoff rows only |
| 3 | `flagUnreturnedInLibrary()` | `in-library-unreturned` | room-use loans only |
| 4 | `expireReadyReservations()` | `reservation-expiration` (seeded) | 100 per run, already |
| 5 | `createBookRequestService().advanceWaiting()` | `book-request-advance` | waiting requests only |
| 6 | `escalateOverdueTransactions()` | `circulation-overdue` (seeded) | **cursor (D5)**, 100 per run |
| 7 | `generateNotifications()` | `notifications` (seeded) | print notices limited to requests updated in the last 24 h (D5); the reservation query is already removed |
| 8 | `deliverBookRequestEmails()` | `book-request-emails` | existing batch |
| 9 | `createCollectionReviewService().refresh()` | `collection-review-refresh` | one snapshot |

The six new names need no migration: the claim is one `INSERT ... ON CONFLICT (job_name) DO UPDATE ... WHERE the lease is free RETURNING`, so a job's state row is created on its first claim. Only names in the code allowlist are accepted.

**Flow** (D1 to D5, kept by Ethan as S2):

```text
Supabase Cron, every minute
  -> pg_net HTTPS POST to the Vercel URL, secret held in Supabase Vault
  -> POST /api/internal/jobs/:jobName   (header X-Job-Runner-Secret)
  -> per job: lease claim in Postgres (90 s, database clock)
  -> existing service
  -> run row recorded, lease released, Admin status updated
```

**API (`apps/api/src/modules/job-runner/`):** allowlist, repository (claim, finish, list state, list runs, prune), service, routes. `modules/jobs/` and its two routes are removed.
- `POST /api/internal/jobs/:jobName`, mounted before body parsing and the session, JWT and CSRF middleware, rate limited to 30 calls a minute. Only `X-Job-Runner-Secret`, compared with `crypto.timingSafeEqual` after a length check (D1). Unknown job: `404`. Secret missing, wrong or not configured: `401`; the value is never logged. `JOB_RUNNER_SECRET` is read in `config/env.js`; in production a set secret shorter than 32 characters stops the API from starting, and an unset one leaves the route refusing every call. The reply holds the outcome and counts only.
- `:jobName` = `all` runs every job in the order above, each with its own lease and run row; a failure in one does not stop the next (A1).
- Lease (D2): 90 s from database `NOW()`. Lease held: the run is recorded `skipped`. Only the current lease token may write the result or advance the cursor.
- Outcomes: `succeeded` (counts in `result_json`), `failed` (an error code plus a cleaned message: at most 500 characters, first line only, no stack, secrets or connection strings), `skipped`.
- Failure alert: one `admin_notifications` row `scheduled_job_failed` when a job starts failing or its error code changes; no repeat every minute (D3).
- Health (D3): `failed` when the last outcome failed and nothing succeeded since; `stale` when there is no success in the last 3 minutes; else `healthy`.
- Retention: after each success, delete at most 1,000 of that job's runs older than 30 days.
- `GET /api/v1/admin/jobs` (`requireLibraryPermission('library.manage')`, i.e. Admin): each job's state, health and last 20 runs. Read-only, no "Run now" (D4). `GET /api/v1/admin/jobs/status` is removed.
- `/api/health` schema check: `library_job_runs` is replaced by the two `019` tables. `library_job_runs` stays in the database untouched; dropping it is a later migration, not this part.

**Overdue cursor (D5):** `circulation-overdue` reads loans with `(due_at, transaction_id)` after the stored `progress_cursor`, 100 at a time, and stores the last row it saw. Fewer than 100 rows means the pass is done and the cursor resets to null. Every loan past its due time is reached within one pass, even with a backlog.

**Web:** a read-only "Scheduled jobs" panel on `AdminDashboardPage`: each job's name, status in words (Healthy, Stale, Failed) with an icon, last success in Manila time, and the last error message. It loads on its own, so a jobs error never hides the dashboard.

**Local development:** `server.ts` starts a 60 s timer only when `JOB_RUNNER_LOCAL_TIMER=on` (A2). It calls the same runner (`all`), so local and production share one code path, and the lease stops a laptop and Cron running the same job at once.

**Time zone risk:** loan dates are Manila wall time without a zone. The overdue and notification queries pass a JS `Date` and convert in SQL (`AT TIME ZONE 'Asia/Manila'`), so they do not depend on the server's zone, but node-pg reads `timestamp` columns in the process zone. Tests use a fixed clock; John confirms whether Vercel sets `TZ=Asia/Manila`. The runner itself uses only database `NOW()` for leases and health.

**Tests first:**
- Secret: missing, not configured, wrong length, wrong value, right value; the value never appears in a log or reply.
- Lease: two claims at once, so only one runs; an expired lease is reclaimed; a stale token cannot write the result or the cursor.
- Each job records `succeeded`, `failed` (message cleaned) and `skipped`; `all` continues after a failure; the alert is not repeated.
- The overdue cursor advances, and resets after a short batch.
- Health for each state.
- The Admin route refuses other roles and unauthenticated calls.
- The dashboard panel renders each status in words, and a load error.

**Activation (Ethan, after merge and deploy, each a separate go-ahead):** set `JOB_RUNNER_SECRET` in Vercel, store the URL and secret in Vault, run the runbook's `cron.schedule` SQL, then check the Admin panel. Runbook: `docs/runbooks/durable-job-runner.md`, with the rollback (`cron.unschedule`).

**Part A decisions (answered by Ethan, 2026-11-11):**
- **A1. How many Cron calls?** Answer: **one schedule every minute calling `all`**, each job with its own lease and record. Nine schedules (one per job) would be nine Vercel calls a minute (about 390,000 a month) for no gain at this size; the whole chain took 5.9 s from a laptop. Splitting later needs only new schedules, no code.
- **A2. Should `npm run dev` on a laptop run jobs against the live database?** Answer: **no**; the local timer starts only when `JOB_RUNNER_LOCAL_TIMER=on`, off by default. Today any laptop on any branch runs production jobs with its own, possibly unmerged, code.

### Part B: Remove mock routes and guard row-level security (`fix/remove-mock-routes`)

- Delete `GET /api/reports` (`reports.routes.ts` line 16) and `GET /api/inventory/supplies` (`inventory.routes.ts` line 26), and their imports of `data/mock-data.ts`. The real reports (`/api/reports/catalog/inventory.csv`, `.pdf`) and the real supplies routes in the printing module (`/supplies`, `/supplies/ink/...`, `/supplies/paper/...`) stay.
- If nothing else imports `data/mock-data.ts`, delete it. If something does, list it in the change log and leave it.
- New API test: no non-test source file imports `data/mock-data`.
- New RLS check (`tools/` script or an API test that skips without a database): every table in `public` has `relrowsecurity = true`, and `anon` and `authenticated` hold no table privileges. Run it against Supabase only with Ethan's go-ahead; in `npm test` it runs on a fake or skips with a clear message.
- No migration.

### Part C: Sign-in hardening (`feat/sign-in-hardening`)

Scope is the JWT sign-in (`/api/v1/auth`). The old session sign-in (`/api/auth`) is still used by about 18 web calls (catalog admin, inventory, reports, CSRF, `me`, logout). Merging the two is **out of scope** here and gets its own plan. Its accounts get the same lockout, because both sign-ins read the same `accounts` table.

**Check first:** JohnBazty's `codex/library-revision-updates` already has `020_revision_phase1_password_recovery.sql` (applied live) and, on 2026-11-10, "remembered browser sign-in and device switching". Read both before building C1 to C3, reuse what fits, and plan only the gaps. `main` already has `apps/api/src/modules/auth/login-security.service.ts`; check it for overlap with C1 first. A paused, untested draft is parked as one WIP commit on local branch `feat/sign-in-hardening` (not pushed); its migration must be renumbered to `036`, since Part A uses `034` and the audit RLS fix uses `035`.

**C1. Per-account lockout** (REA #1 R13 to R16):
- A new migration (`036` or later) adds `failed_sign_in_count`, `locked_until`, `last_sign_in_at` and `must_change_password` to `accounts`.
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
- [x] Ethan approves Part A for building (2026-11-11, with A1 and A2).
- [x] Part A: all nine jobs on the `019` runner, internal route, Admin route, dashboard panel, local timer on the runner, John's runner and routes removed, tests, runbook (PR #17).
- [x] Part A: `034_job_runner_hardening.sql` (job table RLS recorded in the repo, open-loan cursor index), added after the database review with Ethan's approval; not applied.
- [x] Part A: plan-verifier, security review and database review run; every CRITICAL, HIGH and MEDIUM finding fixed with tests (none CRITICAL or HIGH).
- [ ] Part A activation by Ethan (migration, secret, Cron).
- [ ] Part B: routes and mock file removed, import test, RLS check, PR.
- [ ] Part C: `036` migration, lockout, cookie token with CSRF, forced password change, Admin unlock and temporary password, tests.
- [ ] Part C: plan-verifier READY, security review, database review (`accounts` altered), PR.
- [ ] Trackers updated with each migration (`.cursor/agent-protocol.md`, `README.MD`, `database/supabase/README.md`, `docs/schema-context.md`).

## Change log

| Date | Change |
| --- | --- |
| 2026-11-11 | Created from `docs/rea-comparison-report.md`; status `planned`. Copy delete routes checked and found safe, so they are not part of the sprint. |
| 2026-11-11 | Ethan answered S1 to S6, all as recommended. Status stays `planned` until he approves building. |
| 2026-11-11 | S7 resolved: `main` now matches the live database (PR #16 merged). Next migration `034`. Part A follows the runner decision in PR #16's review item (John proposes moving all jobs to the `019` tables, matching D1 to D5). |
| 2026-11-11 | Part A re-planned against `main` `bead6ce`: John's nine steps mapped onto `019` (six new job names created on first claim, no migration); both entry points switch together; `library_job_runs` left in place. Live check: no Cron schedule exists, and the 3,618 recorded runs came from local dev servers. Open questions A1, A2. |
| 2026-11-11 | Ethan answered A1 (one Cron call per minute running `all`) and A2 (local timer off unless `JOB_RUNNER_LOCAL_TIMER=on`), both as recommended, and approved Part A for building. Part A status `inprogress`. |
| 2026-11-11 | Part A reviews: no CRITICAL or HIGH. Fixed MEDIUM: the run history row now locks the job row (`FOR UPDATE`) and a lost lease rolls back; `all` stops starting jobs after 40 s and reports the rest `deferred`; an unreadable overdue cursor is logged; the status window reads one index range per job; RLS and an open-loan cursor index recorded in new migration `034` (Ethan approved). Fixed LOW: the job route sits before body parsing with a 30/min limit; emails and bearer tokens are redacted from job errors; skipped runs no longer crowd the history window; prune uses `SKIP LOCKED`; print notices compare in the writers' zone and include never-updated rows; panel accessibility and STI-only colors; runbook revokes from `PUBLIC` and checks `cron` access. Part B moved to `fix/remove-mock-routes`, Part C parked on `feat/sign-in-hardening`. |
| 2026-11-11 | Read-only check of the live database: migrations applied up to `029` from unmerged branches; `019_durable_job_runner` already applied but never run. Part A reuses that `019` file; Part C moves to `030` or later and first reads JohnBazty's password-recovery work. Added open decision S7 (product baseline branch), which blocks building. |
