-- Circulation preflight warning override audit (append-only).
-- Does not alter borrow_transactions.

CREATE TABLE IF NOT EXISTS `circulation_override_events` (
  `override_event_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `borrow_transaction_id` BIGINT UNSIGNED NOT NULL,
  `borrower_user_id` BIGINT UNSIGNED NOT NULL,
  `physical_copy_id` BIGINT UNSIGNED NOT NULL,
  `approved_by_user_id` BIGINT UNSIGNED NOT NULL,
  `warning_codes` TEXT NOT NULL,
  `override_reason` VARCHAR(500) NOT NULL,
  `preflight_decision_id` VARCHAR(64) NOT NULL,
  `approved_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`override_event_id`),
  KEY `idx_circ_override_transaction` (`borrow_transaction_id`),
  KEY `idx_circ_override_borrower` (`borrower_user_id`, `approved_at`),
  KEY `idx_circ_override_staff` (`approved_by_user_id`, `approved_at`),
  KEY `idx_circ_override_approved_at` (`approved_at`),
  CONSTRAINT `fk_circ_override_transaction` FOREIGN KEY (`borrow_transaction_id`) REFERENCES `borrow_transactions` (`transaction_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_circ_override_borrower` FOREIGN KEY (`borrower_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_circ_override_copy` FOREIGN KEY (`physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_circ_override_approver` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
