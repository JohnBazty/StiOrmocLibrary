-- Librarian's borrowing rules (Ethan, 2026-11-19): students 2 books, faculty 5 books,
-- 1 open day, due 08:00, checkout opens 14:00. Fines are unchanged (fine calculator, not this table).
-- Publishes a new immutable policy version effective today (Manila), copying every other value and
-- the material rules from the version effective now. Runs once: a rerun finds the change reason.
-- Needs 041 (checkout_opens_at). Plan: docs/borrowing-hours-faculty-rules.md.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  reason CONSTANT TEXT := 'Librarian rules 2026-11-19: checkout opens 2:00 PM, due 8:00 AM next open day, students 2 books, faculty 5 books.';
  today DATE := (NOW() AT TIME ZONE 'Asia/Manila')::date;
  source_id BIGINT;
  new_id BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(42); -- two concurrent runs must not both insert
  IF EXISTS (SELECT 1 FROM public.borrowing_policy_versions WHERE change_reason = reason) THEN
    RETURN;
  END IF;
  -- A version scheduled for a later date would silently replace these rules on that date.
  IF EXISTS (SELECT 1 FROM public.borrowing_policy_versions WHERE effective_on > today) THEN
    RAISE EXCEPTION '042: a future-dated borrowing policy exists; review it with the Librarian before applying.';
  END IF;

  SELECT borrowing_policy_version_id INTO source_id
    FROM public.borrowing_policy_versions
   WHERE effective_on <= today
   ORDER BY effective_on DESC, borrowing_policy_version_id DESC
   LIMIT 1;
  IF source_id IS NULL THEN
    RAISE EXCEPTION '042: no borrowing policy is effective today to copy from.';
  END IF;

  INSERT INTO public.borrowing_policy_versions (
    effective_on, student_max_active_books, faculty_max_active_books, borrowing_days, due_time_cutoff, checkout_opens_at,
    max_renewals, renewal_extension_days, student_max_active_reservations, faculty_max_active_reservations,
    block_renewal_if_overdue, block_renewal_if_unpaid_fines, block_renewal_if_reserved, long_overdue_after_days,
    change_reason, created_by_user_id)
  SELECT today, 2, 5, 1, TIME '08:00:00', TIME '14:00:00',
         max_renewals, renewal_extension_days, student_max_active_reservations, faculty_max_active_reservations,
         block_renewal_if_overdue, block_renewal_if_unpaid_fines, block_renewal_if_reserved, long_overdue_after_days,
         reason, NULL
    FROM public.borrowing_policy_versions
   WHERE borrowing_policy_version_id = source_id
  RETURNING borrowing_policy_version_id INTO new_id;

  INSERT INTO public.borrowing_policy_material_rules (borrowing_policy_version_id, material_type, is_borrowable)
  SELECT new_id, material_type, is_borrowable
    FROM public.borrowing_policy_material_rules
   WHERE borrowing_policy_version_id = source_id;
END $$;
