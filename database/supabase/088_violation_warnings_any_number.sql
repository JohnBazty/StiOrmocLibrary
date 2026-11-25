-- Allow any non-negative warning count (up to 99) instead of capping at 3, and allow warning step labels beyond 3rd warning.
SET LOCAL lock_timeout = '5s';

ALTER TABLE violation_settings
  DROP CONSTRAINT violation_settings_warnings_before_fine_check,
  ADD CONSTRAINT violation_settings_warnings_before_fine_check CHECK (warnings_before_fine BETWEEN 0 AND 99);

ALTER TABLE violation_categories
  DROP CONSTRAINT violation_categories_warnings_before_fine_check,
  ADD CONSTRAINT violation_categories_warnings_before_fine_check CHECK (warnings_before_fine BETWEEN 0 AND 99);

ALTER TABLE conduct_incidents
  DROP CONSTRAINT conduct_incidents_action_check,
  ADD CONSTRAINT conduct_incidents_action_check CHECK (
    action IN ('First warning', 'Second warning', 'Final warning', 'Fine issued')
    OR action ~ '^Warning [1-9][0-9]*$'
  );
