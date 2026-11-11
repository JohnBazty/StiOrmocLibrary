-- Phase 2 T1: durable run ledger. Schedule activation is a separate operational step.
CREATE TABLE IF NOT EXISTS library_job_runs (
  job_name VARCHAR(80) PRIMARY KEY,
  last_started_at TIMESTAMP NULL,
  lease_until TIMESTAMP NULL,
  run_token VARCHAR(36) NULL,
  last_success_at TIMESTAMP NULL,
  last_error_at TIMESTAMP NULL,
  last_error TEXT NULL,
  run_count BIGINT NOT NULL DEFAULT 0,
  failure_count BIGINT NOT NULL DEFAULT 0,
  last_duration_ms INTEGER NULL
);
INSERT INTO library_job_runs(job_name) VALUES ('operational-minute') ON CONFLICT (job_name) DO NOTHING;
