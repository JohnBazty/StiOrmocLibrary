SET LOCAL lock_timeout = '5s';

ALTER TABLE public.enrollment_roster_imports
  ADD COLUMN IF NOT EXISTS source_kind VARCHAR(24) NOT NULL DEFAULT 'RosterUpload';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enrollment_roster_imports_source_kind_check'
      AND conrelid = 'public.enrollment_roster_imports'::regclass
  ) THEN
    ALTER TABLE public.enrollment_roster_imports
      ADD CONSTRAINT enrollment_roster_imports_source_kind_check
      CHECK (source_kind IN ('RosterUpload', 'LateEnrollmentForm', 'LateEnrollmentFile'));
  END IF;
END $$;
