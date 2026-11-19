-- References only. Reset tokens are regenerated privately and stored only as digests in existing challenges.
CREATE TABLE password_reset_link_deliveries (
  public_id UUID PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(account_id),
  account_version INTEGER NOT NULL,
  recipient_hash CHAR(64) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Sent','Failed','Skipped')),
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX password_reset_link_pending ON password_reset_link_deliveries(next_attempt_at,created_at) WHERE status='Pending';
ALTER TABLE password_reset_link_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON password_reset_link_deliveries FROM PUBLIC,anon,authenticated;
