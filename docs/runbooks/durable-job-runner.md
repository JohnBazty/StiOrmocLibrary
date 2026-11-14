# Runbook: turn on the durable job runner

Plan: `docs/safety-sprint-plan.md` Part A (decisions D1 to D5, A1, A2). The code runs nothing in production until these steps are done. **Each step needs Ethan's go-ahead, one at a time.** `019_durable_job_runner.sql` is already applied; `034_job_runner_hardening.sql` is step 0b.

Never paste the secret into chat, a commit, an issue, a log or this file.

## 0. Before you start

- The Part A PR is merged and the production deployment finished.
- `https://<production-host>/api/health` answers `200` with `"status":"healthy"`. A `503 DATABASE_MIGRATION_REQUIRED` means the deployed code expects tables the database lacks; stop.
- The API normalizes its process time zone to `Asia/Manila` in `apps/api/src/config/env.js`. Vercel rejects `TZ` as a reserved project variable, so do not add it through Vercel settings. The runner uses absolute instants for leases; service calendar reads use Manila time. Verify a fresh production deployment includes this configuration before activating Cron.

## 0b. Apply migration 034 (go-ahead 0b) — done 2026-11-11

Applied by Ethan's go-ahead; index `idx_borrow_open_due_cursor` and RLS on both job tables verified, `anon` and `authenticated` cannot read them.

`034_job_runner_hardening.sql` records row-level security on the two job tables (already on live) and adds a partial index for the overdue cursor. It is safe to run twice. The index build briefly blocks writes to `borrow_transactions`; run it outside library hours.

```bash
npm run db:supabase -w @sti-library/api -- 034_job_runner_hardening.sql
```

## 1. Make the secret (go-ahead 1)

On your own computer:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

This prints 43 characters. Keep it in your password manager.

## 2. Set it in Vercel (go-ahead 2)

Vercel → project → Settings → Environment Variables → add `JOB_RUNNER_SECRET` for **Production** with the value from step 1 → redeploy production.

Check that the route refuses calls without the secret (expected `401` and `JOB_RUNNER_UNAUTHORIZED`):

```bash
curl -s -i -X POST https://<production-host>/api/internal/jobs/notifications
```

A secret shorter than 32 characters stops the API from starting in production. If the variable is missing, the route refuses every call.

## 3. Store the URL and secret in Supabase Vault (go-ahead 3) — done 2026-11-13

Supabase → STI SMART LIBRARY → Project Settings → Vault (or Integrations → Vault) → add two secrets:

| Name | Value |
| --- | --- |
| `smartlib_job_runner_url` | `https://<production-host>/api/internal/jobs/all` |
| `smartlib_job_runner_secret` | the value from step 1 |

`pg_cron`, `pg_net` and Vault are already installed (checked 2026-11-11).

## 4. Confirm pg_net's request tables are not reachable (read only)

`pg_net` keeps each queued call, **including the `X-Job-Runner-Secret` header**, in `net.http_request_queue` until it is sent (then deletes it), and the reply in `net._http_response` (reply headers only). `anon` and `authenticated` can `SELECT` both tables.

**A revoke does not work here.** `supabase_admin` owns the `net` schema and both tables and granted them to `PUBLIC`; `postgres` (the SQL Editor and the API's connection) is not a member of `supabase_admin`, so `revoke ... from public, anon, authenticated` only prints "no privileges could be revoked" notices and changes nothing (tried 2026-11-11). Removing the grants needs Supabase support.

What protects the secret is that `anon` and `authenticated` cannot log in, and the Data API does not expose the `net` schema. Check the second part with the publishable key (expected `PGRST106` "Invalid schema: net"):

```bash
curl -s -H "apikey: <publishable key>" -H "Accept-Profile: net" "https://<project-ref>.supabase.co/rest/v1/_http_response?select=id&limit=1"
```

Passed on 2026-11-11 (exposed schemas: `public`, `graphql_public`).

`cron.job` and `cron.job_run_details` also hold command text and replies. On 2026-11-11 `anon` and `authenticated` had no `USAGE` on the `cron` schema, so they cannot reach them. Confirm it is still so (both `false`):

```sql
select rolname, has_schema_privilege(oid, 'cron', 'USAGE') as cron_usage from pg_roles where rolname in ('anon', 'authenticated');
```

## 5. Create the Cron schedule (go-ahead 5) — done 2026-11-13

Supabase → SQL Editor, run:

```sql
select cron.schedule(
  'smartlib-jobs-all',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'smartlib_job_runner_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Job-Runner-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'smartlib_job_runner_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
```

One schedule runs every job each minute (A1). Each job still takes its own 90-second lease, so a slow minute is skipped, not doubled. `timeout_milliseconds` is raised from pg_net's 5-second default because a full run can take several seconds.

## 6. Check it works (no go-ahead needed: read only)

Within two minutes:

- Admin dashboard → **Scheduled jobs**: every job says **Healthy** with a recent "Last success".
- SQL Editor:

```sql
select job_name, last_outcome, last_success_at, last_error_code, last_error_message
  from scheduled_job_state order by job_name;

select status, return_message, start_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'smartlib-jobs-all')
 order by start_time desc limit 5;

select status_code, timed_out, error_msg, created
  from net._http_response order by created desc limit 5;
```

`status_code` should be `200`. `401` means the Vault secret and the Vercel variable differ. A job that says **Failed** shows its cleaned error on the dashboard; the Admin also gets one `scheduled_job_failed` notice per new failure.

## 7. Roll back (go-ahead each time)

```sql
select cron.unschedule('smartlib-jobs-all');
```

The jobs stop; nothing else changes. Removing `JOB_RUNNER_SECRET` from Vercel also makes every call fail with `401`.

## Rotate the secret

Treat it as one change, in this order: update the Vault secret `smartlib_job_runner_secret` in place, set the same value as `JOB_RUNNER_SECRET` in Vercel, then redeploy production. Calls answer `401` between the Vault update and the end of the redeploy; each job catches up on its next run. Check step 6 afterwards. `timeout_milliseconds := 55000` assumes Vercel's 60-second limit; change both together.

## Local development

`npm run dev` no longer runs jobs (A2). To run them on a laptop, set `JOB_RUNNER_LOCAL_TIMER=on` in `apps/api/.env`. If that `.env` points at the live database, the laptop's code then runs production jobs; the lease only stops it from running a job at the same moment as Cron.

## What is left behind

- `library_job_runs` (from `013`) is no longer read or written. Dropping it needs its own migration and Ethan's go-ahead.
- Never add `net` to the Data API's exposed schemas: `anon` and `authenticated` can still read its tables, so that one setting would expose the secret (step 4).

## Latest activation checkpoint — 2026-11-13

Owner approved step 3 only. The two named Vault settings now exist, are encrypted, match the reviewed live runner, and were verified after commit. No secret value appears in this record. Browser roles cannot log in directly and cannot use cron or vault. Fresh zero-row Data API probes using the existing backend key reject net/vault/cron with PGRST106; this verifies the global exposed-schema list, with role checks recorded separately.

Step 5 remains pending: smartlib-jobs-all does not exist and no job was started by this preparation. Obtain separate approval before enabling the minute schedule; then verify all nine deployed job handlers, including scheduled enrollment/attendance actions and queued emails, through read-only status/results. See docs/plans/2026-11-13-circulation-audit-remediation.md for the deployment and preparation evidence.

## Active checkpoint — 2026-11-13

Owner approved step 5. smartlib-jobs-all is active as job ID 1, every minute. Two automatic cycles at 13:40 and 13:41 Asia/Manila returned HTTP 200, and all nine handlers recorded success with no error codes. Health/schema readiness stayed healthy. This supersedes the pending checkpoint above. No manual jobs/all call was used. Keep one scheduler; any unscheduling, secret rotation or live migration still needs its own approval.
