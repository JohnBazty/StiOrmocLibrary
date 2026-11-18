-- Book request events: one row per status per assigned copy (Ethan approved 2026-11-18).
-- When a held copy is reported lost and the request is later set aside again on another
-- copy, the borrower needs new "Preparing" and "Ready for pickup" events, notices and
-- emails. Stages recorded without a copy (received, waiting) stay single because
-- NULLS NOT DISTINCT treats the missing copy as equal. Existing rows are already unique
-- on (reservation_id, event_status), so the new constraint cannot fail on current data.
-- No IF EXISTS: if the 025 constraint has another name, stop instead of keeping both.
-- The runner applies statements without a transaction: if the DROP fails after the ADD,
-- drop the old constraint by its real name by hand (check pg_constraint) before a rerun.
-- Deploy order does not matter: recordRequestEvent uses ON CONFLICT DO NOTHING.
ALTER TABLE book_request_events
  ADD CONSTRAINT book_request_events_reservation_status_copy_key
  UNIQUE NULLS NOT DISTINCT (reservation_id, event_status, physical_copy_id);
ALTER TABLE book_request_events
  DROP CONSTRAINT book_request_events_reservation_id_event_status_key;
