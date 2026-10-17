-- MySQL rollback reference only.
ALTER TABLE `print_payment_receipts` ADD COLUMN `document_label` VARCHAR(24) NULL;
ALTER TABLE `fine_payment_receipts` ADD COLUMN `document_label` VARCHAR(24) NULL;
UPDATE `print_payment_receipts` SET `document_label`='Legacy Receipt' WHERE `document_label` IS NULL;
UPDATE `fine_payment_receipts` SET `document_label`='Legacy Receipt' WHERE `document_label` IS NULL;
ALTER TABLE `print_payment_receipts` MODIFY COLUMN `document_label` VARCHAR(24) NOT NULL DEFAULT 'Payment Record';
ALTER TABLE `fine_payment_receipts` MODIFY COLUMN `document_label` VARCHAR(24) NOT NULL DEFAULT 'Payment Record';
CREATE TABLE IF NOT EXISTS `invoice_setup` (
  `settings_id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  `issuer_name` VARCHAR(255) NOT NULL DEFAULT '',
  `issuer_address` TEXT NOT NULL,
  `issuer_tin` VARCHAR(50) NOT NULL DEFAULT '',
  `authority_reference` VARCHAR(100) NOT NULL DEFAULT '',
  `serial_prefix` VARCHAR(20) NOT NULL DEFAULT 'INV-',
  `serial_start` BIGINT UNSIGNED NOT NULL DEFAULT 1,
  `serial_end` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `next_serial` BIGINT UNSIGNED NOT NULL DEFAULT 1,
  `print_classification` VARCHAR(30) NOT NULL DEFAULT 'Unclassified',
  `fine_classification` VARCHAR(30) NOT NULL DEFAULT 'Unclassified',
  `approved` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO `invoice_setup` (`settings_id`,`issuer_address`) VALUES (1,'');
CREATE TABLE IF NOT EXISTS `customer_invoices` (
  `invoice_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `source_type` VARCHAR(30) NOT NULL,
  `source_id` BIGINT UNSIGNED NOT NULL,
  `revision` INT UNSIGNED NOT NULL DEFAULT 1,
  `invoice_number` VARCHAR(50) NOT NULL,
  `issuer_name` VARCHAR(255) NOT NULL,
  `issuer_address` TEXT NOT NULL,
  `issuer_tin` VARCHAR(50) NOT NULL,
  `authority_reference` VARCHAR(100) NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_school_id` VARCHAR(60) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'Issued',
  `issued_by_user_id` BIGINT UNSIGNED NULL,
  `issued_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `voided_by_user_id` BIGINT UNSIGNED NULL,
  `voided_at` DATETIME NULL,
  `void_reason` VARCHAR(500) NULL,
  UNIQUE KEY `uq_customer_invoice_source_revision` (`source_type`,`source_id`,`revision`),
  UNIQUE KEY `uq_customer_invoice_number` (`invoice_number`),
  CONSTRAINT `fk_customer_invoice_issuer` FOREIGN KEY (`issued_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_customer_invoice_voider` FOREIGN KEY (`voided_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
