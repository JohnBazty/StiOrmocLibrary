-- Local subject-rule provenance and reviewed LC Cutter call-number metadata.
ALTER TABLE public.dewey_assignment_events DROP CONSTRAINT dewey_assignment_events_source_check;
ALTER TABLE public.dewey_assignment_events ADD CONSTRAINT dewey_assignment_events_source_check
 CHECK (source IN ('manual','open_library','local_rule'));
CREATE TABLE public.catalog_call_numbers (
 title_id BIGINT PRIMARY KEY REFERENCES public.titles(title_id) ON DELETE RESTRICT,
 dewey_code TEXT NOT NULL CHECK (dewey_code ~ '^[0-9]{3}(\.[0-9]+)?$' AND length(dewey_code)<=64),
 cutter TEXT NOT NULL CHECK (cutter ~ '^[A-Z][0-9]+$' AND length(cutter)<=40),
 heading TEXT NOT NULL CHECK (length(heading) BETWEEN 1 AND 255),
 heading_type TEXT NOT NULL CHECK (heading_type IN ('author','title','organization')),
 table_version TEXT NOT NULL,
 row_version INTEGER NOT NULL DEFAULT 1,
 updated_by BIGINT NOT NULL REFERENCES public.accounts(account_id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_catalog_cutter_order ON public.catalog_call_numbers(dewey_code,cutter);
CREATE TABLE public.catalog_call_number_events (
 event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 title_id BIGINT NOT NULL REFERENCES public.titles(title_id),
 previous_value TEXT,new_value TEXT NOT NULL,
 actor_account_id BIGINT NOT NULL REFERENCES public.accounts(account_id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_call_number_history ON public.catalog_call_number_events(title_id,created_at);
ALTER TABLE public.catalog_call_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_call_number_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_call_numbers,public.catalog_call_number_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.catalog_call_number_events_event_id_seq FROM PUBLIC,anon,authenticated;
