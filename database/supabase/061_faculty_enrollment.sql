-- Keep all existing rosters as Student rosters; Faculty uses the same semester lifecycle.
ALTER TABLE enrollment_roster_imports ADD COLUMN roster_role VARCHAR(10) NOT NULL DEFAULT 'Student' CHECK (roster_role IN ('Student','Faculty'));
ALTER TABLE enrollment_signup_challenges ADD COLUMN roster_role VARCHAR(10) NOT NULL DEFAULT 'Student' CHECK (roster_role IN ('Student','Faculty'));
ALTER TABLE enrollment_roster_imports DROP CONSTRAINT enrollment_roster_imports_semester_id_file_hash_complete_key;
ALTER TABLE enrollment_roster_imports ADD CONSTRAINT enrollment_roster_role_file UNIQUE (semester_id,roster_role,file_hash,complete);
CREATE INDEX enrollment_roster_role_term ON enrollment_roster_imports(semester_id,roster_role,roster_id DESC);
ALTER TABLE enrollment_roster_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_signup_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON enrollment_roster_imports,enrollment_signup_challenges FROM PUBLIC,anon,authenticated;
