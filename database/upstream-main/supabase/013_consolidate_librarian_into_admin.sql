-- Consolidate Librarian and System Administrator into a single Admin authorization role.
-- Postgres columns are text; add check constraints after validating existing data.

INSERT INTO roles (role_name, description)
VALUES ('Admin', 'Librarian / Super Admin with full library configuration and operations access')
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;

UPDATE users AS u
SET role_id = r_admin.role_id
FROM roles AS r_legacy
CROSS JOIN LATERAL (
  SELECT role_id FROM roles WHERE role_name = 'Admin' LIMIT 1
) AS r_admin
WHERE u.role_id = r_legacy.role_id
  AND r_legacy.role_name IN ('System Administrator', 'Librarian');

UPDATE users
SET user_role = 'Admin'
WHERE user_role = 'Librarian';

UPDATE accounts
SET role = 'Admin'
WHERE role = 'Librarian';

DO $$
DECLARE
  unexpected_users integer;
  unexpected_accounts integer;
BEGIN
  SELECT COUNT(*) INTO unexpected_users
  FROM users u
  LEFT JOIN roles r ON r.role_id = u.role_id
  WHERE u.user_role NOT IN ('Admin', 'Student', 'Faculty')
     OR COALESCE(r.role_name, '') NOT IN ('Admin', 'Student', 'Faculty');

  SELECT COUNT(*) INTO unexpected_accounts
  FROM accounts
  WHERE role NOT IN ('Admin', 'Student', 'Faculty');

  IF unexpected_users > 0 OR unexpected_accounts > 0 THEN
    RAISE EXCEPTION 'Unexpected role values remain (users=%, accounts=%). Aborting consolidation.',
      unexpected_users, unexpected_accounts;
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_user_role_check
  CHECK (user_role IN ('Admin', 'Student', 'Faculty'));

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_role_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_role_check
  CHECK (role IN ('Admin', 'Student', 'Faculty'));

DELETE FROM roles AS r
WHERE r.role_name IN ('System Administrator', 'Librarian')
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role_id = r.role_id);
