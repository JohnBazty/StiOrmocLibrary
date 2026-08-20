-- ============================================================================
-- STI Ormoc Smart Library - normalized accounts and student profiles
-- MySQL 5.6 compatible | additive | InnoDB | utf8
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

CREATE TABLE IF NOT EXISTS `accounts` (
  `account_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Backward-compatible link to legacy users.user_id',
  `school_id` VARCHAR(50) NOT NULL,
  `contact_number` VARCHAR(30) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('Student', 'Faculty', 'Librarian', 'Admin') NOT NULL,
  `account_status` ENUM('Active', 'Deactivated', 'Archived') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`account_id`),
  UNIQUE KEY `uq_accounts_school_id` (`school_id`),
  UNIQUE KEY `uq_accounts_user_id` (`user_id`),
  KEY `idx_accounts_role_status` (`role`, `account_status`),
  KEY `idx_accounts_status` (`account_status`),
  CONSTRAINT `fk_accounts_legacy_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Backfill authentication identities without changing the meaning of users.
INSERT INTO `accounts`
  (`user_id`, `school_id`, `contact_number`, `password_hash`, `role`, `account_status`)
SELECT
  u.`user_id`, u.`school_id`, NULL, u.`password_hash`, u.`user_role`,
  CASE u.`account_status` WHEN 'Active' THEN 'Active' ELSE 'Deactivated' END
FROM `users` AS u
ON DUPLICATE KEY UPDATE
  `accounts`.`user_id` = IFNULL(`accounts`.`user_id`, VALUES(`user_id`));

CREATE TABLE IF NOT EXISTS `student_profiles` (
  `student_profile_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id` BIGINT UNSIGNED NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `program_strand` VARCHAR(150) NOT NULL,
  `year_grade_level` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`student_profile_id`),
  UNIQUE KEY `uq_student_profiles_account` (`account_id`),
  KEY `idx_student_profiles_name` (`last_name`, `first_name`),
  KEY `idx_student_profiles_program_year` (`program_strand`, `year_grade_level`),
  CONSTRAINT `fk_student_profiles_account`
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
