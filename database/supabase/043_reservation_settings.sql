-- Reservation maintenance (.planning/phases/01-reservation-maintenance/01-SPEC.md, R1, R3, R7).
-- One settings row: the pickup window (1-7 days, default 1) and the optional waiting-list limit (off, or 7-90 days).
-- Written, not applied; apply after 042 only with Ethan's go-ahead. Additive and safe to run more than once.
-- The API reads the row when it exists and falls back to window 1 / limit off when it does not.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.reservation_settings (
  settings_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (settings_id = 1),
  pickup_window_days SMALLINT NOT NULL DEFAULT 1 CHECK (pickup_window_days BETWEEN 1 AND 7),
  pickup_window_changed_by BIGINT REFERENCES public.accounts(account_id) ON DELETE SET NULL,
  pickup_window_changed_at TIMESTAMPTZ,
  waiting_expiry_days SMALLINT CHECK (waiting_expiry_days IS NULL OR waiting_expiry_days BETWEEN 7 AND 90),
  -- Every save of the limit restarts the count: a waiting request expires at max(reserved_at, saved_at) + limit.
  waiting_expiry_saved_at TIMESTAMPTZ,
  waiting_expiry_changed_by BIGINT REFERENCES public.accounts(account_id) ON DELETE SET NULL,
  CONSTRAINT chk_reservation_settings_expiry_saved CHECK (waiting_expiry_days IS NULL OR waiting_expiry_saved_at IS NOT NULL)
);

INSERT INTO public.reservation_settings (settings_id) VALUES (1) ON CONFLICT (settings_id) DO NOTHING;

-- expire() scans waiting Reservation requests (no copy assigned) by age.
CREATE INDEX IF NOT EXISTS ix_reservation_waiting_reserved ON public.reservations (reserved_at)
  WHERE request_kind = 'Reservation' AND reservation_status IN ('pending', 'approved') AND assigned_physical_copy_id IS NULL;

-- The API connects as the owner role; Supabase client roles get nothing.
ALTER TABLE public.reservation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_settings FROM PUBLIC, anon, authenticated;
