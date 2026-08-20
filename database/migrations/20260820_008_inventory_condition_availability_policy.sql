-- ============================================================================
-- SmartLib inventory condition and availability policy
-- MySQL 5.6 compatible | InnoDB | utf8
--
-- Availability is librarian-controlled for every condition except Lost.
-- Lost is the sole database-enforced transition to Unavailable.
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

-- Remove the obsolete transitional condition before narrowing the ENUM.
UPDATE `physical_copies` SET `condition_status` = 'Good' WHERE `condition_status` = 'New';
UPDATE `inventory_audit_events` SET `previous_condition` = 'Good' WHERE `previous_condition` = 'New';
UPDATE `inventory_audit_events` SET `new_condition` = 'Good' WHERE `new_condition` = 'New';

ALTER TABLE `physical_copies`
  MODIFY `condition_status` ENUM('Good', 'Fair', 'For Repair', 'Damaged', 'Lost') NOT NULL DEFAULT 'Good';

ALTER TABLE `inventory_audit_events`
  MODIFY `event_type` ENUM('Verified', 'Condition Changed', 'Availability Changed', 'Lost Override') NOT NULL,
  MODIFY `previous_condition` ENUM('Good', 'Fair', 'For Repair', 'Damaged', 'Lost') DEFAULT NULL,
  MODIFY `new_condition` ENUM('Good', 'Fair', 'For Repair', 'Damaged', 'Lost') DEFAULT NULL;

ALTER TABLE `materials`
  MODIFY `availability_status` ENUM('Available', 'Borrowed', 'Reserved', 'Unavailable') NOT NULL DEFAULT 'Available';

-- Reconcile any Lost rows created before this policy was installed.
UPDATE `physical_copies` SET `availability_status` = 'Unavailable' WHERE `condition_status` = 'Lost';
UPDATE `materials` m INNER JOIN `physical_copies` pc ON pc.`material_id` = m.`material_id` SET m.`availability_status` = 'Unavailable' WHERE pc.`condition_status` = 'Lost';

-- These single-statement triggers are intentionally compatible with the
-- repository migration runner (which does not parse DELIMITER blocks).
DROP TRIGGER IF EXISTS `trg_physical_copy_lost_before_insert`;
CREATE TRIGGER `trg_physical_copy_lost_before_insert` BEFORE INSERT ON `physical_copies` FOR EACH ROW SET NEW.`availability_status` = IF(NEW.`condition_status` = 'Lost', 'Unavailable', NEW.`availability_status`);

DROP TRIGGER IF EXISTS `trg_physical_copy_lost_before_update`;
CREATE TRIGGER `trg_physical_copy_lost_before_update` BEFORE UPDATE ON `physical_copies` FOR EACH ROW SET NEW.`availability_status` = IF(NEW.`condition_status` = 'Lost', 'Unavailable', NEW.`availability_status`);

DROP TRIGGER IF EXISTS `trg_physical_copy_lost_after_insert`;
CREATE TRIGGER `trg_physical_copy_lost_after_insert` AFTER INSERT ON `physical_copies` FOR EACH ROW UPDATE `materials` SET `availability_status` = 'Unavailable', `updated_at` = NOW() WHERE NEW.`condition_status` = 'Lost' AND `material_id` = NEW.`material_id`;

DROP TRIGGER IF EXISTS `trg_physical_copy_lost_after_update`;
CREATE TRIGGER `trg_physical_copy_lost_after_update` AFTER UPDATE ON `physical_copies` FOR EACH ROW UPDATE `materials` SET `availability_status` = 'Unavailable', `updated_at` = NOW() WHERE NEW.`condition_status` = 'Lost' AND `material_id` = NEW.`material_id`;

-- Prevent circulation-side updates (including returns) from re-publishing a
-- legacy material while its normalized physical copy is still Lost.
DROP TRIGGER IF EXISTS `trg_material_lost_before_update`;
CREATE TRIGGER `trg_material_lost_before_update` BEFORE UPDATE ON `materials` FOR EACH ROW SET NEW.`availability_status` = IF(EXISTS (SELECT 1 FROM `physical_copies` pc WHERE pc.`material_id` = NEW.`material_id` AND pc.`condition_status` = 'Lost' AND pc.`lifecycle_status` = 'Active'), 'Unavailable', NEW.`availability_status`);
