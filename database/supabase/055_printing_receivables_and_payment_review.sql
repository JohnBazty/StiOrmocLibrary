-- Phase 2 draft, unapplied. 054 is reserved separately. Never replay historical gateway drafts.
-- Preserve original charges, money and receipts. Multiple actual cash receipts may settle one print bill.
ALTER TABLE print_cash_payments DROP CONSTRAINT IF EXISTS uq_print_cash_request;
ALTER TABLE print_payment_receipts DROP CONSTRAINT IF EXISTS uq_print_receipt_request;
ALTER TABLE print_cash_payments ADD COLUMN IF NOT EXISTS request_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS print_cash_request_retry_key ON print_cash_payments(request_id,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS print_cash_request_history ON print_cash_payments(request_id,received_at);
ALTER TABLE print_payment_receipts ADD COLUMN IF NOT EXISTS balance_before NUMERIC(10,2);
ALTER TABLE print_payment_receipts ADD COLUMN IF NOT EXISTS balance_after NUMERIC(10,2);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='print_payment_receipts'::regclass AND conname='print_receipt_balance_snapshot') THEN
    ALTER TABLE print_payment_receipts ADD CONSTRAINT print_receipt_balance_snapshot CHECK(
      (balance_before IS NULL AND balance_after IS NULL) OR
      (balance_before IS NOT NULL AND balance_after IS NOT NULL AND balance_after >= 0 AND balance_before >= amount_received AND balance_after=balance_before-amount_received));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS print_receipt_request_history ON print_payment_receipts(request_id,receipt_status,print_receipt_id);

CREATE TABLE IF NOT EXISTS print_deferred_approvals (
  request_id BIGINT PRIMARY KEY REFERENCES print_requests(request_id),
  approved_by_user_id BIGINT NOT NULL REFERENCES users(user_id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
  assessed_amount NUMERIC(10,2) NOT NULL CHECK(assessed_amount >= 0),
  pricing_snapshot JSONB,
  acknowledged_by_account_id BIGINT REFERENCES accounts(account_id),
  acknowledged_at TIMESTAMPTZ,
  agreed_payment_date DATE,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id BIGINT REFERENCES users(user_id),
  revocation_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  request_key UUID NOT NULL UNIQUE,
  CHECK((acknowledged_by_account_id IS NULL) = (acknowledged_at IS NULL)),
  CHECK((revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL AND revocation_reason IS NOT NULL AND length(trim(revocation_reason)) BETWEEN 3 AND 1000))
);
CREATE TABLE IF NOT EXISTS print_deferred_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
  request_id BIGINT NOT NULL REFERENCES print_requests(request_id),
  event_type TEXT NOT NULL CHECK(event_type IN ('Approved','Acknowledged','Revoked')),
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS print_deferred_event_history ON print_deferred_events(request_id,event_id);

CREATE TABLE IF NOT EXISTS gcash_payment_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version > 0),
  updated_by_user_id BIGINT REFERENCES users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO gcash_payment_settings(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS gcash_payment_setting_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enabled BOOLEAN NOT NULL,
  version BIGINT NOT NULL UNIQUE CHECK(version > 0),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
  actor_user_id BIGINT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- This is private evidence attached to an owned Xendit attempt, never settlement authority.
-- payment_id intentionally has no FK: current hosted provider attempts live in the private JSON ledger.
CREATE TABLE IF NOT EXISTS print_payment_proofs (
  proof_id UUID PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES print_requests(request_id),
  user_id BIGINT NOT NULL REFERENCES users(user_id),
  payment_id UUID NOT NULL,
  external_reference VARCHAR(80) NOT NULL CHECK(length(trim(external_reference)) > 0),
  declared_amount NUMERIC(10,2) NOT NULL CHECK(declared_amount > 0),
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg')),
  byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 10485760),
  sha256 CHAR(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  review_status TEXT NOT NULL DEFAULT 'Pending' CHECK(review_status IN ('Pending','Verified','Rejected')),
  reviewed_by_user_id BIGINT REFERENCES users(user_id),
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  request_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,request_key),
  CHECK((review_status='Pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
    OR (review_status IN ('Verified','Rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK(review_status <> 'Rejected' OR (review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 3 AND 1000))
);
CREATE UNIQUE INDEX IF NOT EXISTS print_proof_one_active_attempt ON print_payment_proofs(payment_id) WHERE review_status <> 'Rejected';
CREATE UNIQUE INDEX IF NOT EXISTS print_proof_verified_reference ON print_payment_proofs(user_id,external_reference) WHERE review_status='Verified';
CREATE INDEX IF NOT EXISTS print_proof_request_history ON print_payment_proofs(request_id,created_at DESC);
CREATE TABLE IF NOT EXISTS print_proof_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proof_id UUID NOT NULL REFERENCES print_payment_proofs(proof_id),
  actor_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
  event_type TEXT NOT NULL CHECK(event_type IN ('Uploaded','Verified','Rejected')),
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS print_proof_event_history ON print_proof_events(proof_id,event_id);

-- Only genuinely new non-print charges use this domain. Never copy fines or print debts here.
CREATE TABLE IF NOT EXISTS library_service_charges (
  charge_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 3 AND 1000),
  amount_assessed NUMERIC(10,2) NOT NULL CHECK(amount_assessed > 0),
  created_by_user_id BIGINT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  charge_status TEXT NOT NULL DEFAULT 'Active' CHECK(charge_status IN ('Active','Cancelled')),
  cancelled_by_user_id BIGINT REFERENCES users(user_id),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  request_key UUID NOT NULL UNIQUE,
  CHECK((charge_status='Active' AND cancelled_by_user_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
    OR (charge_status='Cancelled' AND cancelled_by_user_id IS NOT NULL AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND length(trim(cancellation_reason)) BETWEEN 3 AND 1000))
);
CREATE INDEX IF NOT EXISTS library_service_charge_owner ON library_service_charges(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS library_service_cash_payments (
  service_payment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  charge_id BIGINT NOT NULL REFERENCES library_service_charges(charge_id),
  amount_paid NUMERIC(10,2) NOT NULL CHECK(amount_paid > 0),
  request_key UUID NOT NULL,
  received_by_user_id BIGINT NOT NULL REFERENCES users(user_id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  receipt_number VARCHAR(32) NOT NULL UNIQUE,
  verification_code VARCHAR(16) NOT NULL UNIQUE,
  student_name_snapshot VARCHAR(150) NOT NULL,
  school_id_snapshot VARCHAR(30) NOT NULL,
  description_snapshot TEXT NOT NULL,
  received_by_name_snapshot VARCHAR(150) NOT NULL,
  balance_before NUMERIC(10,2) NOT NULL CHECK(balance_before >= amount_paid),
  balance_after NUMERIC(10,2) NOT NULL CHECK(balance_after >= 0 AND balance_after=balance_before-amount_paid),
  receipt_status TEXT NOT NULL DEFAULT 'Issued' CHECK(receipt_status IN ('Issued','Reversed')),
  reversed_by_user_id BIGINT REFERENCES users(user_id),
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  UNIQUE(charge_id,request_key),
  CHECK((receipt_status='Issued' AND reversed_by_user_id IS NULL AND reversed_at IS NULL AND reversal_reason IS NULL)
    OR (receipt_status='Reversed' AND reversed_by_user_id IS NOT NULL AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL AND length(trim(reversal_reason)) BETWEEN 3 AND 1000))
);
CREATE INDEX IF NOT EXISTS library_service_payment_charge ON library_service_cash_payments(charge_id,received_at DESC);

ALTER TABLE print_deferred_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_deferred_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gcash_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gcash_payment_setting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_proof_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_service_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_service_cash_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON print_deferred_approvals,print_deferred_events,gcash_payment_settings,gcash_payment_setting_events,
  print_payment_proofs,print_proof_events,library_service_charges,library_service_cash_payments FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE print_deferred_events_event_id_seq,gcash_payment_setting_events_event_id_seq,
  print_proof_events_event_id_seq,library_service_charges_charge_id_seq,library_service_cash_payments_service_payment_id_seq FROM PUBLIC,anon,authenticated;
