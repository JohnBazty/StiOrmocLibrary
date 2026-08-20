-- ============================================================================
-- STI Ormoc Smart Library - JWT Role Authentication Compatibility Fields
-- MySQL 5.6 compatible | additive | preserves normalized roles and user IDs
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

SET @auth_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users' AND COLUMN_NAME = 'school_id'),
  'ALTER TABLE `users` ADD COLUMN `school_id` VARCHAR(50) NULL AFTER `institutional_id`',
  'SELECT 1'
);
PREPARE auth_statement FROM @auth_ddl;
EXECUTE auth_statement;
DEALLOCATE PREPARE auth_statement;

SET @auth_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users' AND COLUMN_NAME = 'user_role'),
  'ALTER TABLE `users` ADD COLUMN `user_role` ENUM(''Admin'',''Librarian'',''Student'',''Faculty'') NULL AFTER `role_id`',
  'SELECT 1'
);
PREPARE auth_statement FROM @auth_ddl;
EXECUTE auth_statement;
DEALLOCATE PREPARE auth_statement;

UPDATE `users` u
JOIN `roles` r ON r.role_id = u.role_id
   SET u.school_id = u.institutional_id,
       u.user_role = CASE r.role_name
         WHEN 'System Administrator' THEN 'Admin'
         WHEN 'Librarian' THEN 'Librarian'
         WHEN 'Student' THEN 'Student'
         WHEN 'Faculty' THEN 'Faculty'
       END
 WHERE u.school_id IS NULL OR u.user_role IS NULL;

ALTER TABLE `users`
  MODIFY COLUMN `school_id` VARCHAR(50) NOT NULL,
  MODIFY COLUMN `user_role` ENUM('Admin','Librarian','Student','Faculty') NOT NULL;

SET @auth_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_school_id'),
  'ALTER TABLE `users` ADD UNIQUE KEY `uq_users_school_id` (`school_id`)',
  'SELECT 1'
);
PREPARE auth_statement FROM @auth_ddl;
EXECUTE auth_statement;
DEALLOCATE PREPARE auth_statement;

SET @auth_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_user_role'),
  'ALTER TABLE `users` ADD KEY `idx_users_user_role` (`user_role`)',
  'SELECT 1'
);
PREPARE auth_statement FROM @auth_ddl;
EXECUTE auth_statement;
DEALLOCATE PREPARE auth_statement;

