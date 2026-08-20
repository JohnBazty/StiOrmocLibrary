-- ============================================================================
-- STI Ormoc Smart Library - Category Management
-- MySQL 5.6 compatible | InnoDB | utf8mb4_unicode_ci
--
-- This migration is backward-safe for the current categories table. Existing
-- rows receive the temporary physical tag "Shelf Unassigned" and may be edited
-- through the Category Management screen after deployment.
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

-- Canonical structure for a fresh database.
CREATE TABLE IF NOT EXISTS `categories` (
  `category_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_name` VARCHAR(100) NOT NULL,
  `shelf_location` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uq_categories_name` (`category_name`),
  KEY `idx_categories_shelf_location` (`shelf_location`),
  KEY `idx_categories_name_shelf` (`category_name`(95), `shelf_location`(95))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Upgrade the existing baseline without discarding its rows.
ALTER TABLE `categories`
  ENGINE=InnoDB,
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @category_ddl = IF(
  EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
       AND COLUMN_NAME = 'date_added'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
       AND COLUMN_NAME = 'created_at'
  ),
  'ALTER TABLE `categories` CHANGE COLUMN `date_added` `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE category_statement FROM @category_ddl;
EXECUTE category_statement;
DEALLOCATE PREPARE category_statement;

SET @category_ddl = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
       AND COLUMN_NAME = 'created_at'
  ),
  'ALTER TABLE `categories` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE category_statement FROM @category_ddl;
EXECUTE category_statement;
DEALLOCATE PREPARE category_statement;

SET @category_ddl = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
       AND COLUMN_NAME = 'shelf_location'
  ),
  'ALTER TABLE `categories` ADD COLUMN `shelf_location` VARCHAR(100) NULL AFTER `category_name`',
  'SELECT 1'
);
PREPARE category_statement FROM @category_ddl;
EXECUTE category_statement;
DEALLOCATE PREPARE category_statement;

UPDATE `categories`
   SET `shelf_location` = 'Shelf Unassigned'
 WHERE `shelf_location` IS NULL OR TRIM(`shelf_location`) = '';

SET @category_ddl = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
       AND COLUMN_NAME = 'updated_at'
  ),
  'ALTER TABLE `categories` ADD COLUMN `updated_at` DATETIME DEFAULT NULL AFTER `created_at`',
  'SELECT 1'
);
PREPARE category_statement FROM @category_ddl;
EXECUTE category_statement;
DEALLOCATE PREPARE category_statement;

ALTER TABLE `categories`
  MODIFY COLUMN `category_name` VARCHAR(100) NOT NULL,
  MODIFY COLUMN `shelf_location` VARCHAR(100) NOT NULL;

SET @category_ddl = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
       AND INDEX_NAME = 'uq_categories_name'
  ),
  'ALTER TABLE `categories` ADD UNIQUE KEY `uq_categories_name` (`category_name`)',
  'SELECT 1'
);
PREPARE category_statement FROM @category_ddl;
EXECUTE category_statement;
DEALLOCATE PREPARE category_statement;

SET @category_ddl = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
       AND INDEX_NAME = 'idx_categories_shelf_location'
  ),
  'ALTER TABLE `categories` ADD KEY `idx_categories_shelf_location` (`shelf_location`)',
  'SELECT 1'
);
PREPARE category_statement FROM @category_ddl;
EXECUTE category_statement;
DEALLOCATE PREPARE category_statement;

SET @category_ddl = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
       AND INDEX_NAME = 'idx_categories_name_shelf'
  ),
  'ALTER TABLE `categories` ADD KEY `idx_categories_name_shelf` (`category_name`(95), `shelf_location`(95))',
  'SELECT 1'
);
PREPARE category_statement FROM @category_ddl;
EXECUTE category_statement;
DEALLOCATE PREPARE category_statement;
