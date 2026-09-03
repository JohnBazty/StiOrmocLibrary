-- Phase 2: cash-only printing queue and manually recorded bottle/ream supplies.
-- MySQL 5.6 compatible. Percentage ink columns are retained for backward compatibility
-- but the application now treats available_bottles as the authoritative stock value.
SET NAMES utf8;
SET @database_name := DATABASE();

ALTER TABLE `print_requests`
  MODIFY `job_status` ENUM('Pending','Printing','Ready for Pickup','Completed','Cancelled') NOT NULL DEFAULT 'Pending';

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='printer_id')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `printer_id` INT UNSIGNED NULL AFTER `processed_by_user_id`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='paper_size')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `paper_size` ENUM(''Short'',''A4'',''Long'') NOT NULL DEFAULT ''A4'' AFTER `print_type`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='page_count')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `page_count` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `paper_size`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='total_sheets')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `total_sheets` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `page_count`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='payment_status')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `payment_status` ENUM(''Unpaid'',''Paid'') NOT NULL DEFAULT ''Unpaid'' AFTER `calculated_cost`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='paid_at')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `paid_at` DATETIME NULL AFTER `payment_status`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='started_at')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `started_at` DATETIME NULL AFTER `updated_at`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='ready_at')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `ready_at` DATETIME NULL AFTER `started_at`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='cancelled_at')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `cancelled_at` DATETIME NULL AFTER `completed_at`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='cancelled_reason')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `cancelled_reason` VARCHAR(255) NULL AFTER `cancelled_at`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND COLUMN_NAME='row_version')=0,
  'ALTER TABLE `print_requests` ADD COLUMN `row_version` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `cancelled_reason`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND INDEX_NAME='idx_print_payment_queue')=0,
  'ALTER TABLE `print_requests` ADD KEY `idx_print_payment_queue` (`payment_status`,`job_status`,`created_at`)', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND INDEX_NAME='idx_print_printer_queue')=0,
  'ALTER TABLE `print_requests` ADD KEY `idx_print_printer_queue` (`printer_id`,`job_status`,`created_at`)', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=@database_name AND TABLE_NAME='print_requests' AND CONSTRAINT_NAME='fk_print_printer')=0,
  'ALTER TABLE `print_requests` ADD CONSTRAINT `fk_print_printer` FOREIGN KEY (`printer_id`) REFERENCES `printers` (`printer_id`) ON UPDATE CASCADE ON DELETE SET NULL', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='printers' AND COLUMN_NAME='operational_status')=0,
  'ALTER TABLE `printers` ADD COLUMN `operational_status` ENUM(''Online'',''Offline'',''Unavailable'') NOT NULL DEFAULT ''Online'' AFTER `is_active`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='printers' AND COLUMN_NAME='status_reason')=0,
  'ALTER TABLE `printers` ADD COLUMN `status_reason` VARCHAR(255) NULL AFTER `operational_status`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='printers' AND COLUMN_NAME='updated_at')=0,
  'ALTER TABLE `printers` ADD COLUMN `updated_at` DATETIME NULL AFTER `created_at`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='ink_repository' AND COLUMN_NAME='available_bottles')=0,
  'ALTER TABLE `ink_repository` ADD COLUMN `available_bottles` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `color_variation`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='ink_repository' AND COLUMN_NAME='low_stock_threshold_bottles')=0,
  'ALTER TABLE `ink_repository` ADD COLUMN `low_stock_threshold_bottles` INT UNSIGNED NOT NULL DEFAULT 2 AFTER `available_bottles`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='ink_repository' AND COLUMN_NAME='cost_per_bottle')=0,
  'ALTER TABLE `ink_repository` ADD COLUMN `cost_per_bottle` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00 AFTER `low_stock_threshold_bottles`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

CREATE TABLE IF NOT EXISTS `print_pricing_rules` (
  `pricing_rule_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `print_type` ENUM('Colored','Monochrome') NOT NULL,
  `paper_size` ENUM('Short','A4','Long') NOT NULL,
  `price_per_page` DECIMAL(10,2) UNSIGNED NOT NULL,
  `is_active` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`pricing_rule_id`),
  UNIQUE KEY `uq_print_pricing_type_size` (`print_type`,`paper_size`),
  KEY `idx_print_pricing_active` (`is_active`,`print_type`,`paper_size`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `print_pricing_rules` (`print_type`,`paper_size`,`price_per_page`) VALUES
  ('Monochrome','Short',2.00),('Monochrome','A4',2.00),('Monochrome','Long',3.00),
  ('Colored','Short',5.00),('Colored','A4',5.00),('Colored','Long',7.00);

CREATE TABLE IF NOT EXISTS `print_status_history` (
  `print_status_history_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_id` BIGINT UNSIGNED NOT NULL,
  `from_status` VARCHAR(30) NULL,
  `to_status` VARCHAR(30) NOT NULL,
  `changed_by_user_id` BIGINT UNSIGNED NULL,
  `reason` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`print_status_history_id`),
  KEY `idx_print_history_request_date` (`request_id`,`created_at`),
  CONSTRAINT `fk_print_history_request` FOREIGN KEY (`request_id`) REFERENCES `print_requests` (`request_id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_print_history_user` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `print_cash_payments` (
  `print_cash_payment_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_id` BIGINT UNSIGNED NOT NULL,
  `amount_paid` DECIMAL(10,2) UNSIGNED NOT NULL,
  `received_by_user_id` BIGINT UNSIGNED NULL,
  `received_at` DATETIME NOT NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`print_cash_payment_id`),
  UNIQUE KEY `uq_print_cash_request` (`request_id`),
  KEY `idx_print_cash_received_date` (`received_by_user_id`,`received_at`),
  CONSTRAINT `fk_print_cash_request` FOREIGN KEY (`request_id`) REFERENCES `print_requests` (`request_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_print_cash_receiver` FOREIGN KEY (`received_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `ink_stock_movements` (
  `ink_stock_movement_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ink_id` INT UNSIGNED NOT NULL,
  `movement_type` ENUM('Restock','Issued','Adjustment','Reversal') NOT NULL,
  `quantity_bottles` INT UNSIGNED NOT NULL,
  `expense_amount` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `recorded_by_user_id` BIGINT UNSIGNED NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ink_stock_movement_id`),
  KEY `idx_ink_movement_stock_date` (`ink_id`,`created_at`),
  KEY `idx_ink_movement_recorder_date` (`recorded_by_user_id`,`created_at`),
  CONSTRAINT `fk_ink_movement_stock` FOREIGN KEY (`ink_id`) REFERENCES `ink_repository` (`ink_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_ink_movement_recorder` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `paper_stock_movements` (
  `paper_stock_movement_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `paper_stock_id` INT UNSIGNED NOT NULL,
  `print_request_id` BIGINT UNSIGNED NULL,
  `movement_type` ENUM('Restock','Issued','Adjustment','Reversal') NOT NULL,
  `quantity_reams` DECIMAL(10,4) UNSIGNED NOT NULL,
  `expense_amount` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `recorded_by_user_id` BIGINT UNSIGNED NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`paper_stock_movement_id`),
  UNIQUE KEY `uq_paper_movement_request_issue` (`print_request_id`,`movement_type`),
  KEY `idx_paper_movement_stock_date` (`paper_stock_id`,`created_at`),
  CONSTRAINT `fk_paper_movement_stock` FOREIGN KEY (`paper_stock_id`) REFERENCES `bond_paper_stocks` (`paper_stock_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_paper_movement_request` FOREIGN KEY (`print_request_id`) REFERENCES `print_requests` (`request_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_paper_movement_recorder` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
