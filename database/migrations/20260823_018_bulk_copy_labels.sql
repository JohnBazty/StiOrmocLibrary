-- SmartLib multi-copy barcode and QR label support.
-- MySQL 5.6 / InnoDB / utf8 compatible.

SET @database_name := DATABASE();

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'physical_copies' AND COLUMN_NAME = 'qr_code_data') = 0,
  'ALTER TABLE `physical_copies` ADD COLUMN `qr_code_data` LONGTEXT DEFAULT NULL AFTER `barcode`',
  'SELECT 1'
);
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @has_new_barcode_index := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'physical_copies' AND INDEX_NAME = 'idx_unique_barcode');
SET @has_old_barcode_index := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'physical_copies' AND INDEX_NAME = 'uq_physical_copies_barcode');
SET @ddl := IF(@has_new_barcode_index > 0, 'SELECT 1',
  IF(@has_old_barcode_index > 0,
    'ALTER TABLE `physical_copies` DROP INDEX `uq_physical_copies_barcode`, ADD UNIQUE INDEX `idx_unique_barcode` (`barcode`)',
    'ALTER TABLE `physical_copies` ADD UNIQUE INDEX `idx_unique_barcode` (`barcode`)'));
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @has_new_accession_index := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'physical_copies' AND INDEX_NAME = 'idx_unique_accession');
SET @has_old_accession_index := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'physical_copies' AND INDEX_NAME = 'uq_physical_copies_accession');
SET @ddl := IF(@has_new_accession_index > 0, 'SELECT 1',
  IF(@has_old_accession_index > 0,
    'ALTER TABLE `physical_copies` DROP INDEX `uq_physical_copies_accession`, ADD UNIQUE INDEX `idx_unique_accession` (`accession_number`)',
    'ALTER TABLE `physical_copies` ADD UNIQUE INDEX `idx_unique_accession` (`accession_number`)'));
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

CREATE TABLE IF NOT EXISTS `barcode_sequences` (
  `sequence_year` SMALLINT UNSIGNED NOT NULL,
  `last_value` INT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`sequence_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO `barcode_sequences` (`sequence_year`, `last_value`)
SELECT YEAR(CURDATE()), COALESCE(MAX(CAST(SUBSTRING(pc.`barcode`, 13, 6) AS UNSIGNED)), 0)
FROM `physical_copies` pc
WHERE pc.`barcode` REGEXP CONCAT('^STIORMOC', YEAR(CURDATE()), '[0-9]{6}$')
ON DUPLICATE KEY UPDATE `last_value` = GREATEST(`last_value`, VALUES(`last_value`));
