-- ============================================================================
-- STI Ormoc Smart Library Management System
-- Book and Research/Thesis Management - Structural DDL
-- MySQL 5.6 compatible | InnoDB | utf8
--
-- Prerequisites:
--   1. The sti_ormoc_library database already exists.
--   2. The existing categories table has already been created.
--
-- This script creates only the normalized target structure. It intentionally
-- does not copy or delete data from the legacy materials table.
-- During backfill, copy materials.material_id into both
-- physical_copies.physical_copy_id and physical_copies.material_id so existing
-- circulation identifiers remain traceable without changing their values.
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

USE `sti_ormoc_library`;

-- ============================================================================
-- 1. TITLES
-- One row represents one book edition or one research/thesis work.
-- Category and ISBN lookups are indexed for catalog search and filtering.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `titles` (
  `title_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT UNSIGNED DEFAULT NULL,
  `record_type` ENUM('Book', 'Research/Thesis') NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `normalized_title` VARCHAR(255) NOT NULL,
  `isbn` VARCHAR(17) DEFAULT NULL,
  `publication_year` SMALLINT UNSIGNED DEFAULT NULL,
  `publisher` VARCHAR(255) DEFAULT NULL,
  `call_number` VARCHAR(100) DEFAULT NULL,
  `cover_image_path` VARCHAR(500) DEFAULT NULL,
  `search_text` TEXT,
  `lifecycle_status` ENUM('Active', 'Archived') NOT NULL DEFAULT 'Active',
  `archived_at` DATETIME DEFAULT NULL,
  `archive_reason` VARCHAR(255) DEFAULT NULL,
  `row_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`title_id`),
  UNIQUE KEY `uq_titles_isbn` (`isbn`),
  KEY `idx_titles_category_id` (`category_id`),
  KEY `idx_titles_category_type_status`
    (`category_id`, `record_type`, `lifecycle_status`),
  KEY `idx_titles_category_year`
    (`category_id`, `publication_year`),
  KEY `idx_titles_record_type_status`
    (`record_type`, `lifecycle_status`),
  KEY `idx_titles_publication_year` (`publication_year`),
  KEY `idx_titles_normalized_title` (`normalized_title`(191)),
  KEY `idx_titles_call_number` (`call_number`),
  FULLTEXT KEY `ft_titles_catalog_search` (`title`, `search_text`),
  CONSTRAINT `fk_titles_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- 2. AUTHORS
-- One row represents one ordered author credit on a title. This supports
-- multiple authors without storing comma-separated names and keeps the model
-- within the required four-table layout.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `authors` (
  `author_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title_id` BIGINT UNSIGNED NOT NULL,
  `author_name` VARCHAR(255) NOT NULL,
  `normalized_name` VARCHAR(191) NOT NULL,
  `author_order` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`author_id`),
  UNIQUE KEY `uq_authors_title_name` (`title_id`, `normalized_name`),
  UNIQUE KEY `uq_authors_title_order` (`title_id`, `author_order`),
  KEY `idx_authors_title_id` (`title_id`),
  KEY `idx_authors_normalized_name` (`normalized_name`),
  CONSTRAINT `fk_authors_title`
    FOREIGN KEY (`title_id`) REFERENCES `titles` (`title_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- 3. RESEARCH RECORDS
-- A one-to-one extension of titles for research/thesis-specific metadata.
-- Research items are view-only; physical manuscripts may still have an
-- optional row in physical_copies for accession and shelf tracking.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `research_records` (
  `research_record_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title_id` BIGINT UNSIGNED NOT NULL,
  `research_code` VARCHAR(100) NOT NULL,
  `adviser_name` VARCHAR(255) NOT NULL,
  `department_or_program` VARCHAR(150) NOT NULL,
  `abstract_text` MEDIUMTEXT NOT NULL,
  `keywords_text` TEXT,
  `viewing_status`
    ENUM('Available for Viewing', 'Missing', 'Archived')
    NOT NULL DEFAULT 'Available for Viewing',
  `last_scanned_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`research_record_id`),
  UNIQUE KEY `uq_research_records_title_id` (`title_id`),
  UNIQUE KEY `uq_research_records_code` (`research_code`),
  KEY `idx_research_department_status`
    (`department_or_program`, `viewing_status`),
  KEY `idx_research_adviser` (`adviser_name`(191)),
  KEY `idx_research_last_scanned` (`last_scanned_at`),
  FULLTEXT KEY `ft_research_content` (`abstract_text`, `keywords_text`),
  CONSTRAINT `fk_research_records_title`
    FOREIGN KEY (`title_id`) REFERENCES `titles` (`title_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- 4. PHYSICAL COPIES
-- One row represents one accessioned and scannable physical item.
-- The material_id compatibility column preserves the identifier used by the
-- current materials, borrow_transactions, and reservations structures.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `physical_copies` (
  `physical_copy_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title_id` BIGINT UNSIGNED NOT NULL,
  `material_id` BIGINT UNSIGNED DEFAULT NULL
    COMMENT 'Legacy materials.material_id; preserve this value during backfill',
  `barcode` VARCHAR(100) NOT NULL,
  `accession_number` VARCHAR(100) NOT NULL,
  `shelf_location` VARCHAR(100) NOT NULL,
  `condition_status`
    ENUM('New', 'Good', 'Fair', 'Damaged', 'For Repair', 'Lost')
    NOT NULL DEFAULT 'Good',
  `availability_status`
    ENUM('Available', 'Borrowed', 'Reserved', 'Unavailable', 'Archived')
    NOT NULL DEFAULT 'Available',
  `lifecycle_status` ENUM('Active', 'Archived') NOT NULL DEFAULT 'Active',
  `acquired_at` DATE DEFAULT NULL,
  `last_scanned_at` DATETIME DEFAULT NULL,
  `archived_at` DATETIME DEFAULT NULL,
  `archive_reason` VARCHAR(255) DEFAULT NULL,
  `row_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`physical_copy_id`),
  UNIQUE KEY `uq_physical_copies_material_id` (`material_id`),
  UNIQUE KEY `uq_physical_copies_barcode` (`barcode`),
  UNIQUE KEY `uq_physical_copies_accession` (`accession_number`),
  KEY `idx_physical_copies_title_id` (`title_id`),
  KEY `idx_physical_copies_title_status`
    (`title_id`, `lifecycle_status`, `availability_status`),
  KEY `idx_physical_copies_accession_lookup`
    (`accession_number`, `lifecycle_status`),
  KEY `idx_physical_copies_availability_condition`
    (`availability_status`, `condition_status`),
  KEY `idx_physical_copies_shelf_location` (`shelf_location`),
  KEY `idx_physical_copies_last_scanned` (`last_scanned_at`),
  CONSTRAINT `fk_physical_copies_title`
    FOREIGN KEY (`title_id`) REFERENCES `titles` (`title_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- Structural migration ends here.
--
-- Required follow-up migration work, intentionally not performed by this DDL:
--   1. Backfill titles, authors, research_records, and physical_copies from
--      the existing materials table.
--   2. Preserve legacy material IDs as documented above.
--   3. Add and backfill physical_copy_id references on circulation tables.
--   4. Reconcile row counts and foreign keys before retiring legacy columns.
-- ============================================================================
