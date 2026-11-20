-- Lost book: replace the copy or pay the book price (revisions 2026-11-20, phase 2 slice 2e).
-- When the borrower chooses to replace the book, the report waits in charge_resolution
-- 'Awaiting Replacement' (no charge). These columns record when the replacement copy arrived
-- and who received it; the report then becomes 'Replaced'.
SET LOCAL lock_timeout = '5s';
ALTER TABLE lost_book_reports
  ADD COLUMN IF NOT EXISTS replacement_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_received_by_user_id BIGINT REFERENCES users (user_id);
