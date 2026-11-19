-- Book request events: one row per status per assigned copy (Ethan approved 2026-11-18).
-- When a held copy is reported lost and the request is later set aside again on another
-- copy, the borrower needs new "Preparing" and "Ready for pickup" events, notices and
-- emails. Stages recorded without a copy (received, waiting) stay single because
-- NULLS NOT DISTINCT treats the missing copy as equal. Existing rows are already unique
-- on (reservation_id, event_status), so the new constraint cannot fail on current data.
-- One DO block is one statement, so the swap is atomic even though the runner does not
-- wrap files in a transaction, and a rerun is a no-op. The old 025 rule is found by its
-- columns, not its generated name.
-- APPLY ONLY AFTER the code from fix/lost-copy-reservation-release is live on Vercel.
-- Older code names the 025 rule in ON CONFLICT and fails (42P10) once it is dropped.
-- See docs/runbooks/lost-copy-041-rollout.md.
DO $$
DECLARE
  old_name name;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.book_request_events'::regclass
       AND conname = 'book_request_events_reservation_status_copy_key'
  ) THEN
    ALTER TABLE public.book_request_events
      ADD CONSTRAINT book_request_events_reservation_status_copy_key
      UNIQUE NULLS NOT DISTINCT (reservation_id, event_status, physical_copy_id);
  END IF;

  FOR old_name IN
    SELECT c.conname FROM pg_constraint c
     WHERE c.conrelid = 'public.book_request_events'::regclass
       AND c.contype = 'u'
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
              FROM unnest(c.conkey) AS k(attnum)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)
           = ARRAY['event_status', 'reservation_id']
  LOOP
    EXECUTE format('ALTER TABLE public.book_request_events DROP CONSTRAINT %I', old_name);
  END LOOP;
END
$$;
