-- Printing-only digital receipts for counter cash payments.
-- These records are intentionally separate from fine_payment_receipts and clearance.

CREATE TABLE IF NOT EXISTS `print_payment_receipts` (
  `print_receipt_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `print_cash_payment_id` BIGINT UNSIGNED NOT NULL,
  `request_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `receipt_number` VARCHAR(32) NOT NULL,
  `verification_code` VARCHAR(16) NOT NULL,
  `receipt_status` ENUM('Issued','Reversed') NOT NULL DEFAULT 'Issued',
  `student_name_snapshot` VARCHAR(150) NOT NULL,
  `school_id_snapshot` VARCHAR(30) NOT NULL,
  `file_name_snapshot` VARCHAR(255) NOT NULL,
  `page_count_snapshot` INT UNSIGNED NOT NULL,
  `copies_snapshot` SMALLINT UNSIGNED NOT NULL,
  `total_sheets_snapshot` INT UNSIGNED NOT NULL,
  `print_type_snapshot` ENUM('Colored','Monochrome') NOT NULL,
  `paper_size_snapshot` ENUM('Short','A4','Long') NOT NULL,
  `amount_received` DECIMAL(10,2) UNSIGNED NOT NULL,
  `payment_method` ENUM('Cash') NOT NULL DEFAULT 'Cash',
  `received_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `received_by_name_snapshot` VARCHAR(150) NOT NULL,
  `received_at` DATETIME NOT NULL,
  `reversed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `reversed_at` DATETIME DEFAULT NULL,
  `reversal_reason` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`print_receipt_id`),
  UNIQUE KEY `uq_print_receipt_payment` (`print_cash_payment_id`),
  UNIQUE KEY `uq_print_receipt_request` (`request_id`),
  UNIQUE KEY `uq_print_receipt_number` (`receipt_number`),
  UNIQUE KEY `uq_print_receipt_verification` (`verification_code`),
  KEY `idx_print_receipt_user_date` (`user_id`,`received_at`),
  KEY `idx_print_receipt_status_date` (`receipt_status`,`received_at`),
  CONSTRAINT `fk_print_receipt_payment` FOREIGN KEY (`print_cash_payment_id`) REFERENCES `print_cash_payments` (`print_cash_payment_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_print_receipt_request` FOREIGN KEY (`request_id`) REFERENCES `print_requests` (`request_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_print_receipt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_print_receipt_receiver` FOREIGN KEY (`received_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_print_receipt_reverser` FOREIGN KEY (`reversed_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Give existing paid printing transactions their own permanent printing receipts.
INSERT IGNORE INTO `print_payment_receipts` (
  `print_cash_payment_id`,`request_id`,`user_id`,`receipt_number`,`verification_code`,
  `student_name_snapshot`,`school_id_snapshot`,`file_name_snapshot`,`page_count_snapshot`,
  `copies_snapshot`,`total_sheets_snapshot`,`print_type_snapshot`,`paper_size_snapshot`,
  `amount_received`,`payment_method`,`received_by_user_id`,`received_by_name_snapshot`,`received_at`
)
SELECT
  p.`print_cash_payment_id`,p.`request_id`,pr.`user_id`,
  CONCAT('PR-',DATE_FORMAT(p.`received_at`,'%Y%m%d'),'-',LPAD(p.`print_cash_payment_id`,6,'0')),
  UPPER(SUBSTRING(SHA2(CONCAT('PRINT-',p.`print_cash_payment_id`,'-',pr.`user_id`,'-',p.`received_at`),256),1,16)),
  u.`full_name`,u.`school_id`,pr.`file_name`,pr.`page_count`,pr.`number_of_copies`,pr.`total_sheets`,
  pr.`print_type`,pr.`paper_size`,p.`amount_paid`,'Cash',p.`received_by_user_id`,
  COALESCE(staff.`full_name`,'Authorized library personnel'),p.`received_at`
FROM `print_cash_payments` p
INNER JOIN `print_requests` pr ON pr.`request_id`=p.`request_id`
INNER JOIN `users` u ON u.`user_id`=pr.`user_id`
LEFT JOIN `users` staff ON staff.`user_id`=p.`received_by_user_id`;
