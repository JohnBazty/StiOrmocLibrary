-- Supersedes the unapplied 028 draft. Existing academic terms and accounts are unchanged at installation.
CREATE TABLE enrollment_lifecycle (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  started BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO enrollment_lifecycle(id) VALUES (1);

CREATE TABLE enrollment_semesters (
  semester_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academic_year VARCHAR(9) NOT NULL,
  term_name VARCHAR(30) NOT NULL,
  end_date DATE NOT NULL,
  manual_end_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  started_by BIGINT REFERENCES accounts(account_id),
  ended_at TIMESTAMPTZ,
  ended_by BIGINT REFERENCES accounts(account_id),
  end_kind VARCHAR(12) CHECK (end_kind IN ('Manual','Scheduled')),
  created_by BIGINT NOT NULL REFERENCES accounts(account_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (academic_year,term_name),
  CHECK (manual_end_at<=scheduled_end_at),
  CHECK (started_at IS NULL OR started_at<manual_end_at),
  CHECK ((ended_at IS NULL)=(end_kind IS NULL)),
  CHECK (ended_at IS NULL OR ended_at>=manual_end_at)
);
CREATE UNIQUE INDEX one_active_enrollment_semester ON enrollment_semesters ((TRUE))
  WHERE started_at IS NOT NULL AND ended_at IS NULL;

ALTER TABLE login_otp_challenges ADD COLUMN restoration_semester_id BIGINT REFERENCES enrollment_semesters(semester_id);

CREATE TABLE enrollment_roster_imports (
  roster_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  semester_id BIGINT NOT NULL REFERENCES enrollment_semesters(semester_id),
  source_date DATE NOT NULL,
  complete BOOLEAN NOT NULL,
  file_hash CHAR(64) NOT NULL,
  file_name VARCHAR(240) NOT NULL,
  student_count INTEGER NOT NULL CHECK (student_count BETWEEN 1 AND 10000),
  uploaded_by BIGINT NOT NULL REFERENCES accounts(account_id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (semester_id,file_hash,complete)
);
CREATE INDEX enrollment_roster_term ON enrollment_roster_imports (semester_id,roster_id DESC);

CREATE TABLE enrollment_roster_students (
  roster_id BIGINT NOT NULL REFERENCES enrollment_roster_imports(roster_id),
  school_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(200) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  school_email VARCHAR(191),
  program VARCHAR(150) NOT NULL,
  year_level VARCHAR(100) NOT NULL,
  PRIMARY KEY (roster_id,school_id)
);
CREATE INDEX enrollment_student_lookup ON enrollment_roster_students (school_id,roster_id DESC);

CREATE TABLE enrollment_semester_members (
  semester_id BIGINT NOT NULL REFERENCES enrollment_semesters(semester_id),
  account_id BIGINT NOT NULL REFERENCES accounts(account_id),
  school_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(200) NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_status VARCHAR(20),
  closed_auth_version BIGINT,
  PRIMARY KEY (semester_id,account_id)
);
CREATE INDEX enrollment_member_account ON enrollment_semester_members (account_id,semester_id DESC);

CREATE TABLE enrollment_signup_challenges (
  challenge_id UUID PRIMARY KEY,
  semester_id BIGINT NOT NULL REFERENCES enrollment_semesters(semester_id),
  roster_id BIGINT NOT NULL,
  school_id VARCHAR(50) NOT NULL UNIQUE,
  school_email VARCHAR(191) NOT NULL,
  code_hash CHAR(64),
  grant_hash CHAR(64),
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  sent_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (roster_id,school_id) REFERENCES enrollment_roster_students(roster_id,school_id)
);

ALTER TABLE enrollment_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_roster_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_roster_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_semester_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_signup_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON enrollment_lifecycle,enrollment_semesters,enrollment_roster_imports,enrollment_roster_students,enrollment_semester_members,enrollment_signup_challenges FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE enrollment_semesters_semester_id_seq,enrollment_roster_imports_roster_id_seq FROM PUBLIC,anon,authenticated;
