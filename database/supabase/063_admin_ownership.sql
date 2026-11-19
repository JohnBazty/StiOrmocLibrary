CREATE TABLE library_ownership (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  owner_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version>0),
  failed_reauth SMALLINT NOT NULL DEFAULT 0 CHECK (failed_reauth BETWEEN 0 AND 5),
  reauth_locked_until TIMESTAMPTZ,
  last_invited_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Establish the existing consolidated owner; do not create or change any account.
INSERT INTO library_ownership(owner_account_id)
SELECT a.account_id FROM accounts a JOIN users u ON u.user_id=a.user_id
WHERE a.role='Librarian' AND a.account_status='Active' AND u.user_role='Librarian' AND u.account_status='Active'
AND (SELECT COUNT(*) FROM accounts WHERE role='Librarian' AND account_status='Active')=1;
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM library_ownership)<>1 THEN
    RAISE EXCEPTION 'Reconcile the existing canonical Librarian owner before applying ownership setup.';
  END IF;
END $$;

CREATE TABLE ownership_transfer_invitations (
  invitation_id UUID PRIMARY KEY,
  owner_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
  owner_auth_version INTEGER NOT NULL,
  ownership_version INTEGER NOT NULL,
  recipient_email VARCHAR(191) NOT NULL,
  target_account_id BIGINT REFERENCES accounts(account_id),
  target_auth_version INTEGER,
  target_role VARCHAR(20),
  token_hash CHAR(64) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Accepted','Cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  accepted_account_id BIGINT REFERENCES accounts(account_id),
  mail_status VARCHAR(10) NOT NULL DEFAULT 'Pending' CHECK (mail_status IN ('Pending','Sent','Failed','Skipped')),
  mail_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (mail_attempts BETWEEN 0 AND 3),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  CHECK ((target_account_id IS NULL)=(target_auth_version IS NULL)),
  CHECK (target_account_id IS DISTINCT FROM owner_account_id),
  CHECK ((status='Accepted')=(accepted_at IS NOT NULL AND accepted_account_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_pending_ownership_transfer ON ownership_transfer_invitations((TRUE)) WHERE status='Pending';
CREATE INDEX ownership_pending_mail ON ownership_transfer_invitations(next_attempt_at) WHERE status='Pending' AND mail_status='Pending';

CREATE TABLE ownership_transfer_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id UUID REFERENCES ownership_transfer_invitations(invitation_id),
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('Established','Invited','Cancelled','Accepted')),
  previous_owner_id BIGINT REFERENCES accounts(account_id),
  new_owner_id BIGINT REFERENCES accounts(account_id),
  actor_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ownership_transfer_events(event_type,new_owner_id,actor_account_id)
SELECT 'Established',owner_account_id,owner_account_id FROM library_ownership;

CREATE FUNCTION protect_library_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='library_ownership' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Use the reviewed ownership transfer flow.'; END IF;
    IF NOT EXISTS(SELECT 1 FROM accounts a JOIN users u ON u.user_id=a.user_id
      WHERE a.account_id=NEW.owner_account_id AND a.role='Librarian' AND a.account_status='Active'
        AND u.user_role='Librarian' AND u.account_status='Active') THEN
      RAISE EXCEPTION 'The owner must be an active linked Librarian account.';
    END IF;
  ELSIF TG_TABLE_NAME='accounts' THEN
    IF EXISTS(SELECT 1 FROM library_ownership WHERE owner_account_id=OLD.account_id) THEN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Transfer ownership before removing the owner.'; END IF;
      IF NEW.role<>'Librarian' OR NEW.account_status<>'Active' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Transfer ownership before changing the owner account.';
      END IF;
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM library_ownership o JOIN accounts a ON a.account_id=o.owner_account_id WHERE a.user_id=OLD.user_id) THEN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Transfer ownership before removing the owner profile.'; END IF;
      IF NEW.user_role<>'Librarian' OR NEW.account_status<>'Active' THEN
        RAISE EXCEPTION 'Transfer ownership before changing the owner profile.';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER library_owner_guard BEFORE INSERT OR UPDATE OR DELETE ON library_ownership FOR EACH ROW EXECUTE FUNCTION protect_library_ownership();
CREATE TRIGGER library_owner_account_guard BEFORE UPDATE OF role,account_status,user_id OR DELETE ON accounts FOR EACH ROW EXECUTE FUNCTION protect_library_ownership();
CREATE TRIGGER library_owner_user_guard BEFORE UPDATE OF user_role,account_status OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION protect_library_ownership();

CREATE FUNCTION protect_ownership_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ownership events are append-only.'; END $$;
CREATE TRIGGER ownership_events_immutable BEFORE UPDATE OR DELETE ON ownership_transfer_events FOR EACH ROW EXECUTE FUNCTION protect_ownership_events();

ALTER TABLE library_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE ownership_transfer_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ownership_transfer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON library_ownership,ownership_transfer_invitations,ownership_transfer_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE ownership_transfer_events_event_id_seq FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION protect_library_ownership(),protect_ownership_events() FROM PUBLIC,anon,authenticated;
