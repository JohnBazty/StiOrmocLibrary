-- Additive printing extensions. Existing bills, rates, stock and receipts are unchanged.
CREATE TABLE printing_phase_one_settings (
  settings_id SMALLINT PRIMARY KEY CHECK(settings_id=1),
  image_fee_mono_centavos INTEGER NOT NULL DEFAULT 0 CHECK(image_fee_mono_centavos BETWEEN 0 AND 10000000),
  image_fee_color_centavos INTEGER NOT NULL DEFAULT 0 CHECK(image_fee_color_centavos BETWEEN 0 AND 10000000),
  schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_windows JSONB NOT NULL DEFAULT '[]',
  date_exceptions JSONB NOT NULL DEFAULT '[]',
  row_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO printing_phase_one_settings(settings_id) VALUES(1);
CREATE TABLE printing_setup_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
  settings_version INTEGER NOT NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE printing_document_analyses (
  analysis_id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id),
  source_hash CHAR(64) NOT NULL,
  paper_size VARCHAR(100) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  printable_path TEXT NOT NULL,
  page_findings JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '30 minutes'
);
CREATE INDEX printing_analyses_owner_expiry ON printing_document_analyses(user_id,expires_at);
ALTER TABLE print_requests
  ADD COLUMN service_kind TEXT NOT NULL DEFAULT 'Print' CHECK(service_kind IN ('Print','Photocopy')),
  ADD COLUMN output_mode TEXT CHECK(output_mode IN ('Monochrome','Colored','Automatic')),
  ADD COLUMN pricing_review_state TEXT NOT NULL DEFAULT 'Ready' CHECK(pricing_review_state IN ('Ready','Pending','Awaiting confirmation')),
  ADD COLUMN pricing_snapshot JSONB,
  ADD COLUMN page_findings JSONB,
  ADD COLUMN analysis_id UUID REFERENCES printing_document_analyses(analysis_id),
  ADD COLUMN client_request_key UUID;
CREATE UNIQUE INDEX printing_request_retry_key ON print_requests(user_id,client_request_key) WHERE client_request_key IS NOT NULL;
CREATE UNIQUE INDEX printing_analysis_one_request ON print_requests(analysis_id) WHERE analysis_id IS NOT NULL;
CREATE TABLE printing_price_review_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES print_requests(request_id),
  actor_user_id BIGINT NOT NULL REFERENCES users(user_id),
  event_type TEXT NOT NULL CHECK(event_type IN ('Reviewed','Accepted')),
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE printing_phase_one_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE printing_setup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE printing_document_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE printing_price_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON printing_phase_one_settings,printing_setup_events,printing_document_analyses,printing_price_review_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE printing_setup_events_event_id_seq,printing_price_review_events_event_id_seq FROM PUBLIC,anon,authenticated;
