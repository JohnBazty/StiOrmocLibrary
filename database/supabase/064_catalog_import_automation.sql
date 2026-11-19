-- Durable, private automation for staged import drafts. Existing holdings are never changed here.
CREATE TABLE catalog_import_automation_runs (
  run_id UUID PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES catalog_import_batches(batch_id) ON DELETE RESTRICT,
  automation_kind VARCHAR(20) NOT NULL CHECK(automation_kind IN ('correction','cover')),
  request_key VARCHAR(80) NOT NULL UNIQUE,
  plan_digest CHAR(64) NOT NULL,
  options_json JSONB NOT NULL,
  rows_json JSONB NOT NULL CHECK(jsonb_typeof(rows_json)='array'),
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','completed','cancelled')),
  cursor_position INTEGER NOT NULL DEFAULT 0 CHECK(cursor_position>=0),
  total_rows INTEGER NOT NULL CHECK(total_rows BETWEEN 1 AND 5000),
  counters_json JSONB NOT NULL DEFAULT '{"checked":0,"changed":0,"unresolved":0,"conflicts":0}',
  error_text VARCHAR(500) NULL,
  started_by_account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  updated_by_account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT stock_import_cursor_bounds CHECK(cursor_position<=total_rows)
);
CREATE INDEX catalog_import_automation_batch ON catalog_import_automation_runs(batch_id,created_at DESC);
CREATE UNIQUE INDEX catalog_import_one_open_automation ON catalog_import_automation_runs(batch_id) WHERE status IN ('running','paused');
ALTER TABLE catalog_import_automation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON catalog_import_automation_runs FROM PUBLIC,anon,authenticated;
