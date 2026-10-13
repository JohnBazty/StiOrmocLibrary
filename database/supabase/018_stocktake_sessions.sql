-- Stocktake sessions, expected snapshots, scans, discrepancies, and resolution events (Postgres).

CREATE TABLE IF NOT EXISTS stocktake_sessions (
  stocktake_session_id BIGSERIAL PRIMARY KEY,
  session_name VARCHAR(200) NOT NULL,
  scope_kind VARCHAR(20) NOT NULL CHECK (scope_kind IN ('shelf', 'category', 'room', 'collection')),
  scope_id VARCHAR(100) NULL,
  scope_label VARCHAR(255) NOT NULL,
  asset_kind VARCHAR(20) NOT NULL CHECK (asset_kind IN ('book', 'research', 'both')),
  scope_snapshot TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'closed', 'reviewed', 'cancelled')),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_by_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  started_by_label VARCHAR(255) NOT NULL,
  closed_at TIMESTAMP NULL,
  closed_by_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  closed_by_label VARCHAR(255) NULL,
  reviewed_at TIMESTAMP NULL,
  reviewed_by_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  reviewed_by_label VARCHAR(255) NULL,
  cancelled_at TIMESTAMP NULL,
  cancelled_by_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  cancelled_by_label VARCHAR(255) NULL,
  cancel_reason VARCHAR(500) NULL,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_stocktake_sessions_status_started
  ON stocktake_sessions (status, started_at);
CREATE INDEX IF NOT EXISTS idx_stocktake_sessions_scope
  ON stocktake_sessions (scope_kind, scope_id);

CREATE TABLE IF NOT EXISTS stocktake_expected_items (
  stocktake_expected_item_id BIGSERIAL PRIMARY KEY,
  stocktake_session_id BIGINT NOT NULL REFERENCES stocktake_sessions (stocktake_session_id) ON UPDATE CASCADE ON DELETE CASCADE,
  asset_kind VARCHAR(20) NOT NULL CHECK (asset_kind IN ('book', 'research')),
  source_item_id BIGINT NOT NULL,
  barcode VARCHAR(100) NOT NULL,
  accession_number VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  category_id BIGINT NULL,
  category_name VARCHAR(255) NULL,
  home_shelf_id BIGINT NULL,
  home_shelf_label VARCHAR(100) NOT NULL,
  home_shelf_column SMALLINT NOT NULL DEFAULT 1,
  home_shelf_row SMALLINT NOT NULL DEFAULT 1,
  condition_snapshot VARCHAR(40) NOT NULL,
  availability_snapshot VARCHAR(40) NOT NULL,
  lifecycle_snapshot VARCHAR(40) NOT NULL,
  row_version_snapshot INTEGER NOT NULL,
  loan_state_snapshot VARCHAR(40) NOT NULL DEFAULT 'none',
  reservation_state_snapshot VARCHAR(40) NOT NULL DEFAULT 'none',
  close_lifecycle_snapshot VARCHAR(40) NULL,
  close_loan_state_snapshot VARCHAR(40) NULL,
  close_row_version_snapshot INTEGER NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_stocktake_expected_item UNIQUE (stocktake_session_id, asset_kind, source_item_id)
);

CREATE INDEX IF NOT EXISTS idx_stocktake_expected_barcode
  ON stocktake_expected_items (stocktake_session_id, barcode);

CREATE TABLE IF NOT EXISTS stocktake_scans (
  stocktake_scan_id BIGSERIAL PRIMARY KEY,
  stocktake_session_id BIGINT NOT NULL REFERENCES stocktake_sessions (stocktake_session_id) ON UPDATE CASCADE ON DELETE CASCADE,
  request_key VARCHAR(100) NOT NULL,
  entered_barcode VARCHAR(100) NOT NULL,
  resolved_asset_kind VARCHAR(20) NULL CHECK (resolved_asset_kind IS NULL OR resolved_asset_kind IN ('book', 'research')),
  resolved_source_item_id BIGINT NULL,
  observed_shelf_id BIGINT NULL,
  observed_shelf_label VARCHAR(100) NOT NULL,
  observed_shelf_column SMALLINT NULL,
  observed_shelf_row SMALLINT NULL,
  scan_source VARCHAR(20) NOT NULL CHECK (scan_source IN ('scanner', 'manual')),
  lookup_snapshot TEXT NOT NULL,
  scanned_by_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  scanned_by_label VARCHAR(255) NOT NULL,
  scanned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_stocktake_scan_request UNIQUE (stocktake_session_id, request_key)
);

CREATE INDEX IF NOT EXISTS idx_stocktake_scans_time
  ON stocktake_scans (stocktake_session_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_stocktake_scans_barcode
  ON stocktake_scans (stocktake_session_id, entered_barcode);
CREATE INDEX IF NOT EXISTS idx_stocktake_scans_resolved
  ON stocktake_scans (stocktake_session_id, resolved_asset_kind, resolved_source_item_id);

CREATE TABLE IF NOT EXISTS stocktake_discrepancies (
  stocktake_discrepancy_id BIGSERIAL PRIMARY KEY,
  stocktake_session_id BIGINT NOT NULL REFERENCES stocktake_sessions (stocktake_session_id) ON UPDATE CASCADE ON DELETE CASCADE,
  finding_key VARCHAR(191) NOT NULL,
  finding_code VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed', 'blocked')),
  stocktake_expected_item_id BIGINT NULL REFERENCES stocktake_expected_items (stocktake_expected_item_id) ON UPDATE CASCADE ON DELETE SET NULL,
  stocktake_scan_id BIGINT NULL REFERENCES stocktake_scans (stocktake_scan_id) ON UPDATE CASCADE ON DELETE SET NULL,
  evidence_snapshot TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NULL,
  CONSTRAINT uq_stocktake_discrepancy_key UNIQUE (stocktake_session_id, finding_key)
);

CREATE INDEX IF NOT EXISTS idx_stocktake_discrepancies_status
  ON stocktake_discrepancies (stocktake_session_id, status, finding_code);

CREATE TABLE IF NOT EXISTS stocktake_resolution_events (
  stocktake_resolution_event_id BIGSERIAL PRIMARY KEY,
  stocktake_discrepancy_id BIGINT NOT NULL REFERENCES stocktake_discrepancies (stocktake_discrepancy_id) ON UPDATE CASCADE ON DELETE CASCADE,
  previous_status VARCHAR(20) NOT NULL CHECK (previous_status IN ('open', 'resolved', 'dismissed', 'blocked')),
  next_status VARCHAR(20) NOT NULL CHECK (next_status IN ('open', 'resolved', 'dismissed', 'blocked')),
  action VARCHAR(80) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  before_snapshot TEXT NOT NULL,
  after_snapshot TEXT NOT NULL,
  inventory_audit_event_id BIGINT NULL,
  research_inventory_audit_event_id BIGINT NULL,
  floor_plan_event_id BIGINT NULL,
  acted_by_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  acted_by_label VARCHAR(255) NOT NULL,
  acted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stocktake_resolution_discrepancy_time
  ON stocktake_resolution_events (stocktake_discrepancy_id, acted_at);
