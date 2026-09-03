-- Cash-only fine management, append-only payment allocations, PDF receipts,
-- and auditable adjustments. GCash/online payment and CSV export are excluded.

ALTER TABLE `fines`
  MODIFY COLUMN `transaction_id` BIGINT UNSIGNED NULL,
  MODIFY COLUMN `payment_status`
    ENUM('Accruing','Unpaid','Partially Paid','Paid','Waived','Voided') NOT NULL DEFAULT 'Unpaid',
  ADD COLUMN `fine_type` ENUM('Overdue','Infraction') NOT NULL DEFAULT 'Overdue' AFTER `user_id`,
  ADD COLUMN `maximum_cap_applied` DECIMAL(10,2) UNSIGNED NULL AFTER `rate_applied`,
  ADD COLUMN `finalized_at` DATETIME NULL AFTER `applied_date`,
  ADD COLUMN `updated_at` DATETIME NULL AFTER `notes`,
  ADD KEY `idx_fines_type_status_date` (`fine_type`,`payment_status`,`applied_date`);

CREATE TABLE IF NOT EXISTS `fine_policy_versions` (
  `fine_policy_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hourly_rate` DECIMAL(10,2) UNSIGNED NOT NULL,
  `daily_rate` DECIMAL(10,2) UNSIGNED NOT NULL,
  `maximum_penalty` DECIMAL(10,2) UNSIGNED NOT NULL,
  `effective_from` DATETIME NOT NULL,
  `effective_until` DATETIME NULL,
  `is_active` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_policy_id`),
  KEY `idx_fine_policy_active_effective` (`is_active`,`effective_from`,`effective_until`),
  CONSTRAINT `fk_fine_policy_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO `fine_policy_versions`
  (`hourly_rate`,`daily_rate`,`maximum_penalty`,`effective_from`,`is_active`)
SELECT 2.00,10.00,500.00,'2026-01-01 00:00:00',1
WHERE NOT EXISTS (SELECT 1 FROM `fine_policy_versions`);

CREATE TABLE IF NOT EXISTS `fine_infractions` (
  `fine_infraction_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fine_id` BIGINT UNSIGNED NOT NULL,
  `category` VARCHAR(80) NOT NULL,
  `incident_at` DATETIME NOT NULL,
  `incident_location` VARCHAR(150) NULL,
  `details` VARCHAR(500) NOT NULL,
  `issued_by_user_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_infraction_id`),
  UNIQUE KEY `uq_fine_infraction_fine` (`fine_id`),
  KEY `idx_fine_infraction_incident` (`incident_at`,`category`),
  CONSTRAINT `fk_fine_infraction_fine` FOREIGN KEY (`fine_id`) REFERENCES `fines` (`fine_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_infraction_issuer` FOREIGN KEY (`issued_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `fine_payment_receipts` (
  `fine_payment_receipt_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `receipt_number` VARCHAR(32) NULL,
  `request_key` VARCHAR(64) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `amount_received` DECIMAL(10,2) UNSIGNED NOT NULL,
  `payment_method` ENUM('Cash') NOT NULL DEFAULT 'Cash',
  `received_by_user_id` BIGINT UNSIGNED NOT NULL,
  `received_at` DATETIME NOT NULL,
  `receipt_status` ENUM('Issued','Reversed') NOT NULL DEFAULT 'Issued',
  `reversed_by_user_id` BIGINT UNSIGNED NULL,
  `reversed_at` DATETIME NULL,
  `reversal_reason` VARCHAR(500) NULL,
  `notes` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_payment_receipt_id`),
  UNIQUE KEY `uq_fine_receipt_number` (`receipt_number`),
  UNIQUE KEY `uq_fine_receipt_request` (`request_key`),
  KEY `idx_fine_receipt_user_date` (`user_id`,`received_at`),
  KEY `idx_fine_receipt_status_date` (`receipt_status`,`received_at`),
  CONSTRAINT `fk_fine_receipt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_receipt_receiver` FOREIGN KEY (`received_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_receipt_reverser` FOREIGN KEY (`reversed_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `fine_payment_allocations` (
  `fine_payment_allocation_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fine_payment_receipt_id` BIGINT UNSIGNED NOT NULL,
  `fine_id` BIGINT UNSIGNED NULL,
  `lost_book_report_id` BIGINT UNSIGNED NULL,
  `amount_allocated` DECIMAL(10,2) UNSIGNED NOT NULL,
  `balance_before` DECIMAL(10,2) UNSIGNED NOT NULL,
  `balance_after` DECIMAL(10,2) UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_payment_allocation_id`),
  UNIQUE KEY `uq_receipt_fine_allocation` (`fine_payment_receipt_id`,`fine_id`),
  UNIQUE KEY `uq_receipt_lost_allocation` (`fine_payment_receipt_id`,`lost_book_report_id`),
  KEY `idx_fine_allocation_fine` (`fine_id`,`fine_payment_receipt_id`),
  KEY `idx_fine_allocation_lost` (`lost_book_report_id`,`fine_payment_receipt_id`),
  CONSTRAINT `fk_fine_allocation_receipt` FOREIGN KEY (`fine_payment_receipt_id`) REFERENCES `fine_payment_receipts` (`fine_payment_receipt_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_allocation_fine` FOREIGN KEY (`fine_id`) REFERENCES `fines` (`fine_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_allocation_lost` FOREIGN KEY (`lost_book_report_id`) REFERENCES `lost_book_reports` (`lost_book_report_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `fine_adjustments` (
  `fine_adjustment_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fine_id` BIGINT UNSIGNED NOT NULL,
  `adjustment_type` ENUM('Waiver','Reduction','Void') NOT NULL,
  `amount_adjusted` DECIMAL(10,2) UNSIGNED NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `adjusted_by_user_id` BIGINT UNSIGNED NOT NULL,
  `adjusted_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_adjustment_id`),
  KEY `idx_fine_adjustment_fine_date` (`fine_id`,`adjusted_at`),
  KEY `idx_fine_adjustment_actor_date` (`adjusted_by_user_id`,`adjusted_at`),
  CONSTRAINT `fk_fine_adjustment_fine` FOREIGN KEY (`fine_id`) REFERENCES `fines` (`fine_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_adjustment_actor` FOREIGN KEY (`adjusted_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `notifications`
  MODIFY COLUMN `trigger_type`
    ENUM('Due Date','Overdue Penalty','Reservation Arrival','Printing Update','Library Schedule','Announcement','Lost Book','Fine') NOT NULL;
