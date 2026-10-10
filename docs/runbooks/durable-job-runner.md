# Durable job runner — production schedule runbook

Activate only after the API with `POST /api/internal/jobs/:jobName` is deployed and `JOB_RUNNER_SECRET` is set in Vercel. Do not run these steps as a side effect of applying `019_durable_job_runner.sql`.

## Prerequisites

1. Extensions: `pg_cron`, `pg_net` enabled on the hosted Supabase project.
2. Vault secrets (names are examples):
   - `job_runner_base_url` — e.g. `https://<your-vercel-host>/api/internal/jobs`
   - `job_runner_secret` — same value as Vercel `JOB_RUNNER_SECRET`
3. Manual smoke: `POST` each job with the secret header and confirm `scheduled_job_runs` rows.

## Create schedules (every minute)

Replace Vault secret names if yours differ. Run in the Supabase SQL editor as a privileged role.

```sql
-- reservation-expiration
SELECT cron.schedule(
  'job-reservation-expiration',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'job_runner_base_url') || '/reservation-expiration',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Job-Runner-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'job_runner_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- circulation-overdue
SELECT cron.schedule(
  'job-circulation-overdue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'job_runner_base_url') || '/circulation-overdue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Job-Runner-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'job_runner_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- notifications
SELECT cron.schedule(
  'job-notifications',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'job_runner_base_url') || '/notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Job-Runner-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'job_runner_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## Verify

1. Supabase Cron history shows the SQL jobs ran.
2. `SELECT * FROM scheduled_job_state;` — `last_success_at` advances after idle and after deploy.
3. Admin dashboard **Scheduled jobs** shows healthy.
4. Confirm HTTP responses (application tables), not only Cron queue rows.

## Unschedule (rollback first step)

```sql
SELECT cron.unschedule('job-reservation-expiration');
SELECT cron.unschedule('job-circulation-overdue');
SELECT cron.unschedule('job-notifications');
```

Then redeploy prior API code if needed. Keep `scheduled_job_*` tables for audit.

## Token rotation

1. Generate a new secret (≥32 characters).
2. Update Vercel `JOB_RUNNER_SECRET` and Vault `job_runner_secret`.
3. Confirm the next minute’s runs succeed; revoke the old value from both places.
