-- Additive server-only delivery and document-retention metadata. Financial rows remain unchanged.
CREATE TABLE web_push_devices (
 device_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id BIGINT NOT NULL REFERENCES accounts(account_id),
 endpoint TEXT NOT NULL UNIQUE,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX web_push_devices_owner ON web_push_devices(account_id) WHERE active;
CREATE TABLE web_push_deliveries (
 delivery_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id BIGINT NOT NULL REFERENCES web_push_devices(device_id),
 announcement_id BIGINT NOT NULL REFERENCES announcements(announcement_id),
 revision_number INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'Pending' CHECK(state IN ('Pending','Accepted','Retired','Failed')),
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 accepted_at TIMESTAMPTZ,
 UNIQUE(device_id,announcement_id,revision_number)
);
CREATE INDEX web_push_pending ON web_push_deliveries(next_attempt_at) WHERE state='Pending';
ALTER TABLE print_requests
 ADD COLUMN document_retention_hold BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN documents_expired_at TIMESTAMPTZ;
CREATE TABLE print_document_manifest (
 artifact_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id BIGINT NOT NULL REFERENCES print_requests(request_id),
 artifact_path TEXT NOT NULL,
 removed_at TIMESTAMPTZ,
 retry_after TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0,
 UNIQUE(request_id,artifact_path)
);
CREATE TABLE print_retention_events (
 event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id BIGINT NOT NULL REFERENCES print_requests(request_id),
 actor_account_id BIGINT REFERENCES accounts(account_id),
 event_type TEXT NOT NULL CHECK(event_type IN ('Hold','Release','Expired','Retry')),
 reason TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE web_push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_push_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_document_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_retention_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON web_push_devices,web_push_deliveries,print_document_manifest,print_retention_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE web_push_devices_device_id_seq,web_push_deliveries_delivery_id_seq,print_document_manifest_artifact_id_seq,print_retention_events_event_id_seq FROM PUBLIC,anon,authenticated;
