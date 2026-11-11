-- Revision Phase 1. Preserve the separately managed password_reset_otps/history tables.
-- The Express server accesses challenges using its private Postgres connection.
CREATE TABLE IF NOT EXISTS public.account_recovery_challenges (
  account_id BIGINT PRIMARY KEY REFERENCES public.accounts(account_id) ON DELETE CASCADE,
  public_id UUID NOT NULL UNIQUE,
  account_version INTEGER NOT NULL,
  code_hash CHAR(64),
  code_expires_at TIMESTAMPTZ NOT NULL,
  code_sent_at TIMESTAMPTZ NOT NULL,
  code_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (code_attempts BETWEEN 0 AND 3),
  locked_until TIMESTAMPTZ,
  reset_token_hash CHAR(64),
  reset_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.account_recovery_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_recovery_challenges FROM PUBLIC, anon, authenticated;
