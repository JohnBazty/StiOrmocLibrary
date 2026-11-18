-- 018_loan_renewal_hardening.sql
-- Follow-up to 017_loan_renewals.sql (already applied): database backstops,
-- indexes, and RLS/grants for loan_renewal_requests, matching 011.
-- lost_book_reports.transaction_id needs no new index: uq_lost_book_transaction covers it.

-- ---------------------------------------------------------------------------
-- 1) At most one Approved decision per loan and renewal number
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM loan_renewal_requests
     WHERE status = 'Approved'
     GROUP BY transaction_id, renewal_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Approved renewals exist for one (transaction_id, renewal_number); resolve them before applying 018.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_renewal_approved_number
  ON loan_renewal_requests (transaction_id, renewal_number)
  WHERE status = 'Approved';

-- ---------------------------------------------------------------------------
-- 2) Indexes: latest-decision lookup (history/monitor LATERAL join) and FKs
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_loan_renewal_transaction_latest
  ON loan_renewal_requests (transaction_id, created_at DESC, renewal_request_id DESC);
DROP INDEX IF EXISTS idx_loan_renewal_transaction;

CREATE INDEX IF NOT EXISTS idx_loan_renewal_deciding_staff
  ON loan_renewal_requests (deciding_staff_user_id);
CREATE INDEX IF NOT EXISTS idx_loan_renewal_policy_version
  ON loan_renewal_requests (borrowing_policy_version_id);

-- ---------------------------------------------------------------------------
-- 3) RLS and client-role grants (backend uses DATABASE_URL; no PostgREST access)
-- ---------------------------------------------------------------------------
-- RLS without FORCE: the owner and BYPASSRLS roles still see every row. Refuse to apply
-- if the applying role (the backend's DATABASE_URL role) is neither, or the API would lose access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_roles owner ON owner.oid = c.relowner
     WHERE c.oid = 'public.loan_renewal_requests'::regclass
       AND (owner.rolname = current_user
            OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolbypassrls OR r.rolsuper)))
  ) THEN
    RAISE EXCEPTION 'Role % neither owns loan_renewal_requests nor bypasses RLS; apply 018 as the backend owner role.', current_user;
  END IF;
END $$;

ALTER TABLE loan_renewal_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY service_role_all ON public.loan_renewal_requests FOR ALL TO service_role USING (true) WITH CHECK (true)';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Skipped policy on loan_renewal_requests (service_role unavailable)';
  WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
DECLARE
  renewal_sequence text := pg_get_serial_sequence('public.loan_renewal_requests', 'renewal_request_id');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.loan_renewal_requests FROM anon, authenticated';
    IF renewal_sequence IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', renewal_sequence);
    END IF;
  END IF;
END $$;
