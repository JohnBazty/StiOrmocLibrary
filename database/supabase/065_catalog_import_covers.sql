-- Cover proposals belong to staged import entries; canonical titles change only at final import.
CREATE TABLE catalog_import_covers (
  import_row_id BIGINT PRIMARY KEY REFERENCES catalog_import_rows(import_row_id) ON DELETE RESTRICT,
  run_id UUID NULL REFERENCES catalog_import_automation_runs(run_id) ON DELETE RESTRICT,
  source_key CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK(status IN ('matched','not_found','needs_review','removed')),
  cover_path TEXT NULL,
  matched_isbn VARCHAR(13) NULL,
  evidence_json JSONB NOT NULL DEFAULT '{}',
  accepted_at TIMESTAMPTZ NULL,
  accepted_by_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  updated_by_account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(status<>'matched' OR (cover_path IS NOT NULL AND matched_isbn IS NOT NULL))
);
ALTER TABLE catalog_import_covers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON catalog_import_covers FROM PUBLIC,anon,authenticated;
