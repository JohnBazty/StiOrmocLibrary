# Durable job runner (T1) implementation plan

## Why

The reservation-expiration, overdue/case, and notification checks currently run from one-minute `setInterval` timers in `apps/api/src/server.ts`. Vercel serves the production API through `api/index.mjs`, which does not start that long-lived server. After deployment or an idle period, the timers therefore cannot be relied on to run. T1 gives these existing checks a durable schedule, safe retries, and a visible failure record before reservation-status notifications are released.

- **Date created:** 2026-10-10
- **Date last updated:** 2026-10-10
- **Status:** `inprogress`
- **Roadmap item:** T1 in `docs/system-fixes-and-features-plan.md`
- **Decisions:** D1–D5 approved by Ethan on 2026-10-10

## Objective and scope

- Run reservation expiration, overdue/fine and long-overdue-case scanning, and scheduled notification generation every minute in production, including after idle periods.
- Reuse the current Node/Express business services and the active Supabase Postgres database. Keep local MySQL and local-development timers working.
- Protect service-to-service calls, prevent overlapping executions of the same job, make retries safe, record outcomes, and surface stale or failed jobs to Admin.
- Do not add a second business-rule implementation in SQL, a permanent server, a message broker, or a new application dependency. Attendance/semester jobs may use this runner in later work but are not part of T1.

## Decisions (approved)

Approved as written by Ethan on 2026-10-10.

| # | Topic | Recommended default for this release |
| --- | --- | --- |
| D1 | **Auth header** | Require header `X-Job-Runner-Secret: <token>` only. Reject JWT/session/CSRF as authorization for the internal job route. Compare with `crypto.timingSafeEqual` after length check. Env var name: `JOB_RUNNER_SECRET`. |
| D2 | **Lease duration** | Fixed **90 seconds** from database `NOW()` (greater than Vercel `maxDuration` 60s). Expired leases are reclaimable; only the current lease token may release/update success/failure fields. |
| D3 | **Stale / health** | Job is `stale` when `last_success_at` is null or older than **3 minutes**. Status derivation: `failed` if last outcome was failed and not yet succeeded after; else `stale` if past the window; else `healthy`. Suppress repeat Admin alerts until recovery or a new distinct error code. |
| D4 | **Admin surface** | Read-only **Scheduled jobs** section on the live Admin dashboard (`AdminDashboardPage`), plus `GET /api/v1/admin/jobs`. No public manual-run button in T1. |
| D5 | **Backlog fairness** | Overdue fine batch uses a stored cursor on `scheduled_job_state.progress_cursor` (`due_at` + `transaction_id`). After each batch, advance the cursor; when a full pass completes (fewer than `batchSize` rows, or wrap past oldest), reset cursor to null and start from the oldest again. Long-overdue case query keeps `ORDER BY due_at, transaction_id` with `NOT EXISTS` open case (already fair). Notification fan-out queries get `LIMIT` / time-window bounds (see Phase 2). |

## Chosen setup

```text
Supabase Cron (one schedule per job, every minute)
    -> pg_net HTTPS POST with Vault-held URL + X-Job-Runner-Secret
    -> Vercel POST /api/internal/jobs/:jobName
    -> Postgres lease claim + run record
    -> existing reservation / overdue / notification service
    -> recorded result + Admin status
```

Supabase Cron supports minute schedules and HTTP calls; keep the endpoint URL and dedicated token in Supabase Vault. The same token is configured as `JOB_RUNNER_SECRET` in the Vercel API environment. Do not put its value in migrations, `vercel.json`, logs, or responses. Limit access to Vault and `pg_net` request data to trusted database roles because queued HTTP headers may be readable to roles with `pg_net` access. Rotate the token if exposed.

Vercel Hobby cron cannot provide the required minute cadence. Running the jobs solely as Postgres procedures would duplicate the application's calendar, queue, and notification rules. An always-on worker would add a new hosting service. See [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Vault](https://supabase.com/docs/guides/database/vault), and [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Current implementation and assumptions

Verified 2026-10-10 against the tree:

| Area | Finding |
| --- | --- |
| Local timers | `apps/api/src/server.ts` starts reservation, circulation-overdue, and notification workers (`setInterval` ~60s). Workers swallow errors to `console.error` and use an in-memory `running` flag only. |
| Vercel entry | `api/index.mjs` calls `createApp()` only — no workers. `vercel.json` sets `api/index.mjs` `maxDuration` to 60; no cron. |
| App mount order | `apps/api/src/app.js` mounts JWT `/api/v1/*` after `/api/health`. Internal job routes must register **before** JWT/session-protected chains and must not use CSRF. |
| Reservation job | `expireReadyReservations` — locks up to 100 `ready_for_pickup` past deadline; status guard + `FOR UPDATE` for retry safety. |
| Overdue job | `escalateOverdueTransactions` — first batch `ORDER BY due_at ASC` LIMIT 100 (starves newer loans when backlog > 100); second batch opens long-overdue cases with `NOT EXISTS`. |
| Notification job | `generateNotifications` — several unbounded `INSERT … SELECT` paths (all reservation/print history; all active users × closures); announcement publish already LIMIT 100. Dedupe keys exist but full scans risk the 60s limit. |
| Env | No `JOB_RUNNER_SECRET` in `apps/api/src/config/env.js` yet. |
| Migrations | MySQL latest `047_circulation_cases` → next **`048`**. Hosted Postgres ledger includes `017_loan_renewals`, `017_circulation_cases`, `018_stocktake_sessions` → next new file **`019`**. Re-check before authoring. |
| Admin UI | Live dashboard is `apps/web/src/features/dashboard/AdminDashboardPage.tsx` (not the mock `AdminPages.tsx`). |
| Downstream | A7 reservation status notifications and T5 attendance auto-checkout depend on this runner being `built` in production. |

## How — ready-to-build specification

### Phase 0 — Docs and gates (before code)

1. ~~Ethan approves D1–D5~~ — done 2026-10-10.
2. Confirm hosted Supabase can enable `pg_cron` + `pg_net`, and that Vault secrets can be created by the project owner (at deploy/activation time).
3. Set this plan status to `inprogress` when the first migration or runner module lands.
4. Do not activate production Cron schedules as a side effect of applying the schema migration.

### Phase 1 — Schema (MySQL `048` / Supabase `019`)

**Files to add** (confirm numbers at authoring time)

- `database/migrations/YYYYMMDD_048_durable_job_runner.sql`
- `database/supabase/019_durable_job_runner.sql`
- Runbook SQL (not auto-applied): `database/supabase/ops/019_durable_job_runner_schedules.sql` (or `docs/runbooks/durable-job-runner.md` with copy-paste SQL) for Cron create/unschedule only

**Table `scheduled_job_state`** — one row per allowlisted job

| Column | Type / notes |
| --- | --- |
| `job_name` | PK, `VARCHAR(64)` — exactly `reservation-expiration`, `circulation-overdue`, `notifications` |
| `lease_token` | nullable `CHAR(36)` / UUID text |
| `lease_expires_at` | nullable timestamp (DB clock) |
| `last_started_at` | nullable timestamp |
| `last_success_at` | nullable timestamp |
| `last_failure_at` | nullable timestamp |
| `last_outcome` | nullable `succeeded` \| `failed` \| `skipped` |
| `last_error_code` | nullable short code (e.g. `SERVICE_ERROR`, max 64) |
| `last_error_message` | nullable sanitized text (max 500 chars; no stacks/secrets) |
| `last_result_json` | nullable JSON/text — bounded counts only |
| `progress_cursor` | nullable JSON/text — overdue cursor `{ "dueAt": "...", "transactionId": n }` |
| `updated_at` | timestamp |

Seed three rows in the migration (null leases, null success).

**Table `scheduled_job_runs`** — append-only history

| Column | Type / notes |
| --- | --- |
| `run_id` | PK identity |
| `job_name` | indexed; same allowlist |
| `started_at` / `finished_at` | timestamps |
| `outcome` | `succeeded` \| `failed` \| `skipped` |
| `result_json` | nullable bounded counts |
| `error_code` / `error_message` | nullable; same sanitization rules |
| `lease_token` | optional audit of which lease ran |

**Indexes:** `(job_name, started_at DESC)` on runs.

**Retention:** optional cleanup deletes runs older than 30 days; implement as a fourth allowlisted maintenance step later or a simple delete at the start of each job when count is high — T1 minimum: document and add a bounded delete of rows older than 30 days inside the runner once per successful job (or skip if none). Prefer a single `DELETE … WHERE started_at < NOW() - interval '30 days' LIMIT 500` after success.

**Lease claim SQL (Postgres)** — atomic:

```sql
UPDATE scheduled_job_state
   SET lease_token = $1,
       lease_expires_at = NOW() + INTERVAL '90 seconds',
       last_started_at = NOW(),
       updated_at = NOW()
 WHERE job_name = $2
   AND (lease_token IS NULL OR lease_expires_at < NOW())
 RETURNING *;
```

If zero rows updated → record/return `skipped` (lease held). MySQL equivalent uses the same predicate in a transaction with `SELECT … FOR UPDATE` then conditional update.

**Release / finish:** update state only where `job_name = ? AND lease_token = ?`; always insert a `scheduled_job_runs` row; clear `lease_token` / `lease_expires_at` on finish.

### Phase 2 — Runner module and backlog bounds

**New module:** `apps/api/src/modules/job-runner/`

| File | Role |
| --- | --- |
| `job-runner.types.ts` | Job names, outcomes, result shapes |
| `job-runner.repository.ts` | Claim / release / list state / list recent runs |
| `job-runner.service.ts` | Orchestration: claim → run → record → release in `finally` |
| `job-runner.controller.ts` / `job-runner.routes.ts` | Internal POST + Admin GET |
| `job-runner.auth.ts` | Secret header check (constant-time) |
| `*.test.ts` | Unit coverage per acceptance tests below |

**Allowlist**

| Job name | Existing function | Result counts to record |
| --- | --- | --- |
| `reservation-expiration` | `expireReadyReservations` | `expiredCount`, `releasedAccessions` length |
| `circulation-overdue` | `escalateOverdueTransactions` (extend signature for cursor) | `evaluatedCount`, `newlyOverdue`, `longOverdueCasesOpened`, cursor advanced |
| `notifications` | `generateNotifications` (bounded) | `inserted`, `publishedAnnouncements` |

**Orchestration rules**

1. Claim lease; if not claimed → HTTP 200 `{ outcome: 'skipped' }` and append skipped run (or skip run row if preferred — **prefer writing skipped runs** so Admin can see contention).
2. Insert run row as started (or insert only at finish — prefer insert at finish with full duration to avoid orphan started rows; store `started_at` in memory from claim time).
3. Call exactly one service; server clock for `now`.
4. On success: update state success fields, clear lease, write succeeded run + counts.
5. On throw: sanitize error, update failure fields, clear lease, write failed run, rethrow → HTTP 5xx.
6. Work budget: keep each invocation under ~45s; existing batch sizes of 100 are the per-tick ceiling.

**Overdue fairness (D5)**

- Extend `escalateOverdueTransactions` to accept optional cursor `{ dueAt, transactionId }`.
- Selection: `WHERE … AND (due_at > cursor.dueAt OR (due_at = cursor.dueAt AND transaction_id > cursor.transactionId)) ORDER BY due_at, transaction_id LIMIT n`, or when cursor null use current oldest-first query.
- After batch: if `rows.length < limit`, clear cursor; else set cursor to last row’s `(due_at, transaction_id)`.
- Persist cursor via job-runner after success (not inside the business transaction if that complicates rollback — either return cursor from service and let runner persist, or update state in the same release update).

**Notification bounds**

In `generateNotifications` / related SQL:

- Reservation status fan-out: only rows with `updated_at >= NOW() - INTERVAL '7 days'` (or `reserved_at` window) **or** statuses that still lack a matching notification — prefer `WHERE r.updated_at >= ?` with `now - 7 days` plus keep dedupe.
- Print status fan-out: same 7-day `updated_at` bound.
- Overdue notification insert: already filtered by `due_at <= now`; add `LIMIT 500` if dialect allows on INSERT SELECT, or restrict to loans updated/overdue in last N days.
- Closure fan-out: keep 7-day closed_date window; already bounded by date.
- Due-soon queries: already time-windowed; optional LIMIT 500.

Preserve `ON CONFLICT / INSERT IGNORE` dedupe so retries never duplicate.

**Env**

- Add `jobRunnerSecret` to `env.js` from `JOB_RUNNER_SECRET`.
- In production (`env.isProduction` or `VERCEL`): if secret missing/empty, fail startup / reject all job POSTs with 503 `JOB_RUNNER_MISCONFIGURED`. Local: secret optional; internal route returns 503 if unset so accidental exposure is useless.
- Never start `server.ts` workers when `process.env.VERCEL` is set (belt-and-suspenders even though `server.ts` is not the Vercel entry).

### Phase 3 — HTTP surfaces

**Internal (service-to-service)**

```http
POST /api/internal/jobs/:jobName
X-Job-Runner-Secret: <token>
Cache-Control: no-store
```

- Register in `createApp()` **immediately after** `/api/health`, before session-heavy user routes if practical; must run **without** JWT `authenticateJwt` and **without** CSRF.
- Allow only the three job names; unknown → 404.
- Reject GET/PUT/etc. → 405.
- Missing/invalid secret → 401 (no timing leak beyond constant-time compare).
- Response body only: `{ success, data: { jobName, runId?, outcome, counts?, errorCode? } }`.
- Success → 200; skipped → 200; failed business → 500/502 with failed run recorded.

**Admin (JWT Admin only)**

```http
GET /api/v1/admin/jobs
GET /api/v1/admin/jobs/:jobName/runs?limit=20
```

Returns per-job: `jobName`, `health` (`healthy`|`failed`|`stale`), `lastSuccessAt`, `lastFailureAt`, `lastOutcome`, `lastErrorCode`, `lastErrorMessage`, `lastResult`, `leaseHeld` (boolean from non-null unexpired lease).

**Web**

- Extend dashboard API types + `AdminDashboardPage` with a compact **Scheduled jobs** card/table (three rows, status text + last success time). STI blue/yellow/white only; pair status with text (not color alone).
- Alert: when any job is `failed` or `stale`, show a single dashboard banner; dedupe key style `job-runner:{jobName}:{errorCode|stale}` for any `admin_notifications` insert if used — prefer in-dashboard banner for T1 to avoid inbox spam unless an existing admin feed is trivial to hook.

**Schema readiness**

- Add `scheduled_job_state` and `scheduled_job_runs` required columns to `schema-readiness.ts`.

### Phase 4 — Supabase schedule runbook (manual activation)

After API deploy + secret configuration:

1. Enable extensions `pg_cron`, `pg_net` if needed.
2. Store in Vault: `job_runner_base_url` (e.g. `https://<prod>/api/internal/jobs`) and `job_runner_secret`.
3. Create three cron jobs (every minute), each `net.http_post` to `{base}/{jobName}` with header `X-Job-Runner-Secret`.
4. Document `cron.unschedule(...)` for each job name used.
5. Verify: Cron history shows SQL success; `scheduled_job_runs` shows business success; Admin health is `healthy` after idle and after redeploy.

Do **not** put the production URL/token into the additive schema migration that CI might apply blindly.

### Phase 5 — Test and release

1. **Unit/API:** missing/wrong secret; unknown job; allowed job; concurrent duplicate → skipped; expired lease reclaim; service throw → failed run + non-2xx; error message truncation; same-token-only release; cursor wrap for overdue.
2. **Business regression:** reservation expiry idempotency; overdue fine/case idempotency; notification dedupe; backlog > 100 drains across ticks; one failed job does not block the other two schedules.
3. **Hosted:** apply `019`, seed controlled due records, POST each job with secret, inspect runs + domain rows; unauthorized POST no-ops.
4. **Production:** deploy API + Admin UI; set Vercel + Vault secrets; activate three schedules; wait through idle; confirm last-success advances; force a test failure and confirm Admin visibility; clean disposable data.
5. **Rollback:** unschedule Cron first; revert app deploy if needed; keep additive tables/history.

### Phase 6 — Docs closeout

Update when marking `built`:

- `docs/schema-context.md`
- `.cursor/agent-protocol.md` migration tracker (MySQL `048`, Supabase `019` applied)
- `docs/system-fixes-and-features-plan.md` T1 done-when
- This plan status → `built` + change log

## Acceptance criteria

- Each of the three jobs completes after the Vercel app has been idle and after a new deployment; Admin sees last success, counts, and failure/stale status.
- Unauthorized HTTP calls cannot start a job. Overlapping calls and retries cannot produce duplicate reservation transitions, long-overdue cases, fines, or notifications.
- A backlog greater than one batch drains over later runs; no eligible old loan is permanently starved by always re-processing the same oldest 100.
- A failed business function is recorded as failed and returned as an HTTP error; the next run can recover after the lease expires. Failure/staleness is visible to Admin without leaking secrets or patron data.
- Production schedule definitions, token rotation, inspection commands, and unschedule steps are documented. T1 is marked `built` only after the hosted schedule and end-to-end checks pass.

## Implementation tracking

- [x] Inspect existing workers, Vercel entry point, migration tracker, and hosting capabilities.
- [x] Draft the Supabase Cron + protected API implementation plan.
- [x] Expand into ready-to-build specification with D1–D5.
- [x] Ethan approves D1–D5 (2026-10-10). Hosted Cron/Vault permissions confirmed at activation.
- [x] Add schema (`048` / `019`), runner module, protected routes, Admin status.
- [x] Bound overdue cursor + notification queries; add unit tests.
- [x] Apply hosted `019`; enable `pg_cron` / `pg_net`; store Vault `job_runner_base_url` + `job_runner_secret`.
- [ ] Set `JOB_RUNNER_SECRET` on Vercel team `ssl19` production, deploy PR job-runner code, smoke `POST /api/internal/jobs/*`.
- [ ] Activate three Cron schedules; verify `last_success_at` after idle/deploy; mark plan `built`.

## Change log

| Date | Change |
| --- | --- |
| 2026-10-10 | Created the `planned` T1 implementation plan for Supabase Cron invoking protected existing API jobs. |
| 2026-10-10 | Expanded to ready-to-build: verified tree change points, D1–D5 defaults, concrete schema/API/module phases, overdue cursor fairness, notification bounds, Admin dashboard surface, and ops activation gate. |
| 2026-10-10 | Ethan approved D1–D5 as written. Plan remains `planned` until build starts. |
| 2026-10-10 | Build started: status `inprogress`. Added MySQL `048` / Supabase `019`, job-runner module, internal + Admin routes, overdue cursor, notification bounds, Admin dashboard panel, runbook. |
| 2026-10-10 | Hosted activation partial: `019` applied, extensions on, Vault secrets created. Blocked on Vercel `ssl19` access (set secret + deploy). Cron intentionally not scheduled until production job routes exist. |
