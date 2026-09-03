-- SmartLib printing stock audit separation (MySQL 5.6 compatible)
-- Whole unopened reams and ink bottles are now consumed manually by staff.
-- New service events use activity_code values LoadedIntoPrinter and OpenedReam.

SET @database_name := DATABASE();

SET @paper_unopened_missing := (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'bond_paper_stocks' AND COLUMN_NAME = 'unopened_reams'
);
SET @ddl := IF(@paper_unopened_missing,
  'ALTER TABLE `bond_paper_stocks` ADD COLUMN `unopened_reams` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `remaining_reams`',
  'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(@paper_unopened_missing,
  'UPDATE `bond_paper_stocks` SET `unopened_reams` = FLOOR(`remaining_reams`)',
  'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='ink_stock_movements' AND COLUMN_NAME='activity_code')=0,
  'ALTER TABLE `ink_stock_movements` ADD COLUMN `activity_code` VARCHAR(32) NOT NULL DEFAULT ''Legacy'' AFTER `movement_type`',
  'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='ink_stock_movements' AND COLUMN_NAME='balance_before')=0,
  'ALTER TABLE `ink_stock_movements` ADD COLUMN `balance_before` INT UNSIGNED NULL AFTER `expense_amount`, ADD COLUMN `balance_after` INT UNSIGNED NULL AFTER `balance_before`',
  'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='paper_stock_movements' AND COLUMN_NAME='activity_code')=0,
  'ALTER TABLE `paper_stock_movements` ADD COLUMN `activity_code` VARCHAR(32) NOT NULL DEFAULT ''Legacy'' AFTER `movement_type`',
  'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='paper_stock_movements' AND COLUMN_NAME='balance_before')=0,
  'ALTER TABLE `paper_stock_movements` ADD COLUMN `balance_before` DECIMAL(10,4) UNSIGNED NULL AFTER `expense_amount`, ADD COLUMN `balance_after` DECIMAL(10,4) UNSIGNED NULL AFTER `balance_before`',
  'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

UPDATE `ink_stock_movements`
SET `activity_code` = 'Restock'
WHERE `movement_type` = 'Restock' AND `activity_code` = 'Legacy';

UPDATE `paper_stock_movements`
SET `activity_code` = CASE
  WHEN `movement_type` = 'Restock' THEN 'Restock'
  WHEN `movement_type` = 'Issued' AND `print_request_id` IS NOT NULL THEN 'LegacyPrintAllocation'
  ELSE `activity_code`
END
WHERE `activity_code` = 'Legacy';

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='ink_stock_movements' AND INDEX_NAME='idx_ink_activity_date')=0,
  'ALTER TABLE `ink_stock_movements` ADD KEY `idx_ink_activity_date` (`activity_code`,`created_at`)',
  'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='paper_stock_movements' AND INDEX_NAME='idx_paper_activity_date')=0,
  'ALTER TABLE `paper_stock_movements` ADD KEY `idx_paper_activity_date` (`activity_code`,`created_at`)',
  'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
