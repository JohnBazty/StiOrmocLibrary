-- Consolidate Librarian and System Administrator into a single Admin authorization role.
-- Data updates run before ENUM narrowing. Abort on unexpected role values.

-- 1. Ensure a canonical Admin role row exists (Librarian/Super Admin description).
INSERT INTO `roles` (`role_name`, `description`)
VALUES ('Admin', 'Librarian / Super Admin with full library configuration and operations access')
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`);

SET @admin_role_id := (
  SELECT `role_id` FROM `roles` WHERE `role_name` = 'Admin' LIMIT 1
);

-- 2. Point every legacy System Administrator / Librarian user at the Admin role row.
UPDATE `users` AS u
INNER JOIN `roles` AS r ON r.`role_id` = u.`role_id`
SET u.`role_id` = @admin_role_id
WHERE r.`role_name` IN ('System Administrator', 'Librarian');

-- 3. Normalize identity role columns.
UPDATE `users`
SET `user_role` = 'Admin'
WHERE `user_role` = 'Librarian';

UPDATE `accounts`
SET `role` = 'Admin'
WHERE `role` = 'Librarian';

-- 4. Fail the migration if any unexpected staff identity remains.
SET @unexpected_users := (
  SELECT COUNT(*) FROM `users` u
  LEFT JOIN `roles` r ON r.`role_id` = u.`role_id`
  WHERE u.`user_role` NOT IN ('Admin', 'Student', 'Faculty')
     OR COALESCE(r.`role_name`, '') NOT IN ('Admin', 'Student', 'Faculty')
);
SET @unexpected_accounts := (
  SELECT COUNT(*) FROM `accounts`
  WHERE `role` NOT IN ('Admin', 'Student', 'Faculty')
);

-- Signal abort via deliberately invalid SQL when unexpected values remain.
SET @abort_sql := IF(
  @unexpected_users > 0 OR @unexpected_accounts > 0,
  'SELECT * FROM `__abort_unexpected_role_values__`',
  'SELECT 1'
);
PREPARE stmt_abort FROM @abort_sql;
EXECUTE stmt_abort;
DEALLOCATE PREPARE stmt_abort;

-- 5. Narrow ENUMs to the three canonical authorization values.
ALTER TABLE `users`
  MODIFY COLUMN `user_role` ENUM('Admin', 'Student', 'Faculty') NOT NULL;

ALTER TABLE `accounts`
  MODIFY COLUMN `role` ENUM('Student', 'Faculty', 'Admin') NOT NULL;

-- 6. Remove unreferenced legacy role seed rows after FK reassignment.
DELETE FROM `roles`
WHERE `role_name` IN ('System Administrator', 'Librarian')
  AND NOT EXISTS (SELECT 1 FROM `users` WHERE `users`.`role_id` = `roles`.`role_id`);
