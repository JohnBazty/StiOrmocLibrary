-- Activation email tracking for imported roster rows (revisions 2026-11-20, phase 3 slice 3c).
SET LOCAL lock_timeout = '5s';
ALTER TABLE enrollment_roster_students
  ADD COLUMN IF NOT EXISTS activation_email_status VARCHAR(20)
    CHECK (activation_email_status IS NULL OR activation_email_status IN ('Sent', 'Failed')),
  ADD COLUMN IF NOT EXISTS activation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_email_error TEXT;
