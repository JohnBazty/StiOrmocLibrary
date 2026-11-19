-- Add explicit academic classification without guessing or rewriting legacy departments.
CREATE TABLE research_academic_groups (
  research_group_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department TEXT NOT NULL CHECK (department IN ('SHS','College')),
  program VARCHAR(80) NOT NULL CHECK (program=UPPER(BTRIM(program)) AND LENGTH(program)>0),
  year_level SMALLINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(department,program,year_level),
  CHECK ((department='SHS' AND year_level IN (11,12)) OR (department='College' AND year_level BETWEEN 1 AND 4))
);
ALTER TABLE research_records
  ADD COLUMN research_group_id BIGINT REFERENCES research_academic_groups(research_group_id),
  ADD COLUMN classification_version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX research_records_academic_group_idx ON research_records(research_group_id) WHERE research_group_id IS NOT NULL;
CREATE TABLE research_group_events (
  research_group_event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
  research_group_id BIGINT REFERENCES research_academic_groups(research_group_id),
  research_record_id BIGINT REFERENCES research_records(research_record_id),
  event_type TEXT NOT NULL CHECK (event_type IN ('Created','Updated','Assigned')),
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO research_academic_groups(department,program,year_level)
SELECT 'College',p,y FROM unnest(ARRAY['BSIT','BSHM','BSTM']) p CROSS JOIN generate_series(1,4) y;
INSERT INTO research_academic_groups(department,program,year_level)
SELECT 'SHS',p,y FROM unnest(ARRAY['STEM','ABM','HUMSS','TVL']) p CROSS JOIN generate_series(11,12) y;
ALTER TABLE research_academic_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_group_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON research_academic_groups,research_group_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE research_academic_groups_research_group_id_seq,research_group_events_research_group_event_id_seq FROM PUBLIC,anon,authenticated;
