-- SmartLib book cart and pending-claim compatibility upgrade.
-- MySQL 5.6 / InnoDB / utf8 compatible and safe for the migration ledger.

SET @database_name := DATABASE();

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'borrow_transactions'
      AND COLUMN_NAME = 'request_group_id') = 0,
  'ALTER TABLE `borrow_transactions` ADD COLUMN `request_group_id` CHAR(36) DEFAULT NULL AFTER `physical_copy_id`',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'borrow_transactions'
      AND INDEX_NAME = 'idx_borrow_request_group') = 0,
  'ALTER TABLE `borrow_transactions` ADD KEY `idx_borrow_request_group` (`request_group_id`, `transaction_status`)',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'borrow_transactions'
      AND INDEX_NAME = 'idx_borrow_user_queue') = 0,
  'ALTER TABLE `borrow_transactions` ADD KEY `idx_borrow_user_queue` (`user_id`, `transaction_status`, `created_at`, `transaction_id`)',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- MySQL requires the full ENUM declaration when extending its allowed values.
ALTER TABLE `admin_notifications`
  MODIFY COLUMN `event_type`
    ENUM('reservation_requested','reservation_cancelled','borrow_request_submitted','checkout_confirmed','return_completed','overdue_detected') NOT NULL;

-- The writable authority remains borrow_transactions. This compatibility view
-- exposes the requested user-facing queue vocabulary without duplicating rows.
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
  END AS `borrow_status`,
  bt.`borrowed_at` AS `borrow_date`,
  bt.`due_at` AS `due_date`,
  bt.`returned_at` AS `return_date`,
  bt.`created_at`,
  bt.`updated_at`
FROM `borrow_transactions` bt;
