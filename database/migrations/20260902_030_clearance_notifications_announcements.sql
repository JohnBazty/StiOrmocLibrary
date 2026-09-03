-- Live clearance, lost-book replacement charges, notification delivery, and
-- Admin-only campus announcements. Existing operational ledgers remain the
-- authority; clearance_statuses continues as a refreshable cache only.

ALTER TABLE `titles`
  ADD COLUMN `purchase_price` DECIMAL(10,2) UNSIGNED NULL AFTER `publisher`;

ALTER TABLE `borrow_transactions`
  ADD COLUMN `reported_lost_at` DATETIME NULL AFTER `returned_at`,
  ADD COLUMN `lost_confirmed_at` DATETIME NULL AFTER `reported_lost_at`,
  ADD KEY `idx_borrow_lost_status` (`user_id`, `lost_confirmed_at`, `transaction_status`);

ALTER TABLE `notifications`
  MODIFY COLUMN `trigger_type`
    ENUM('Due Date','Overdue Penalty','Reservation Arrival','Printing Update','Library Schedule','Announcement','Lost Book') NOT NULL,
  ADD COLUMN `source_type` VARCHAR(40) NULL AFTER `trigger_type`,
  ADD COLUMN `source_id` BIGINT UNSIGNED NULL AFTER `source_type`,
  ADD COLUMN `action_path` VARCHAR(255) NULL AFTER `source_id`,
  ADD COLUMN `priority` ENUM('Normal','Important','Urgent') NOT NULL DEFAULT 'Normal' AFTER `action_path`,
  ADD COLUMN `dedupe_key` VARCHAR(191) NULL AFTER `priority`,
  ADD COLUMN `scheduled_for` DATETIME NULL AFTER `dedupe_key`,
  ADD COLUMN `delivered_at` DATETIME NULL AFTER `scheduled_for`,
  ADD COLUMN `expires_at` DATETIME NULL AFTER `delivered_at`,
  ADD UNIQUE KEY `uq_notification_user_dedupe` (`user_id`, `dedupe_key`),
  ADD KEY `idx_notification_schedule` (`scheduled_for`, `delivered_at`),
  ADD KEY `idx_notification_source` (`source_type`, `source_id`);

ALTER TABLE `admin_notifications`
  MODIFY COLUMN `event_type`
    ENUM('reservation_requested','reservation_cancelled','borrow_request_submitted','borrow_request_cancelled',
         'checkout_confirmed','return_completed','overdue_detected','lost_book_reported','lost_book_confirmed') NOT NULL;

CREATE TABLE IF NOT EXISTS `clearance_overrides` (
  `clearance_override_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `override_status` ENUM('Cleared','Not Cleared') NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `applied_by_user_id` BIGINT UNSIGNED NOT NULL,
  `applied_at` DATETIME NOT NULL,
  `expires_at` DATETIME NULL,
  `revoked_by_user_id` BIGINT UNSIGNED NULL,
  `revoked_at` DATETIME NULL,
  `revocation_reason` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`clearance_override_id`),
  KEY `idx_clearance_override_user_active` (`user_id`, `revoked_at`, `expires_at`, `applied_at`),
  KEY `idx_clearance_override_applier` (`applied_by_user_id`, `applied_at`),
  CONSTRAINT `fk_clearance_override_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_clearance_override_applier` FOREIGN KEY (`applied_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_clearance_override_revoker` FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `lost_book_reports` (
  `lost_book_report_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `physical_copy_id` BIGINT UNSIGNED NULL,
  `report_status` ENUM('Pending','Confirmed','Rejected') NOT NULL DEFAULT 'Pending',
  `purchase_price_snapshot` DECIMAL(10,2) UNSIGNED NULL,
  `replacement_charge` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `payment_status` ENUM('Unpaid','Paid') NOT NULL DEFAULT 'Unpaid',
  `reported_at` DATETIME NOT NULL,
  `verified_by_user_id` BIGINT UNSIGNED NULL,
  `verified_at` DATETIME NULL,
  `staff_notes` VARCHAR(500) NULL,
  `paid_at` DATETIME NULL,
  `payment_recorded_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`lost_book_report_id`),
  UNIQUE KEY `uq_lost_book_transaction` (`transaction_id`),
  KEY `idx_lost_book_user_status` (`user_id`, `report_status`, `payment_status`),
  KEY `idx_lost_book_reported` (`reported_at`, `report_status`),
  CONSTRAINT `fk_lost_book_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `borrow_transactions` (`transaction_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_lost_book_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_lost_book_copy` FOREIGN KEY (`physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_lost_book_verifier` FOREIGN KEY (`verified_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_lost_book_payment_recorder` FOREIGN KEY (`payment_recorded_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `announcements` (
  `announcement_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(150) NOT NULL,
  `message_body` TEXT NOT NULL,
  `priority` ENUM('Normal','Important','Urgent') NOT NULL DEFAULT 'Normal',
  `announcement_status` ENUM('Draft','Scheduled','Published','Archived') NOT NULL DEFAULT 'Draft',
  `publish_at` DATETIME NULL,
  `expires_at` DATETIME NULL,
  `published_at` DATETIME NULL,
  `archived_at` DATETIME NULL,
  `created_by_user_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`announcement_id`),
  KEY `idx_announcement_status_publish` (`announcement_status`, `publish_at`),
  KEY `idx_announcement_creator` (`created_by_user_id`, `created_at`),
  CONSTRAINT `fk_announcement_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `announcement_revisions` (
  `announcement_revision_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `announcement_id` BIGINT UNSIGNED NOT NULL,
  `revision_number` INT UNSIGNED NOT NULL,
  `title_snapshot` VARCHAR(150) NOT NULL,
  `body_snapshot` TEXT NOT NULL,
  `priority_snapshot` ENUM('Normal','Important','Urgent') NOT NULL,
  `changed_by_user_id` BIGINT UNSIGNED NOT NULL,
  `change_reason` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`announcement_revision_id`),
  UNIQUE KEY `uq_announcement_revision` (`announcement_id`, `revision_number`),
  CONSTRAINT `fk_announcement_revision_parent` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`announcement_id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_announcement_revision_actor` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `library_operating_schedule` (
  `day_of_week` TINYINT UNSIGNED NOT NULL,
  `is_open` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  `opens_at` TIME NULL,
  `closes_at` TIME NULL,
  `updated_by_user_id` BIGINT UNSIGNED NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`day_of_week`),
  CONSTRAINT `fk_library_schedule_updater` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `library_operating_schedule` (`day_of_week`,`is_open`,`opens_at`,`closes_at`) VALUES
  (1,1,'07:00:00','17:00:00'),(2,1,'07:00:00','17:00:00'),(3,1,'07:00:00','17:00:00'),
  (4,1,'07:00:00','17:00:00'),(5,1,'07:00:00','17:00:00'),(6,1,'07:00:00','17:00:00'),
  (7,0,NULL,NULL);
