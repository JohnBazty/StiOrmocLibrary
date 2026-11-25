-- Shared violation warning rules across all categories + per-level warning limits and category level targeting.
-- Before applying on live: no preconditions; adds columns with defaults and preserves all historical incidents and fines.
SET LOCAL lock_timeout = '5s';

ALTER TABLE violation_settings
  ADD COLUMN warnings_before_fine INTEGER NOT NULL DEFAULT 2 CHECK (warnings_before_fine BETWEEN 0 AND 3),
  ADD COLUMN level_warnings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(level_warnings) = 'object');

ALTER TABLE violation_categories
  ADD COLUMN allowed_levels TEXT[] NOT NULL DEFAULT ARRAY['Grade 11','Grade 12','1st Year','2nd Year','3rd Year','4th Year']
    CHECK (
      cardinality(allowed_levels) BETWEEN 1 AND 6
      AND allowed_levels <@ ARRAY['Grade 11','Grade 12','1st Year','2nd Year','3rd Year','4th Year']::text[]
    );
