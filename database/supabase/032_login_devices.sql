ALTER TABLE library_login_sessions
  ADD COLUMN IF NOT EXISTS device_token_hash text,
  ADD COLUMN IF NOT EXISTS remembered_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS library_login_sessions_device_token_idx
  ON library_login_sessions (device_token_hash) WHERE device_token_hash IS NOT NULL;

ALTER TABLE login_otp_challenges ADD COLUMN IF NOT EXISTS remember_device boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS login_device_switches (
  token_hash text PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES accounts (account_id) ON DELETE CASCADE,
  auth_version integer NOT NULL,
  replaced_session_id uuid NOT NULL REFERENCES library_login_sessions (session_id) ON DELETE CASCADE,
  remember_device boolean NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS login_device_switches_account_idx ON login_device_switches (account_id);
ALTER TABLE login_device_switches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_device_switches FROM PUBLIC, anon, authenticated;
