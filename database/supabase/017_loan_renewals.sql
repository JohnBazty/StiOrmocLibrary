-- Loan renewals: track initial due date, renewal count, and immutable renewal requests.

ALTER TABLE borrow_transactions
  ADD COLUMN IF NOT EXISTS initial_due_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS renewal_count INTEGER NOT NULL DEFAULT 0 CHECK (renewal_count >= 0);

UPDATE borrow_transactions
   SET initial_due_at = due_at
 WHERE due_at IS NOT NULL
   AND initial_due_at IS NULL;

CREATE TABLE IF NOT EXISTS loan_renewal_requests (
  renewal_request_id BIGSERIAL PRIMARY KEY,
  request_key VARCHAR(64) NOT NULL,
  transaction_id BIGINT NOT NULL REFERENCES borrow_transactions (transaction_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  renewal_number INTEGER NOT NULL CHECK (renewal_number >= 1),
  requester_account_id BIGINT NULL,
  requester_user_id BIGINT NOT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  decision_source VARCHAR(20) NOT NULL CHECK (decision_source IN ('System', 'Staff')),
  deciding_staff_account_id BIGINT NULL,
  deciding_staff_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  staff_note VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('Approved', 'Rejected')),
  decision_code VARCHAR(80) NOT NULL,
  decision_summary VARCHAR(500) NOT NULL,
  blocker_codes TEXT NULL,
  previous_due_at TIMESTAMP NOT NULL,
  new_due_at TIMESTAMP NULL,
  borrowing_policy_version_id BIGINT NULL REFERENCES borrowing_policy_versions (borrowing_policy_version_id) ON UPDATE CASCADE ON DELETE SET NULL,
  requested_at TIMESTAMP NOT NULL,
  decided_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_loan_renewal_request_key UNIQUE (request_key)
);

CREATE INDEX IF NOT EXISTS idx_loan_renewal_transaction
  ON loan_renewal_requests (transaction_id, created_at);
CREATE INDEX IF NOT EXISTS idx_loan_renewal_requester
  ON loan_renewal_requests (requester_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_loan_renewal_status
  ON loan_renewal_requests (status, created_at);
