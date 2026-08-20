-- ============================================================================
-- SmartLib independent Research and Thesis Inventory subsystem
-- MySQL 5.6 compatible | InnoDB | utf8
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

CREATE TABLE IF NOT EXISTS `research_inventory` (
  `research_inventory_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `authors` TEXT NOT NULL,
  `adviser` VARCHAR(255) NOT NULL,
  `publication_year` YEAR NOT NULL,
  `accession_number` VARCHAR(100) NOT NULL,
  `barcode` VARCHAR(100) NOT NULL,
  `condition_state` ENUM('good', 'fair', 'for_repair', 'damaged', 'lost') NOT NULL DEFAULT 'good',
  `availability_status` ENUM('available', 'unavailable', 'borrowed', 'reserved') NOT NULL DEFAULT 'available',
  `shelf_location` VARCHAR(100) NOT NULL,
  `last_audited_at` DATETIME DEFAULT NULL,
  `row_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`research_inventory_id`),
  UNIQUE KEY `uq_research_inventory_accession` (`accession_number`),
  UNIQUE KEY `uq_research_inventory_barcode` (`barcode`),
  KEY `idx_research_inventory_title` (`title`(191)),
  KEY `idx_research_inventory_year` (`publication_year`),
  KEY `idx_research_inventory_condition_availability` (`condition_state`, `availability_status`),
  KEY `idx_research_inventory_active_search` (`availability_status`, `publication_year`, `condition_state`),
  KEY `idx_research_inventory_shelf` (`shelf_location`),
  KEY `idx_research_inventory_last_audited` (`last_audited_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `research_inventory_audit_events` (
  `research_inventory_audit_event_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `research_inventory_id` BIGINT UNSIGNED NOT NULL,
  `barcode_snapshot` VARCHAR(100) NOT NULL,
  `event_type` ENUM('verified', 'condition_changed', 'availability_changed', 'lost_override') NOT NULL,
  `previous_condition` ENUM('good', 'fair', 'for_repair', 'damaged', 'lost') DEFAULT NULL,
  `new_condition` ENUM('good', 'fair', 'for_repair', 'damaged', 'lost') DEFAULT NULL,
  `previous_availability` ENUM('available', 'unavailable', 'borrowed', 'reserved') DEFAULT NULL,
  `new_availability` ENUM('available', 'unavailable', 'borrowed', 'reserved') DEFAULT NULL,
  `performed_by_id` BIGINT UNSIGNED DEFAULT NULL,
  `performed_by_label` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`research_inventory_audit_event_id`),
  KEY `idx_research_audit_item_date` (`research_inventory_id`, `created_at`),
  KEY `idx_research_audit_barcode_date` (`barcode_snapshot`, `created_at`),
  KEY `idx_research_audit_type_date` (`event_type`, `created_at`),
  CONSTRAINT `fk_research_inventory_audit_item`
    FOREIGN KEY (`research_inventory_id`) REFERENCES `research_inventory` (`research_inventory_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- MySQL 5.6 has no enforced CHECK constraints. Lost is the only condition
-- that changes availability automatically; all other condition writes keep it.
DROP TRIGGER IF EXISTS `trg_research_inventory_lost_before_insert`;
CREATE TRIGGER `trg_research_inventory_lost_before_insert` BEFORE INSERT ON `research_inventory` FOR EACH ROW SET NEW.`availability_status` = IF(NEW.`condition_state` = 'lost', 'unavailable', NEW.`availability_status`);

DROP TRIGGER IF EXISTS `trg_research_inventory_lost_before_update`;
CREATE TRIGGER `trg_research_inventory_lost_before_update` BEFORE UPDATE ON `research_inventory` FOR EACH ROW SET NEW.`availability_status` = IF(NEW.`condition_state` = 'lost', 'unavailable', NEW.`availability_status`);
