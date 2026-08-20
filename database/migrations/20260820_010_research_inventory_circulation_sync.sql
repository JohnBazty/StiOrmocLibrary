-- ============================================================================
-- Research inventory to legacy circulation synchronization
-- Independent by structure; synchronized only through the unique barcode.
-- MySQL 5.6 compatible | InnoDB | utf8
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

UPDATE `materials` m INNER JOIN `research_inventory` ri ON ri.`barcode` = m.`barcode` SET m.`availability_status` = 'Unavailable' WHERE ri.`condition_state` = 'lost';

DROP TRIGGER IF EXISTS `trg_research_inventory_lost_after_insert`;
CREATE TRIGGER `trg_research_inventory_lost_after_insert` AFTER INSERT ON `research_inventory` FOR EACH ROW UPDATE `materials` SET `availability_status` = 'Unavailable', `updated_at` = NOW() WHERE NEW.`condition_state` = 'lost' AND `barcode` = NEW.`barcode`;

DROP TRIGGER IF EXISTS `trg_research_inventory_lost_after_update`;
CREATE TRIGGER `trg_research_inventory_lost_after_update` AFTER UPDATE ON `research_inventory` FOR EACH ROW UPDATE `materials` SET `availability_status` = 'Unavailable', `updated_at` = NOW() WHERE NEW.`condition_state` = 'lost' AND `barcode` = NEW.`barcode`;

DROP TRIGGER IF EXISTS `trg_material_research_lost_before_update`;
CREATE TRIGGER `trg_material_research_lost_before_update` BEFORE UPDATE ON `materials` FOR EACH ROW SET NEW.`availability_status` = IF(EXISTS (SELECT 1 FROM `research_inventory` ri WHERE ri.`barcode` = NEW.`barcode` AND ri.`condition_state` = 'lost'), 'Unavailable', NEW.`availability_status`);
