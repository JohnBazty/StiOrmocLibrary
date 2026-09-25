-- ============================================================================
-- Supabase Advisor 0010: Security Definer View
-- Postgres views default to owner privileges; set SECURITY INVOKER so queries
-- use the caller's privileges (and future RLS on base tables).
-- Additive only; safe after 001–006.
-- ============================================================================

ALTER VIEW public.borrow_records SET (security_invoker = true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'book_titles'
       AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.book_titles SET (security_invoker = true)';
  END IF;
END $$;
