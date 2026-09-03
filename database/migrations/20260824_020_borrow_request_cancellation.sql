-- Cross-portal cancellation for pending online borrow requests.
-- MySQL 5.6 / InnoDB / utf8 compatible.

SET @database_name := DATABASE();

ALTER TABLE `borrow_transactions`
  MODIFY COLUMN `transaction_status`
    ENUM('Pending','Borrowed','Returned','Overdue','Cancelled') NOT NULL DEFAULT 'Pending';

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'borrow_transactions' AND COLUMN_NAME = 'cancelled_at') = 0,
  'ALTER TABLE `borrow_transactions` ADD COLUMN `cancelled_at` DATETIME DEFAULT NULL AFTER `returned_at`',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'borrow_transactions' AND COLUMN_NAME = 'cancelled_by_user_id') = 0,
  'ALTER TABLE `borrow_transactions` ADD COLUMN `cancelled_by_user_id` BIGINT UNSIGNED DEFAULT NULL AFTER `cancelled_at`',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'borrow_transactions' AND COLUMN_NAME = 'cancellation_reason') = 0,
  'ALTER TABLE `borrow_transactions` ADD COLUMN `cancellation_reason` VARCHAR(255) DEFAULT NULL AFTER `cancelled_by_user_id`',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'borrow_transactions' AND INDEX_NAME = 'idx_borrow_cancelled_by') = 0,
  'ALTER TABLE `borrow_transactions` ADD KEY `idx_borrow_cancelled_by` (`cancelled_by_user_id`, `cancelled_at`)',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = @database_name AND TABLE_NAME = 'borrow_transactions' AND CONSTRAINT_NAME = 'fk_borrow_cancelled_by') = 0,
  'ALTER TABLE `borrow_transactions` ADD CONSTRAINT `fk_borrow_cancelled_by` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

ALTER TABLE `admin_notifications`
  MODIFY COLUMN `event_type`
    ENUM('reservation_requested','reservation_cancelled','borrow_request_submitted','borrow_request_cancelled','checkout_confirmed','return_completed','overdue_detected') NOT NULL;

CREATE OR REPLACE ALGORITHM=MERGE VIEW `borrow_records` AS
SELECT
  bt.`transaction_id` AS `id`,
  bt.`request_group_id`,
  bt.`user_id`,
  bt.`physical_copy_id`,
  CASE bt.`transaction_status`
    WHEN 'Pending' THEN 'pending_claim'
    WHEN 'Borrowed' THEN 'active'
    WHEN 'Overdue' THEN 'overdue'
    WHEN 'Returned' THEN 'returned'
    WHEN 'Cancelled' THEN 'cancelled'
  END AS `borrow_status`,
  bt.`borrowed_at` AS `borrow_date`,
  bt.`due_at` AS `due_date`,
  bt.`returned_at` AS `return_date`,
  bt.`cancelled_at`,
  bt.`created_at`,
  bt.`updated_at`
FROM `borrow_transactions` bt;
