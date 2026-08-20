-- STI Ormoc Smart Library
-- Adds the MySQL-backed express-session store to an existing installation.

USE `sti_ormoc_library`;

CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `session_id` VARCHAR(128) NOT NULL,
  `session_data` MEDIUMTEXT NOT NULL,
  `expires_at` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`session_id`),
  KEY `idx_auth_sessions_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

SELECT 'Authentication session migration completed.' AS `migration_status`;

