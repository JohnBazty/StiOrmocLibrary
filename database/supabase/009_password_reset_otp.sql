-- Student forgot-password OTP challenges and recent password hashes for reuse checks.
CREATE TABLE IF NOT EXISTS password_reset_otps (
  otp_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts (account_id),
  otp_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_account
  ON password_reset_otps (account_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_active
  ON password_reset_otps (account_id, consumed_at, expires_at);

CREATE TABLE IF NOT EXISTS account_password_history (
  history_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts (account_id),
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_password_history_account
  ON account_password_history (account_id, created_at);
