-- Separate Student and Faculty policies (revisions 2026-11-20, phase 3 slice 3b).
-- Faculty renewals: an empty limit means no limit; an empty extension means the student value.
-- Faculty waiting list: an empty limit means faculty requests do not expire.
SET LOCAL lock_timeout = '5s';
ALTER TABLE borrowing_policy_versions
  ADD COLUMN faculty_max_renewals INTEGER CHECK (faculty_max_renewals IS NULL OR faculty_max_renewals BETWEEN 0 AND 50),
  ADD COLUMN faculty_renewal_extension_days INTEGER CHECK (faculty_renewal_extension_days IS NULL OR faculty_renewal_extension_days BETWEEN 1 AND 120);
ALTER TABLE reservation_settings
  ADD COLUMN faculty_waiting_expiry_days INTEGER CHECK (faculty_waiting_expiry_days IS NULL OR faculty_waiting_expiry_days BETWEEN 7 AND 180),
  ADD COLUMN faculty_waiting_expiry_saved_at TIMESTAMPTZ,
  ADD COLUMN faculty_waiting_expiry_changed_by BIGINT REFERENCES accounts (account_id);
