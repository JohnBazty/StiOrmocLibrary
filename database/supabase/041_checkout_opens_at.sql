-- Checkout opens at: Ethan confirmed 2026-11-19 that take-home checkout starts at 14:00.
-- Before this time only in-library reading is allowed. The Librarian sets it per policy version.
-- A constant default is a catalog-only change in Postgres 11+, so existing (immutable) rows are
-- not rewritten and the BEFORE UPDATE immutability trigger from 016 does not fire.
-- Plan: docs/borrowing-hours-faculty-rules.md (R1, R9).
ALTER TABLE borrowing_policy_versions
  ADD COLUMN IF NOT EXISTS checkout_opens_at TIME NOT NULL DEFAULT TIME '14:00:00';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'borrowing_policy_checkout_opens_at_hours'
       AND conrelid = 'borrowing_policy_versions'::regclass
  ) THEN
    ALTER TABLE borrowing_policy_versions
      ADD CONSTRAINT borrowing_policy_checkout_opens_at_hours
      CHECK (checkout_opens_at >= TIME '08:00:00' AND checkout_opens_at < TIME '17:00:00');
  END IF;
END $$;
