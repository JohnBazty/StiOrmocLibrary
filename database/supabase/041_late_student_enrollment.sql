-- Preserve regular import history and distinguish how later additions reached the roster.
ALTER TABLE enrollment_roster_imports
  ADD COLUMN source_kind VARCHAR(24) NOT NULL DEFAULT 'RosterUpload',
  ADD CONSTRAINT enrollment_roster_import_source_kind CHECK (
    source_kind = 'RosterUpload'
    OR (source_kind IN ('LateEnrollmentForm', 'LateEnrollmentFile') AND NOT complete)
  );
