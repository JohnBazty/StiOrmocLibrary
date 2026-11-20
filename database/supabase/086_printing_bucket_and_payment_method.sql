-- Printing documents private bucket and preferred payment method (revisions 2026-11-20, phase 3 slice 3d).
SET LOCAL lock_timeout = '5s';

ALTER TABLE print_requests
  ADD COLUMN IF NOT EXISTS preferred_payment_method VARCHAR(20) NOT NULL DEFAULT 'Online'
    CHECK (preferred_payment_method IN ('Cash', 'Online'));

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'printing-documents',
      'printing-documents',
      FALSE,
      10485760,
      ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
