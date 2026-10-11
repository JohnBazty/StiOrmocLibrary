-- Durable scheduled job leases and run history (Postgres).

CREATE TABLE IF NOT EXISTS scheduled_job_state (
  job_name VARCHAR(64) PRIMARY KEY,
  lease_token CHAR(36) NULL,
  lease_expires_at TIMESTAMP NULL,
  last_started_at TIMESTAMP NULL,
  last_success_at TIMESTAMP NULL,
  last_failure_at TIMESTAMP NULL,
  last_outcome TEXT NULL CHECK (last_outcome IS NULL OR last_outcome IN ('succeeded', 'failed', 'skipped')),
  last_error_code VARCHAR(64) NULL,
  last_error_message VARCHAR(500) NULL,
  last_result_json TEXT NULL,
  progress_cursor TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  run_id BIGSERIAL PRIMARY KEY,
  job_name VARCHAR(64) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'skipped')),
  result_json TEXT NULL,
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(500) NULL,
  lease_token CHAR(36) NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_started
  ON scheduled_job_runs (job_name, started_at DESC);

INSERT INTO scheduled_job_state (job_name)
VALUES
  ('reservation-expiration'),
  ('circulation-overdue'),
  ('notifications')
ON CONFLICT (job_name) DO NOTHING;
