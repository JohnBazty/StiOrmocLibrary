-- SmartLib history ledger for replacing legacy physical-copy asset codes.
-- MySQL 5.6 / InnoDB / utf8 compatible. The actual image generation is
-- performed by the application backfill so QR payloads use the same renderer
-- as newly registered copies.

CREATE TABLE IF NOT EXISTS `physical_copy_asset_code_history` (
  `asset_code_history_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `physical_copy_id` BIGINT UNSIGNED NULL,
  `material_id` BIGINT UNSIGNED NULL,
  `title_id` BIGINT UNSIGNED NOT NULL,
  `accession_number` VARCHAR(100) NOT NULL,
  `previous_barcode` VARCHAR(100) NOT NULL,
  `replacement_barcode` VARCHAR(100) NOT NULL,
  `replaced_at` DATETIME NOT NULL,
  PRIMARY KEY (`asset_code_history_id`),
  UNIQUE KEY `uq_asset_code_history_replacement` (`replacement_barcode`),
  KEY `idx_asset_code_history_previous` (`previous_barcode`),
  KEY `idx_asset_code_history_copy_date` (`physical_copy_id`, `replaced_at`),
  KEY `idx_asset_code_history_title` (`title_id`),
  CONSTRAINT `fk_asset_code_history_copy`
    FOREIGN KEY (`physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_code_history_title`
    FOREIGN KEY (`title_id`) REFERENCES `titles` (`title_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
