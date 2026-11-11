-- Circulation table RLS hardening (full audit 2026-11-11; P1 finding 1). Pending review, not applied.
-- Core tables: borrow_transactions, reservations, physical_copies. Safe to run more than once.
-- Policy: only the table owner or a BYPASSRLS role (the API's server connection) may read or write.

-- borrow_transactions
DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Role % neither owns borrow_transactions nor bypasses RLS; apply 035 as the backend owner role.', current_user;
  END IF;
END $$;

ALTER TABLE public.borrow_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY service_role_all ON public.borrow_transactions FOR ALL TO service_role USING (true) WITH CHECK (true)';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Skipped policy on borrow_transactions (service_role unavailable)';
  WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
DECLARE
  seq text := pg_get_serial_sequence('public.borrow_transactions', 'transaction_id');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.borrow_transactions FROM anon, authenticated';
    IF seq IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', seq);
    END IF;
  END IF;
END $$;

-- reservations
DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Role % neither owns reservations nor bypasses RLS; apply 035 as the backend owner role.', current_user;
  END IF;
END $$;

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY service_role_all ON public.reservations FOR ALL TO service_role USING (true) WITH CHECK (true)';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Skipped policy on reservations (service_role unavailable)';
  WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
DECLARE
  seq text := pg_get_serial_sequence('public.reservations', 'reservation_id');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.reservations FROM anon, authenticated';
    IF seq IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', seq);
    END IF;
  END IF;
END $$;

-- physical_copies
DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Role % neither owns physical_copies nor bypasses RLS; apply 035 as the backend owner role.', current_user;
  END IF;
END $$;

ALTER TABLE public.physical_copies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY service_role_all ON public.physical_copies FOR ALL TO service_role USING (true) WITH CHECK (true)';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Skipped policy on physical_copies (service_role unavailable)';
  WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
DECLARE
  seq text := pg_get_serial_sequence('public.physical_copies', 'physical_copy_id');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.physical_copies FROM anon, authenticated';
    IF seq IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', seq);
    END IF;
  END IF;
END $$;