-- Additive API-only scan handoff. No existing attendance, credential or loan changes.
CREATE TABLE public.attendance_confirmation_requests (
  confirmation_id UUID PRIMARY KEY,
  request_key VARCHAR(64) NOT NULL UNIQUE,
  retry_keys VARCHAR(64)[] NOT NULL DEFAULT '{}',
  actor_account_id BIGINT NOT NULL REFERENCES public.accounts(account_id),
  account_id BIGINT NOT NULL REFERENCES public.accounts(account_id),
  user_id BIGINT NOT NULL REFERENCES public.users(user_id),
  credential_id BIGINT NOT NULL REFERENCES public.attendance_qr_credentials(credential_id),
  credential_fingerprint CHAR(64) NOT NULL,
  payload_digest CHAR(64) NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('Entry','Exit')),
  expected_log_id BIGINT REFERENCES public.attendance_logs(log_id),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Confirmed','Cancelled','Expired','Stale')),
  selected_purpose TEXT CHECK (selected_purpose IN ('Library Visit','Study','Research','Book Borrowing','Printing','Photocopy')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK ((action='Entry' AND expected_log_id IS NULL) OR (action='Exit' AND expected_log_id IS NOT NULL))
);
CREATE UNIQUE INDEX attendance_confirmation_one_pending ON public.attendance_confirmation_requests(user_id) WHERE status='Pending';
CREATE INDEX attendance_confirmation_owner ON public.attendance_confirmation_requests(account_id,status,expires_at);
CREATE INDEX attendance_confirmation_retries ON public.attendance_confirmation_requests USING GIN(retry_keys);
CREATE INDEX attendance_confirmation_actor ON public.attendance_confirmation_requests(actor_account_id,created_at);
CREATE INDEX attendance_confirmation_credential ON public.attendance_confirmation_requests(credential_id);
CREATE INDEX attendance_confirmation_log ON public.attendance_confirmation_requests(expected_log_id);
ALTER TABLE public.attendance_confirmation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_confirmation_requests FROM PUBLIC,anon,authenticated;
