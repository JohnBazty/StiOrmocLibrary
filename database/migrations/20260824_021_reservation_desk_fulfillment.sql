-- Reservation-to-counter-claim linkage for physical desk verification.
-- MySQL 5.6 / InnoDB / backward-safe and idempotent.

SET @database_name := DATABASE();

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'borrow_transactions' AND COLUMN_NAME = 'reservation_id') = 0,
  'ALTER TABLE `borrow_transactions` ADD COLUMN `reservation_id` BIGINT UNSIGNED DEFAULT NULL AFTER `physical_copy_id`',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'borrow_transactions' AND INDEX_NAME = 'uq_borrow_reservation') = 0,
  'ALTER TABLE `borrow_transactions` ADD UNIQUE KEY `uq_borrow_reservation` (`reservation_id`)',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = @database_name AND TABLE_NAME = 'borrow_transactions' AND CONSTRAINT_NAME = 'fk_borrow_reservation') = 0,
  'ALTER TABLE `borrow_transactions` ADD CONSTRAINT `fk_borrow_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`reservation_id`) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

CREATE OR REPLACE ALGORITHM=MERGE VIEW `borrow_records` AS
SELECT
  bt.`transaction_id` AS `id`,
  bt.`request_group_id`,
  bt.`reservation_id`,
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
