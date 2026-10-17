-- MySQL rollback reference only; Supabase Postgres is the active database.
CREATE TABLE IF NOT EXISTS `book_quotations` (
  `quotation_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title_id` BIGINT UNSIGNED NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(40) NOT NULL,
  `quoted_amount` DECIMAL(10,2) NOT NULL,
  `uploaded_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`quotation_id`),
  UNIQUE KEY `uq_book_quotation_path` (`storage_path`),
  KEY `ix_book_quotations_title_latest` (`title_id`, `quotation_id`),
  CONSTRAINT `fk_book_quotation_title` FOREIGN KEY (`title_id`) REFERENCES `titles` (`title_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_book_quotation_uploader` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE `lost_book_reports` ADD COLUMN `quotation_id` BIGINT UNSIGNED NULL;
ALTER TABLE `lost_book_reports` ADD CONSTRAINT `fk_lost_book_quotation` FOREIGN KEY (`quotation_id`) REFERENCES `book_quotations` (`quotation_id`) ON DELETE RESTRICT;
ALTER TABLE `lost_book_reports` ADD COLUMN `charge_resolution` VARCHAR(24) NOT NULL DEFAULT 'Awaiting Review';
ALTER TABLE `lost_book_reports` ADD COLUMN `resolution_reason` VARCHAR(500) NULL;
UPDATE `lost_book_reports` SET `charge_resolution`=CASE WHEN `replacement_charge`>0 THEN 'Quoted' ELSE 'Awaiting Quotation' END
WHERE `report_status`='Confirmed';
