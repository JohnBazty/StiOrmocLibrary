-- ============================================================================
-- STI Ormoc Smart Library - Reservation & Borrowing Management
-- MySQL 5.6 compatible | InnoDB | utf8mb4_unicode_ci
--
-- material_id identifies the requested catalog material/title exemplar.
-- accession_id is nullable until pickup and references the assigned physical
-- materials row. physical_copies.material_id remains the normalized bridge.
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

ALTER TABLE `reservations`
  ENGINE=InnoDB,
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add the nullable assigned physical accession.
SET @reservation_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'accession_id'),
  'ALTER TABLE `reservations` ADD COLUMN `accession_id` BIGINT UNSIGNED DEFAULT NULL AFTER `material_id`',
  'SELECT 1'
);
PREPARE reservation_statement FROM @reservation_ddl;
EXECUTE reservation_statement;
DEALLOCATE PREPARE reservation_statement;

-- Preserve and rename the legacy timestamps.
SET @reservation_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'reservation_date')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'reserved_at'),
  'ALTER TABLE `reservations` CHANGE COLUMN `reservation_date` `reserved_at` DATETIME NOT NULL',
  'SELECT 1'
);
PREPARE reservation_statement FROM @reservation_ddl;
EXECUTE reservation_statement;
DEALLOCATE PREPARE reservation_statement;

SET @reservation_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'expiry_date')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'pickup_deadline'),
  'ALTER TABLE `reservations` CHANGE COLUMN `expiry_date` `pickup_deadline` DATETIME DEFAULT NULL',
  'SELECT 1'
);
PREPARE reservation_statement FROM @reservation_ddl;
EXECUTE reservation_statement;
DEALLOCATE PREPARE reservation_statement;

-- Temporarily accept old and new values, map data, then enforce the target ENUM.
ALTER TABLE `reservations` MODIFY COLUMN `reservation_status`
  ENUM('Waiting','Fulfilled','pending','approved','ready_for_pickup','claimed','cancelled','expired')
  NOT NULL DEFAULT 'pending';

UPDATE `reservations` SET `reservation_status` = 'pending' WHERE `reservation_status` = 'Waiting';
UPDATE `reservations` SET `reservation_status` = 'claimed' WHERE `reservation_status` = 'Fulfilled';
-- Under utf8mb4_unicode_ci, legacy `Expired` values map directly to `expired`
-- when the transitional ENUM above is applied.

ALTER TABLE `reservations`
  MODIFY COLUMN `reservation_status`
    ENUM('pending','approved','ready_for_pickup','claimed','cancelled','expired')
    NOT NULL DEFAULT 'pending',
  MODIFY COLUMN `reserved_at` DATETIME NOT NULL,
  MODIFY COLUMN `pickup_deadline` DATETIME DEFAULT NULL;

-- Retain legacy indexes because MySQL 5.6 may select them to support existing
-- foreign keys. The queue-oriented covering indexes below are additive.

SET @reservation_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND INDEX_NAME = 'idx_reservation_status_reserved'),
  'ALTER TABLE `reservations` ADD KEY `idx_reservation_status_reserved` (`reservation_status`, `reserved_at`, `reservation_id`)', 'SELECT 1'
);
PREPARE reservation_statement FROM @reservation_ddl;
EXECUTE reservation_statement;
DEALLOCATE PREPARE reservation_statement;

SET @reservation_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND INDEX_NAME = 'idx_reservation_user_status'),
  'ALTER TABLE `reservations` ADD KEY `idx_reservation_user_status` (`user_id`, `reservation_status`, `reserved_at`)', 'SELECT 1'
);
PREPARE reservation_statement FROM @reservation_ddl;
EXECUTE reservation_statement;
DEALLOCATE PREPARE reservation_statement;

SET @reservation_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND INDEX_NAME = 'idx_reservation_material_status'),
  'ALTER TABLE `reservations` ADD KEY `idx_reservation_material_status` (`material_id`, `reservation_status`, `reserved_at`)', 'SELECT 1'
);
PREPARE reservation_statement FROM @reservation_ddl;
EXECUTE reservation_statement;
DEALLOCATE PREPARE reservation_statement;

SET @reservation_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND INDEX_NAME = 'idx_reservation_pickup_expiry'),
  'ALTER TABLE `reservations` ADD KEY `idx_reservation_pickup_expiry` (`reservation_status`, `pickup_deadline`)', 'SELECT 1'
);
PREPARE reservation_statement FROM @reservation_ddl;
EXECUTE reservation_statement;
DEALLOCATE PREPARE reservation_statement;

SET @reservation_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND INDEX_NAME = 'idx_reservation_accession_status'),
  'ALTER TABLE `reservations` ADD KEY `idx_reservation_accession_status` (`accession_id`, `reservation_status`)', 'SELECT 1'
);
PREPARE reservation_statement FROM @reservation_ddl;
EXECUTE reservation_statement;
DEALLOCATE PREPARE reservation_statement;

SET @reservation_ddl = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations' AND CONSTRAINT_NAME = 'fk_reservation_accession'),
  'ALTER TABLE `reservations` ADD CONSTRAINT `fk_reservation_accession` FOREIGN KEY (`accession_id`) REFERENCES `materials` (`material_id`) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE reservation_statement FROM @reservation_ddl;
EXECUTE reservation_statement;
DEALLOCATE PREPARE reservation_statement;
