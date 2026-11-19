CREATE TABLE urgent_case_settings(singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),version INTEGER NOT NULL DEFAULT 1,amount NUMERIC(12,2) CHECK(amount>0),overdue_days INTEGER CHECK(overdue_days BETWEEN 1 AND 3650),unpaid_days INTEGER CHECK(unpaid_days BETWEEN 1 AND 3650),email_enabled BOOLEAN NOT NULL DEFAULT FALSE,updated_by BIGINT REFERENCES accounts(account_id),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO urgent_case_settings(singleton) VALUES(TRUE);
CREATE TABLE urgent_case_events(event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,version INTEGER NOT NULL,actor_account_id BIGINT NOT NULL REFERENCES accounts(account_id),settings JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE urgent_case_notices(account_id BIGINT NOT NULL REFERENCES accounts(account_id),source_key TEXT NOT NULL,version INTEGER NOT NULL,notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),email_sent_at TIMESTAMPTZ,email_attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(account_id,source_key,version));
ALTER TABLE urgent_case_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE urgent_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE urgent_case_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON urgent_case_settings,urgent_case_events,urgent_case_notices FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE urgent_case_events_event_id_seq FROM PUBLIC,anon,authenticated;
