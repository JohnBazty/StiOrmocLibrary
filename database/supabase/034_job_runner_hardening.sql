-- Durable job runner hardening (safety sprint Part A, approved by Ethan 2026-11-11).
-- Safe to run more than once. Live already has row-level security on both job tables;
-- this records it in the repository so a rebuild cannot leave them open.

ALTER TABLE public.scheduled_job_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scheduled_job_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.scheduled_job_runs FROM PUBLIC, anon, authenticated;

-- D5 overdue cursor: walks open loans by (due_at, transaction_id) without reading closed history.
CREATE INDEX IF NOT EXISTS idx_borrow_open_due_cursor
  ON public.borrow_transactions (due_at, transaction_id)
  WHERE transaction_status IN ('Borrowed', 'Overdue') AND lost_confirmed_at IS NULL;
