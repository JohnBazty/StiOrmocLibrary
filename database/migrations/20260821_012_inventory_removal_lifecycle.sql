-- ============================================================================
-- SmartLib inventory removal lifecycle and retained deletion audits
-- MySQL 5.6 compatible | InnoDB | utf8
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

-- Independent bound-paper inventory now supports the same active/archive
-- lifecycle as accessioned book copies.
ALTER TABLE `research_inventory`
  ADD COLUMN `lifecycle_status` ENUM('Active', 'Archived') NOT NULL DEFAULT 'Active' AFTER `availability_status`,
  ADD COLUMN `archived_at` DATETIME DEFAULT NULL AFTER `last_audited_at`,
  ADD COLUMN `archive_reason` VARCHAR(255) DEFAULT NULL AFTER `archived_at`,
  ADD COLUMN `archived_by_user_id` BIGINT UNSIGNED DEFAULT NULL AFTER `archive_reason`,
  ADD KEY `idx_research_inventory_lifecycle` (`lifecycle_status`, `availability_status`, `publication_year`),
  ADD KEY `idx_research_inventory_archived_by` (`archived_by_user_id`),
  ADD CONSTRAINT `fk_research_inventory_archived_by`
    FOREIGN KEY (`archived_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- Deletion audit rows must survive removal of a never-used physical copy.
ALTER TABLE `inventory_audit_events`
  DROP FOREIGN KEY `fk_inventory_audit_copy`;

ALTER TABLE `inventory_audit_events`
  MODIFY `physical_copy_id` BIGINT UNSIGNED DEFAULT NULL,
  MODIFY `event_type`
    ENUM('Verified', 'Condition Changed', 'Availability Changed', 'Lost Override', 'Archived', 'Deleted') NOT NULL,
  ADD COLUMN `action_reason` VARCHAR(255) DEFAULT NULL AFTER `new_availability`,
  ADD CONSTRAINT `fk_inventory_audit_copy`
    FOREIGN KEY (`physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- Apply the same retained-audit policy to independent research inventory.
ALTER TABLE `research_inventory_audit_events`
  DROP FOREIGN KEY `fk_research_inventory_audit_item`;

ALTER TABLE `research_inventory_audit_events`
  MODIFY `research_inventory_id` BIGINT UNSIGNED DEFAULT NULL,
  MODIFY `event_type`
    ENUM('verified', 'condition_changed', 'availability_changed', 'lost_override', 'archived', 'deleted') NOT NULL,
  ADD COLUMN `action_reason` VARCHAR(255) DEFAULT NULL AFTER `new_availability`,
  ADD CONSTRAINT `fk_research_inventory_audit_item`
    FOREIGN KEY (`research_inventory_id`) REFERENCES `research_inventory` (`research_inventory_id`)
    ON UPDATE CASCADE ON DELETE SET NULL;
