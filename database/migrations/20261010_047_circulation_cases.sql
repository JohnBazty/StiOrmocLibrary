-- Circulation cases for long-overdue investigation and damage intake.
-- Coordinates loans, inventory, fines, and lost reports without replacing them.

CREATE TABLE IF NOT EXISTS `circulation_cases` (
  `case_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `case_type` ENUM('Long Overdue', 'Damage') NOT NULL,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `physical_copy_id` BIGINT UNSIGNED NOT NULL,
  `borrower_user_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('Open', 'Assigned', 'Under Investigation', 'Resolved', 'Dismissed', 'Reopened') NOT NULL DEFAULT 'Open',
  `assigned_to_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `summary` VARCHAR(500) DEFAULT NULL,
  `opened_at` DATETIME NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `resolved_at` DATETIME DEFAULT NULL,
  `opened_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `resolved_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `policy_version_id` BIGINT UNSIGNED DEFAULT NULL,
  `threshold_days_snapshot` INT UNSIGNED DEFAULT NULL,
  `threshold_reached_at` DATETIME DEFAULT NULL,
  `baseline_condition_status` VARCHAR(40) DEFAULT NULL,
  `observed_condition_status` VARCHAR(40) DEFAULT NULL,
  `lost_book_report_id` BIGINT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`case_id`),
  UNIQUE KEY `uq_circulation_case_transaction_type` (`transaction_id`, `case_type`),
  KEY `idx_circulation_cases_worklist` (`case_type`, `status`, `opened_at`),
  KEY `idx_circulation_cases_borrower` (`borrower_user_id`),
  KEY `idx_circulation_cases_copy` (`physical_copy_id`),
  KEY `idx_circulation_cases_assignee` (`assigned_to_user_id`),
  CONSTRAINT `fk_circulation_cases_transaction`
    FOREIGN KEY (`transaction_id`) REFERENCES `borrow_transactions` (`transaction_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_circulation_cases_copy`
    FOREIGN KEY (`physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_circulation_cases_borrower`
    FOREIGN KEY (`borrower_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_circulation_cases_assignee`
    FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_circulation_cases_opened_by`
    FOREIGN KEY (`opened_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_circulation_cases_resolved_by`
    FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_circulation_cases_policy`
    FOREIGN KEY (`policy_version_id`) REFERENCES `borrowing_policy_versions` (`borrowing_policy_version_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_circulation_cases_lost_report`
    FOREIGN KEY (`lost_book_report_id`) REFERENCES `lost_book_reports` (`lost_book_report_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `circulation_case_events` (
  `event_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `case_id` BIGINT UNSIGNED NOT NULL,
  `event_type` ENUM(
    'Opened', 'Assigned', 'Contact Attempted', 'Note Added', 'Inspection Recorded',
    'Disposition Recorded', 'Linked Lost Report', 'Resolved', 'Dismissed', 'Reopened'
  ) NOT NULL,
  `actor_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `from_status` VARCHAR(40) DEFAULT NULL,
  `to_status` VARCHAR(40) DEFAULT NULL,
  `reason` VARCHAR(500) DEFAULT NULL,
  `notes` VARCHAR(1000) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_circulation_case_events_case` (`case_id`, `created_at`),
  CONSTRAINT `fk_circulation_case_events_case`
    FOREIGN KEY (`case_id`) REFERENCES `circulation_cases` (`case_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_circulation_case_events_actor`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `admin_notifications`
  MODIFY COLUMN `event_type`
    ENUM(
      'reservation_requested','reservation_cancelled','borrow_request_submitted','borrow_request_cancelled',
      'checkout_confirmed','return_completed','overdue_detected','lost_book_reported','lost_book_confirmed',
      'long_overdue_case_opened','damage_case_opened'
    ) NOT NULL;

ALTER TABLE `notifications`
  MODIFY COLUMN `trigger_type`
    ENUM(
      'Due Date', 'Overdue Penalty', 'Reservation Arrival', 'Printing Update', 'Library Schedule',
      'Announcement', 'Lost Book', 'Fine', 'Attendance', 'Circulation Case'
    ) NOT NULL;
