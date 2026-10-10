-- Loan renewals: track initial due date, renewal count, and immutable renewal requests.

ALTER TABLE `borrow_transactions`
  ADD COLUMN `initial_due_at` DATETIME DEFAULT NULL AFTER `due_at`,
  ADD COLUMN `renewal_count` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `initial_due_at`;

UPDATE `borrow_transactions`
   SET `initial_due_at` = `due_at`
 WHERE `due_at` IS NOT NULL
   AND `initial_due_at` IS NULL;

CREATE TABLE IF NOT EXISTS `loan_renewal_requests` (
  `renewal_request_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_key` VARCHAR(64) NOT NULL,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `renewal_number` INT UNSIGNED NOT NULL,
  `requester_account_id` BIGINT UNSIGNED DEFAULT NULL,
  `requester_user_id` BIGINT UNSIGNED NOT NULL,
  `decision_source` ENUM('System', 'Staff') NOT NULL,
  `deciding_staff_account_id` BIGINT UNSIGNED DEFAULT NULL,
  `deciding_staff_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `staff_note` VARCHAR(500) DEFAULT NULL,
  `status` ENUM('Approved', 'Rejected') NOT NULL,
  `decision_code` VARCHAR(80) NOT NULL,
  `decision_summary` VARCHAR(500) NOT NULL,
  `blocker_codes` TEXT DEFAULT NULL,
  `previous_due_at` DATETIME NOT NULL,
  `new_due_at` DATETIME DEFAULT NULL,
  `borrowing_policy_version_id` BIGINT UNSIGNED DEFAULT NULL,
  `requested_at` DATETIME NOT NULL,
  `decided_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`renewal_request_id`),
  UNIQUE KEY `uq_loan_renewal_request_key` (`request_key`),
  KEY `idx_loan_renewal_transaction` (`transaction_id`, `created_at`),
  KEY `idx_loan_renewal_requester` (`requester_user_id`, `created_at`),
  KEY `idx_loan_renewal_status` (`status`, `created_at`),
  CONSTRAINT `fk_loan_renewal_transaction`
    FOREIGN KEY (`transaction_id`) REFERENCES `borrow_transactions` (`transaction_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_loan_renewal_requester_user`
    FOREIGN KEY (`requester_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_loan_renewal_policy`
    FOREIGN KEY (`borrowing_policy_version_id`) REFERENCES `borrowing_policy_versions` (`borrowing_policy_version_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
