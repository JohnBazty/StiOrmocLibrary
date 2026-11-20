-- Policy times (revisions 2026-11-20, phase 3 slice 3a). Times are stored as plain clock times;
-- the app shows and accepts them as 12-hour times with AM/PM.
-- Fine rules: optional hours in which hourly fines count each day (else the library's closing time ends them).
-- Borrowing policy: optional windows in which books may be borrowed and returned at the desk.
SET LOCAL lock_timeout = '5s';
ALTER TABLE fine_policy_versions
  ADD COLUMN hourly_starts_at TIME,
  ADD COLUMN hourly_ends_at TIME,
  ADD CONSTRAINT fine_policy_hourly_window CHECK (
    (hourly_starts_at IS NULL AND hourly_ends_at IS NULL)
    OR (hourly_starts_at IS NOT NULL AND hourly_ends_at IS NOT NULL AND hourly_starts_at < hourly_ends_at));
ALTER TABLE borrowing_policy_versions
  ADD COLUMN borrow_opens_at TIME,
  ADD COLUMN borrow_closes_at TIME,
  ADD COLUMN return_opens_at TIME,
  ADD COLUMN return_closes_at TIME,
  ADD CONSTRAINT borrowing_policy_borrow_window CHECK (
    (borrow_opens_at IS NULL AND borrow_closes_at IS NULL)
    OR (borrow_opens_at IS NOT NULL AND borrow_closes_at IS NOT NULL AND borrow_opens_at < borrow_closes_at)),
  ADD CONSTRAINT borrowing_policy_return_window CHECK (
    (return_opens_at IS NULL AND return_closes_at IS NULL)
    OR (return_opens_at IS NOT NULL AND return_closes_at IS NOT NULL AND return_opens_at < return_closes_at));
