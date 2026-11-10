# Runbook: turn on the durable job runner

Plan: `docs/safety-sprint-plan.md` Part A (decisions D1 to D5, A1, A2). The code runs nothing in production until these steps are done. **Each step needs Ethan's go-ahead, one at a time.** No migration is needed: `019_durable_job_runner.sql` is already applied.

Never paste the secret into chat, a commit, an issue, a log or this file.

## 0. Before you start

- The Part A PR is merged and the production deployment finished.
- `https://<production-host>/api/health` answers `200` with `"status":"healthy"`. A `503 DATABASE_MIGRATION_REQUIRED` means the deployed code expects tables the database lacks; stop.
- Ask John whether the Vercel project sets `TZ=Asia/Manila`. The runner does not depend on it, but some services read stored Manila times through the process zone. Write the answer in the plan's change log.

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

## 3. Store the URL and secret in Supabase Vault (go-ahead 3)

Supabase → STI SMART LIBRARY → Project Settings → Vault (or Integrations → Vault) → add two secrets:

| Name | Value |
| --- | --- |
| `smartlib_job_runner_url` | `https://<production-host>/api/internal/jobs/all` |
| `smartlib_job_runner_secret` | the value from step 1 |

`pg_cron`, `pg_net` and Vault are already installed (checked 2026-11-11).

## 4. Close pg_net's request tables to the API roles (go-ahead 4)

`pg_net` keeps each queued call, **including the `X-Job-Runner-Secret` header**, in `net.http_request_queue` until it is sent, and the reply in `net._http_response`. A read-only check on 2026-11-11 found that `anon` and `authenticated` can `SELECT` both tables. The `net` schema is not in the Data API's exposed schemas by default, so this is not reachable from the browser today, but one setting change would expose the secret. Run in the SQL Editor:

```sql
revoke select, insert, update, delete on net.http_request_queue, net._http_response from anon, authenticated;
```

Check (both columns should be `false` for both roles):

```sql
select r.rolname, has_table_privilege(r.oid, 'net.http_request_queue', 'SELECT') as queue, has_table_privilege(r.oid, 'net._http_response', 'SELECT') as replies
  from pg_roles r where r.rolname in ('anon', 'authenticated');
```

This keeps the `net` functions working; it only removes table access the app never uses.

## 5. Create the Cron schedule (go-ahead 5)

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

Do steps 1 to 3 again with a new value (update the Vault secret in place), then redeploy. Calls fail with `401` for the minute between the two changes; the next minute catches up.

## Local development

`npm run dev` no longer runs jobs (A2). To run them on a laptop, set `JOB_RUNNER_LOCAL_TIMER=on` in `apps/api/.env`. If that `.env` points at the live database, the laptop's code then runs production jobs; the lease only stops it from running a job at the same moment as Cron.

## What is left behind

- `library_job_runs` (from `013`) is no longer read or written. Dropping it needs its own migration and Ethan's go-ahead.
- Never add `net` to the Data API's exposed schemas, and never grant its tables back to `anon` or `authenticated` (step 4).
