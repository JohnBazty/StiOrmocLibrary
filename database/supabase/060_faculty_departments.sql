-- Explicit current affiliation only; no inferred backfill or operational changes.
CREATE TABLE faculty_department_assignments (
 account_id BIGINT PRIMARY KEY REFERENCES accounts(account_id),
 department VARCHAR(150) NOT NULL CHECK (length(btrim(department)) BETWEEN 1 AND 150),
 updated_by BIGINT NOT NULL REFERENCES accounts(account_id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX faculty_department_lookup ON faculty_department_assignments(lower(department),account_id);
ALTER TABLE faculty_department_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON faculty_department_assignments FROM PUBLIC,anon,authenticated;
