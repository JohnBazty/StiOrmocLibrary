-- ============================================================================
-- SmartLib cross-portal circulation and reservation synchronization
-- MySQL 5.6 compatible | additive | InnoDB | utf8
--
-- The normalized titles/physical_copies tables remain authoritative. Legacy
-- material_id columns are retained as compatibility bridges while circulation
-- gains direct title/copy references for reliable queue and history queries.
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

-- Reconcile normalized login accounts with the legacy operational user key
-- used by circulation foreign keys. Existing matching users are linked first;
-- otherwise a non-destructive operational profile is created from account data.
UPDATE `accounts` a
INNER JOIN `users` u ON u.`school_id` = a.`school_id`
SET a.`user_id` = u.`user_id`
WHERE a.`user_id` IS NULL;

INSERT INTO `users`
  (`role_id`, `user_role`, `institutional_id`, `school_id`, `full_name`, `email`,
   `password_hash`, `educational_level`, `account_status`, `created_at`)
SELECT
  ro.`role_id`, a.`role`, a.`school_id`, a.`school_id`,
  COALESCE(NULLIF(TRIM(CONCAT(COALESCE(sp.`first_name`, ''), ' ', COALESCE(sp.`last_name`, ''))), ''), a.`school_id`),
  CONCAT('account.', a.`account_id`, '@ormoc.sti.edu.ph'), a.`password_hash`,
  IF(a.`role` = 'Student', 'College', NULL),
  IF(a.`account_status` = 'Active', 'Active', 'Deactivated'), a.`created_at`
FROM `accounts` a
INNER JOIN `roles` ro ON ro.`role_name` = CASE a.`role`
  WHEN 'Admin' THEN 'System Administrator' ELSE a.`role` END
LEFT JOIN `student_profiles` sp ON sp.`account_id` = a.`account_id`
LEFT JOIN `users` existing ON existing.`school_id` = a.`school_id`
WHERE a.`user_id` IS NULL AND existing.`user_id` IS NULL;

UPDATE `accounts` a
INNER JOIN `users` u ON u.`school_id` = a.`school_id`
SET a.`user_id` = u.`user_id`
WHERE a.`user_id` IS NULL;

-- Link reservations directly to the normalized title and assigned copy.
SET @smartlib_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'book_title_id'),
  'ALTER TABLE `reservations` ADD COLUMN `book_title_id` BIGINT UNSIGNED DEFAULT NULL AFTER `material_id`',
  'SELECT 1'
);
PREPARE smartlib_statement FROM @smartlib_ddl;
EXECUTE smartlib_statement;
DEALLOCATE PREPARE smartlib_statement;

SET @smartlib_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'assigned_physical_copy_id'),
  'ALTER TABLE `reservations` ADD COLUMN `assigned_physical_copy_id` BIGINT UNSIGNED DEFAULT NULL AFTER `accession_id`',
  'SELECT 1'
);
PREPARE smartlib_statement FROM @smartlib_ddl;
EXECUTE smartlib_statement;
DEALLOCATE PREPARE smartlib_statement;

UPDATE `reservations` r
LEFT JOIN `physical_copies` requested ON requested.`material_id` = r.`material_id`
LEFT JOIN `physical_copies` assigned ON assigned.`material_id` = r.`accession_id`
SET r.`book_title_id` = COALESCE(r.`book_title_id`, requested.`title_id`),
    r.`assigned_physical_copy_id` = COALESCE(r.`assigned_physical_copy_id`, assigned.`physical_copy_id`)
WHERE r.`book_title_id` IS NULL OR r.`assigned_physical_copy_id` IS NULL;

SET @smartlib_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND INDEX_NAME = 'idx_reservation_title_queue'),
  'ALTER TABLE `reservations` ADD KEY `idx_reservation_title_queue` (`book_title_id`, `reservation_status`, `queue_position`, `reserved_at`)',
  'SELECT 1'
);
PREPARE smartlib_statement FROM @smartlib_ddl;
EXECUTE smartlib_statement;
DEALLOCATE PREPARE smartlib_statement;

SET @smartlib_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND INDEX_NAME = 'idx_reservation_assigned_copy'),
  'ALTER TABLE `reservations` ADD KEY `idx_reservation_assigned_copy` (`assigned_physical_copy_id`, `reservation_status`)',
  'SELECT 1'
);
PREPARE smartlib_statement FROM @smartlib_ddl;
EXECUTE smartlib_statement;
DEALLOCATE PREPARE smartlib_statement;

SET @smartlib_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND CONSTRAINT_NAME = 'fk_reservations_book_title'),
  'ALTER TABLE `reservations` ADD CONSTRAINT `fk_reservations_book_title` FOREIGN KEY (`book_title_id`) REFERENCES `titles` (`title_id`) ON UPDATE CASCADE ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE smartlib_statement FROM @smartlib_ddl;
EXECUTE smartlib_statement;
DEALLOCATE PREPARE smartlib_statement;

SET @smartlib_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND CONSTRAINT_NAME = 'fk_reservations_assigned_copy'),
  'ALTER TABLE `reservations` ADD CONSTRAINT `fk_reservations_assigned_copy` FOREIGN KEY (`assigned_physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE smartlib_statement FROM @smartlib_ddl;
EXECUTE smartlib_statement;
DEALLOCATE PREPARE smartlib_statement;

-- Link borrow history to the accessioned copy without removing material_id.
SET @smartlib_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'borrow_transactions' AND COLUMN_NAME = 'physical_copy_id'),
  'ALTER TABLE `borrow_transactions` ADD COLUMN `physical_copy_id` BIGINT UNSIGNED DEFAULT NULL AFTER `material_id`',
  'SELECT 1'
);
PREPARE smartlib_statement FROM @smartlib_ddl;
EXECUTE smartlib_statement;
DEALLOCATE PREPARE smartlib_statement;

UPDATE `borrow_transactions` bt
INNER JOIN `physical_copies` pc ON pc.`material_id` = bt.`material_id`
SET bt.`physical_copy_id` = pc.`physical_copy_id`
WHERE bt.`physical_copy_id` IS NULL;

SET @smartlib_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'borrow_transactions' AND INDEX_NAME = 'idx_borrow_copy_status'),
  'ALTER TABLE `borrow_transactions` ADD KEY `idx_borrow_copy_status` (`physical_copy_id`, `transaction_status`)',
  'SELECT 1'
);
PREPARE smartlib_statement FROM @smartlib_ddl;
EXECUTE smartlib_statement;
DEALLOCATE PREPARE smartlib_statement;

SET @smartlib_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'borrow_transactions' AND CONSTRAINT_NAME = 'fk_borrow_physical_copy'),
  'ALTER TABLE `borrow_transactions` ADD CONSTRAINT `fk_borrow_physical_copy` FOREIGN KEY (`physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`) ON UPDATE CASCADE ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE smartlib_statement FROM @smartlib_ddl;
EXECUTE smartlib_statement;
DEALLOCATE PREPARE smartlib_statement;

-- Campus closures are consulted by the next-operating-day due-date builder.
CREATE TABLE IF NOT EXISTS `library_closed_days` (
  `closed_date` DATE NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `created_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`closed_date`),
  KEY `idx_library_closed_days_creator` (`created_by_user_id`),
  CONSTRAINT `fk_library_closed_days_creator`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Shared administrative event inbox. Operational mutations append here in
-- the same transaction as their reservation/borrow/return state changes.
CREATE TABLE IF NOT EXISTS `admin_notifications` (
  `admin_notification_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_type` ENUM('reservation_requested','reservation_cancelled','checkout_confirmed','return_completed','overdue_detected') NOT NULL,
  `actor_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `reservation_id` BIGINT UNSIGNED DEFAULT NULL,
  `borrow_transaction_id` BIGINT UNSIGNED DEFAULT NULL,
  `book_title_id` BIGINT UNSIGNED DEFAULT NULL,
  `message_title` VARCHAR(150) NOT NULL,
  `message_body` VARCHAR(500) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_notification_id`),
  KEY `idx_admin_notifications_created` (`created_at`, `admin_notification_id`),
  KEY `idx_admin_notifications_event_created` (`event_type`, `created_at`),
  KEY `idx_admin_notifications_reservation` (`reservation_id`),
  KEY `idx_admin_notifications_borrow` (`borrow_transaction_id`),
  CONSTRAINT `fk_admin_notifications_actor`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_admin_notifications_reservation`
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`reservation_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_admin_notifications_borrow`
    FOREIGN KEY (`borrow_transaction_id`) REFERENCES `borrow_transactions` (`transaction_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_admin_notifications_title`
    FOREIGN KEY (`book_title_id`) REFERENCES `titles` (`title_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Compatibility views satisfy integrations that use the requested names while
-- keeping normalized source tables as the sole writable records.
CREATE OR REPLACE ALGORITHM=UNDEFINED VIEW `book_titles` AS
SELECT
  t.`title_id` AS `id`,
  t.`title`,
  GROUP_CONCAT(DISTINCT a.`author_name` ORDER BY a.`author_order` SEPARATOR ', ') AS `author`,
  t.`isbn`,
  t.`publisher`,
  t.`publication_year`,
  t.`category_id`,
  COALESCE(MIN(pc.`shelf_location`), t.`call_number`) AS `shelf_location`
FROM `titles` t
LEFT JOIN `authors` a ON a.`title_id` = t.`title_id`
LEFT JOIN `physical_copies` pc ON pc.`title_id` = t.`title_id` AND pc.`lifecycle_status` = 'Active'
WHERE t.`record_type` = 'Book' AND t.`lifecycle_status` = 'Active'
GROUP BY t.`title_id`, t.`title`, t.`isbn`, t.`publisher`, t.`publication_year`, t.`category_id`, t.`call_number`;

CREATE OR REPLACE ALGORITHM=MERGE VIEW `borrow_records` AS
SELECT
  bt.`transaction_id` AS `id`,
  bt.`user_id`,
  bt.`physical_copy_id`,
  CASE bt.`transaction_status`
    WHEN 'Borrowed' THEN 'active'
    WHEN 'Overdue' THEN 'overdue'
    WHEN 'Returned' THEN 'returned'
    ELSE 'active'
  END AS `borrow_status`,
  bt.`borrowed_at` AS `borrow_date`,
  bt.`due_at` AS `due_date`,
  bt.`returned_at` AS `return_date`,
  bt.`created_at`,
  bt.`updated_at`
FROM `borrow_transactions` bt;
