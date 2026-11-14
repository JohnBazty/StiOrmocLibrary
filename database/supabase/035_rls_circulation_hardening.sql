-- Circulation table RLS hardening (full audit 2026-11-11; P1 finding 1). Pending review, not applied.
-- Tables: borrow_transactions, reservations, physical_copies. Safe to run more than once.
-- Live may already be locked by 011 (revokes and auto-RLS); this records it in the repository
-- so a rebuild cannot leave these tables open.
-- RLS without FORCE: only the table owner or a BYPASSRLS role (the API's DATABASE_URL connection)
-- may read or write. Before applying, confirm the API's role owns these tables, or bypasses RLS
-- and holds explicit grants (this revokes PUBLIC). Apply as the owner or a superuser.

DO $$
DECLARE
  tbl text;
  seq text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['borrow_transactions', 'reservations', 'physical_copies'] LOOP
    -- Like 018, but ENABLE RLS needs the owner or a superuser, so a bypass-only role is refused here too.
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_roles owner ON owner.oid = c.relowner
       WHERE c.oid = format('public.%I', tbl)::regclass
         AND (owner.rolname = current_user
              OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND r.rolsuper))
    ) THEN
      RAISE EXCEPTION 'Role % does not own % and is not a superuser; apply 035 as the backend owner role.', current_user, tbl;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Matches 011 and 018: service_role keeps explicit access.
    BEGIN
      EXECUTE format('CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl);
    EXCEPTION
      WHEN undefined_object THEN RAISE NOTICE 'Skipped policy on % (service_role unavailable)', tbl;
      WHEN duplicate_object THEN NULL;
    END;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', tbl);
    seq := pg_get_serial_sequence(format('public.%I', tbl), CASE tbl
      WHEN 'borrow_transactions' THEN 'transaction_id'
      WHEN 'reservations' THEN 'reservation_id'
      ELSE 'physical_copy_id' END);
    IF seq IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', seq);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', tbl);
      IF seq IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', seq);
      END IF;
    END IF;
  END LOOP;
END $$;
