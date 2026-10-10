-- Circulation cases for long-overdue investigation and damage intake (Postgres).

CREATE TABLE IF NOT EXISTS circulation_cases (
  case_id BIGSERIAL PRIMARY KEY,
  case_type TEXT NOT NULL CHECK (case_type IN ('Long Overdue', 'Damage')),
  transaction_id BIGINT NOT NULL REFERENCES borrow_transactions (transaction_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  physical_copy_id BIGINT NOT NULL REFERENCES physical_copies (physical_copy_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  borrower_user_id BIGINT NOT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Assigned', 'Under Investigation', 'Resolved', 'Dismissed', 'Reopened')),
  assigned_to_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  summary VARCHAR(500) NULL,
  opened_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP NULL,
  opened_by_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  resolved_by_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  policy_version_id BIGINT NULL REFERENCES borrowing_policy_versions (borrowing_policy_version_id) ON UPDATE CASCADE ON DELETE SET NULL,
  threshold_days_snapshot INTEGER NULL CHECK (threshold_days_snapshot IS NULL OR threshold_days_snapshot >= 1),
  threshold_reached_at TIMESTAMP NULL,
  baseline_condition_status VARCHAR(40) NULL,
  observed_condition_status VARCHAR(40) NULL,
  lost_book_report_id BIGINT NULL REFERENCES lost_book_reports (lost_book_report_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT uq_circulation_case_transaction_type UNIQUE (transaction_id, case_type)
);

CREATE INDEX IF NOT EXISTS idx_circulation_cases_worklist
  ON circulation_cases (case_type, status, opened_at);
CREATE INDEX IF NOT EXISTS idx_circulation_cases_borrower
  ON circulation_cases (borrower_user_id);
CREATE INDEX IF NOT EXISTS idx_circulation_cases_copy
  ON circulation_cases (physical_copy_id);
CREATE INDEX IF NOT EXISTS idx_circulation_cases_assignee
  ON circulation_cases (assigned_to_user_id);

CREATE TABLE IF NOT EXISTS circulation_case_events (
  event_id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES circulation_cases (case_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'Opened', 'Assigned', 'Contact Attempted', 'Note Added', 'Inspection Recorded',
    'Disposition Recorded', 'Linked Lost Report', 'Resolved', 'Dismissed', 'Reopened'
  )),
  actor_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NULL,
  reason VARCHAR(500) NULL,
  notes VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_circulation_case_events_case
  ON circulation_case_events (case_id, created_at);

-- Postgres admin_notifications.event_type and notifications.trigger_type are TEXT;
-- application validation enforces the new values.
