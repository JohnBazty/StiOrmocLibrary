-- Safety sprint Part C: an Admin-set temporary password must be changed at the next sign-in.
-- The sign-in lock stays in login_attempt_windows (029); no lock columns here.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
