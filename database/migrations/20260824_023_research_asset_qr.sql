-- Administrative QR payload for independently accessioned research inventory.
-- Research remains view-only and is not connected to circulation.

SET @database_name := DATABASE();
SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'research_inventory' AND COLUMN_NAME = 'qr_code_data') = 0,
  'ALTER TABLE `research_inventory` ADD COLUMN `qr_code_data` LONGTEXT DEFAULT NULL AFTER `barcode`',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
