-- Fines maintenance (docs/fines-maintenance.md, approved by Ethan 2026-11-18).
-- Librarians publish new fine_policy_versions rows from the Fine rules page; old rows are never edited.
-- Adds the change reason and value checks. Additive and safe to run more than once.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.fine_policy_versions
  ADD COLUMN IF NOT EXISTS change_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fine_policy_change_reason' AND conrelid = 'public.fine_policy_versions'::regclass) THEN
    ALTER TABLE public.fine_policy_versions ADD CONSTRAINT chk_fine_policy_change_reason
      CHECK (change_reason IS NULL OR char_length(change_reason) BETWEEN 10 AND 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fine_policy_amounts' AND conrelid = 'public.fine_policy_versions'::regclass) THEN
    ALTER TABLE public.fine_policy_versions ADD CONSTRAINT chk_fine_policy_amounts
      CHECK (hourly_rate >= 0 AND hourly_rate <= daily_rate AND daily_rate <= maximum_penalty AND maximum_penalty > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fine_policy_effective_range' AND conrelid = 'public.fine_policy_versions'::regclass) THEN
    ALTER TABLE public.fine_policy_versions ADD CONSTRAINT chk_fine_policy_effective_range
      CHECK (effective_until IS NULL OR effective_until > effective_from);
  END IF;
END $$;

-- The API connects as the owner role; Supabase client roles get nothing.
ALTER TABLE public.fine_policy_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fine_policy_versions FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.fine_policy_versions_fine_policy_id_seq FROM anon, authenticated;
