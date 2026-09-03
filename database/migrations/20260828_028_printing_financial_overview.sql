-- Printing supply unit costs and financial reporting indexes.
-- Restocking remains available whenever supplies are needed.
SET @database_name := DATABASE();

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='ink_stock_movements' AND COLUMN_NAME='unit_cost_per_bottle')=0,
  'ALTER TABLE `ink_stock_movements` ADD COLUMN `unit_cost_per_bottle` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00 AFTER `quantity_bottles`',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='paper_stock_movements' AND COLUMN_NAME='unit_cost_per_ream')=0,
  'ALTER TABLE `paper_stock_movements` ADD COLUMN `unit_cost_per_ream` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00 AFTER `quantity_reams`',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

UPDATE `ink_stock_movements`
SET `unit_cost_per_bottle` = ROUND(`expense_amount` / `quantity_bottles`, 2)
WHERE `unit_cost_per_bottle` = 0 AND `quantity_bottles` > 0 AND `expense_amount` > 0;

UPDATE `paper_stock_movements`
SET `unit_cost_per_ream` = ROUND(`expense_amount` / `quantity_reams`, 2)
WHERE `unit_cost_per_ream` = 0 AND `quantity_reams` > 0 AND `expense_amount` > 0;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='print_cash_payments' AND INDEX_NAME='idx_print_cash_received_at')=0,
  'ALTER TABLE `print_cash_payments` ADD KEY `idx_print_cash_received_at` (`received_at`)',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='ink_stock_movements' AND INDEX_NAME='idx_ink_movement_type_date')=0,
  'ALTER TABLE `ink_stock_movements` ADD KEY `idx_ink_movement_type_date` (`movement_type`,`created_at`)',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='paper_stock_movements' AND INDEX_NAME='idx_paper_movement_type_date')=0,
  'ALTER TABLE `paper_stock_movements` ADD KEY `idx_paper_movement_type_date` (`movement_type`,`created_at`)',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
