-- 011_advisor_security_lockdown.sql
-- Clears Supabase Security Advisor:
--   WARN: anon/authenticated can EXECUTE public.rls_auto_enable() (SECURITY DEFINER)
--   INFO: RLS enabled with no policy on public tables (backend-only API via DATABASE_URL)
--
-- Safe for SmartLib v1: Express uses DATABASE_URL / service_role; browser does not use PostgREST table API.

-- ---------------------------------------------------------------------------
-- 1) Lock down SECURITY DEFINER helper
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'rls_auto_enable'
       AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated';
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres';
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role';
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Explicit service_role policies on every public table with RLS and no policy
--    (service_role bypasses RLS; policies document intent and clear Advisor INFO)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  policy_name text := 'service_role_all';
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity = true
       AND NOT EXISTS (
         SELECT 1
           FROM pg_policies p
          WHERE p.schemaname = 'public'
            AND p.tablename = c.relname
       )
     ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        policy_name,
        r.table_name
      );
    EXCEPTION
      WHEN undefined_object THEN
        -- service_role role missing in non-Supabase Postgres; skip quietly
        RAISE NOTICE 'Skipped policy on % (service_role unavailable)', r.table_name;
      WHEN duplicate_object THEN
        NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Revoke PostgREST client roles from public schema objects
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  BEGIN
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  BEGIN
    EXECUTE 'REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    BEGIN
      EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
  END;
  BEGIN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  BEGIN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  BEGIN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;
