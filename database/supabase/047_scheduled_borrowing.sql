-- Local draft: preferred pickup dates do not own copies until preparation.
ALTER TABLE public.reservations ADD COLUMN scheduled_pickup_date DATE;

CREATE TABLE public.borrowing_schedules (
  schedule_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(user_id),
  title_id BIGINT NOT NULL REFERENCES public.titles(title_id),
  pickup_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','prepared','cancelled','unfulfilled')),
  reservation_id BIGINT UNIQUE REFERENCES public.reservations(reservation_id),
  client_request_id TEXT NOT NULL CHECK (length(client_request_id) BETWEEN 16 AND 64),
  last_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id,client_request_id),
  CHECK ((status='prepared') = (reservation_id IS NOT NULL))
);
CREATE UNIQUE INDEX borrowing_schedules_pending_title ON public.borrowing_schedules(user_id,title_id) WHERE status='scheduled';
CREATE INDEX borrowing_schedules_due ON public.borrowing_schedules(pickup_date,created_at,schedule_id) WHERE status IN ('scheduled','prepared');
ALTER TABLE public.borrowing_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.borrowing_schedules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.borrowing_schedules_schedule_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.borrowing_schedules TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.borrowing_schedules_schedule_id_seq TO service_role;
