-- Lifetime per-person/category conduct history. No historical money is changed.
CREATE TABLE conduct_students (
 user_id BIGINT NOT NULL REFERENCES users(user_id),
 category TEXT NOT NULL CHECK(category IN ('Noise','Eating or food','Other conduct')),
 prior_warnings INTEGER NOT NULL CHECK(prior_warnings BETWEEN 0 AND 3),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),
 reviewed_by_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
 reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,category)
);
CREATE TABLE conduct_incidents (
 incident_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(user_id),
 category TEXT NOT NULL CHECK(category IN ('Noise','Eating or food','Other conduct')),
 incident_at TIMESTAMPTZ NOT NULL,
 location TEXT NOT NULL CHECK(length(location)<=150),
 details TEXT NOT NULL CHECK(length(trim(details)) BETWEEN 10 AND 1000),
 action TEXT NOT NULL CHECK(action IN ('First warning','Second warning','Final warning','Fine issued')),
 fine_id BIGINT UNIQUE REFERENCES fines(fine_id),
 recorded_by_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 request_key UUID NOT NULL,
 payload_hash TEXT NOT NULL,
 voided_at TIMESTAMPTZ,
 UNIQUE(recorded_by_account_id,request_key),
 CHECK((action='Fine issued')=(fine_id IS NOT NULL))
);
CREATE INDEX conduct_person_category ON conduct_incidents(user_id,category,incident_id);
CREATE INDEX conduct_date ON conduct_incidents(incident_at DESC,incident_id DESC);
CREATE TABLE conduct_events (
 event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 incident_id BIGINT NOT NULL REFERENCES conduct_incidents(incident_id),
 actor_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
 event_type TEXT NOT NULL CHECK(event_type IN ('Recorded','Correction','Resolved','Voided')),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX conduct_event_history ON conduct_events(incident_id,event_id);
CREATE FUNCTION conduct_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Conduct history is append only';
END;
$$;
CREATE TRIGGER conduct_events_immutable BEFORE UPDATE OR DELETE ON conduct_events FOR EACH ROW EXECUTE FUNCTION conduct_history_immutable();
CREATE TRIGGER conduct_students_immutable BEFORE UPDATE OR DELETE ON conduct_students FOR EACH ROW EXECUTE FUNCTION conduct_history_immutable();
ALTER TABLE conduct_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE conduct_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conduct_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON conduct_students,conduct_incidents,conduct_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE conduct_incidents_incident_id_seq,conduct_events_event_id_seq FROM PUBLIC,anon,authenticated;
