-- ============================================================================
-- STI Ormoc Smart Library - Inventory audit history
-- MySQL 5.6 compatible | InnoDB | utf8
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

USE `sti_ormoc_library`;

CREATE TABLE IF NOT EXISTS `inventory_audit_events` (
  `inventory_audit_event_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `physical_copy_id` BIGINT UNSIGNED NOT NULL,
  `barcode_snapshot` VARCHAR(100) NOT NULL,
  `event_type` ENUM('Verified', 'Condition Changed') NOT NULL,
  `previous_condition` ENUM('New', 'Good', 'Fair', 'Damaged', 'For Repair', 'Lost') DEFAULT NULL,
  `new_condition` ENUM('New', 'Good', 'Fair', 'Damaged', 'For Repair', 'Lost') DEFAULT NULL,
  `previous_availability` ENUM('Available', 'Borrowed', 'Reserved', 'Unavailable', 'Archived') DEFAULT NULL,
  `new_availability` ENUM('Available', 'Borrowed', 'Reserved', 'Unavailable', 'Archived') DEFAULT NULL,
  `verified_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `verified_by_label` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`inventory_audit_event_id`),
  KEY `idx_inventory_audit_copy_date` (`physical_copy_id`, `created_at`),
  KEY `idx_inventory_audit_barcode_date` (`barcode_snapshot`, `created_at`),
  KEY `idx_inventory_audit_type_date` (`event_type`, `created_at`),
  KEY `idx_inventory_audit_verifier` (`verified_by_user_id`, `created_at`),
  CONSTRAINT `fk_inventory_audit_copy`
    FOREIGN KEY (`physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_audit_verifier`
    FOREIGN KEY (`verified_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
