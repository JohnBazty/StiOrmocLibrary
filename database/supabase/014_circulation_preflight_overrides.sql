-- Circulation preflight warning override audit (append-only).
-- Does not alter borrow_transactions.

CREATE TABLE IF NOT EXISTS circulation_override_events (
  override_event_id BIGSERIAL PRIMARY KEY,
  borrow_transaction_id BIGINT NOT NULL REFERENCES borrow_transactions (transaction_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  borrower_user_id BIGINT NOT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  physical_copy_id BIGINT NOT NULL REFERENCES physical_copies (physical_copy_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  approved_by_user_id BIGINT NOT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  warning_codes JSONB NOT NULL,
  override_reason VARCHAR(500) NOT NULL,
  preflight_decision_id VARCHAR(64) NOT NULL,
  approved_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_circ_override_transaction ON circulation_override_events (borrow_transaction_id);
CREATE INDEX IF NOT EXISTS idx_circ_override_borrower ON circulation_override_events (borrower_user_id, approved_at);
CREATE INDEX IF NOT EXISTS idx_circ_override_staff ON circulation_override_events (approved_by_user_id, approved_at);
CREATE INDEX IF NOT EXISTS idx_circ_override_approved_at ON circulation_override_events (approved_at);
