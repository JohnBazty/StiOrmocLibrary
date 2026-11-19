-- Mobile sign-in renewal: rotating refresh tokens, one family per library_login_sessions row. Additive and safe to run twice.
ALTER TABLE library_login_sessions
  ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT 'web' CHECK (client IN ('web', 'mobile')),
  ADD COLUMN IF NOT EXISTS trusted_since timestamptz;

-- Only HMAC hashes are stored (deviceTokenHash('refresh', token)), never the raw token.
-- expires_at is the family deadline, copied unchanged to every rotation.
CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  token_hash text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES library_login_sessions (session_id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES accounts (account_id) ON DELETE CASCADE,
  auth_version integer NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  replaced_by text
);

CREATE INDEX IF NOT EXISTS mobile_refresh_tokens_session_idx ON mobile_refresh_tokens (session_id);
ALTER TABLE mobile_refresh_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mobile_refresh_tokens FROM PUBLIC, anon, authenticated;
