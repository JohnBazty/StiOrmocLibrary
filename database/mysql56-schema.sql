-- ============================================================================
-- STI Ormoc Smart Library Management System
-- MySQL 5.6-compatible database schema
-- Engine: InnoDB | Character set: utf8
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

CREATE DATABASE IF NOT EXISTS `sti_ormoc_library`
  DEFAULT CHARACTER SET utf8
  DEFAULT COLLATE utf8_general_ci;

USE `sti_ormoc_library`;

-- ============================================================================
-- 1. USER MANAGEMENT AND STATE LIFECYCLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS `roles` (
  `role_id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_name` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_roles_role_name` (`role_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO `roles` (`role_name`, `description`) VALUES
  ('System Administrator', 'Full system configuration and user-management access'),
  ('Librarian', 'Library operations, catalog, circulation, printing, and reports'),
  ('Student', 'Student catalog, borrowing, reservations, attendance, and printing access'),
  ('Faculty', 'Faculty catalog, circulation, reservations, attendance, and printing access')
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`);

CREATE TABLE IF NOT EXISTS `users` (
  `user_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id` TINYINT UNSIGNED NOT NULL,
  `user_role` ENUM('Admin', 'Librarian', 'Student', 'Faculty') NOT NULL,
  `institutional_id` VARCHAR(50) NOT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `educational_level` ENUM('Senior High School', 'College') DEFAULT NULL,
  `course_or_strand` VARCHAR(150) DEFAULT NULL,
  `section` VARCHAR(100) DEFAULT NULL,
  `account_status` ENUM('Active', 'Deactivated') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_users_institutional_id` (`institutional_id`),
  UNIQUE KEY `uq_users_school_id` (`school_id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_role_id` (`role_id`),
  KEY `idx_users_user_role` (`user_role`),
  KEY `idx_users_account_status` (`account_status`),
  CONSTRAINT `fk_users_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Normalized authentication identity. user_id is a compatibility bridge for
-- accounts imported from the pre-normalization users table.
CREATE TABLE IF NOT EXISTS `accounts` (
  `account_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED DEFAULT NULL,
  `school_id` VARCHAR(50) NOT NULL,
  `contact_number` VARCHAR(30) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('Student', 'Faculty', 'Librarian', 'Admin') NOT NULL,
  `account_status` ENUM('Active', 'Deactivated', 'Archived') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`account_id`),
  UNIQUE KEY `uq_accounts_school_id` (`school_id`),
  UNIQUE KEY `uq_accounts_user_id` (`user_id`),
  KEY `idx_accounts_role_status` (`role`, `account_status`),
  KEY `idx_accounts_status` (`account_status`),
  CONSTRAINT `fk_accounts_legacy_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `student_profiles` (
  `student_profile_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id` BIGINT UNSIGNED NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `program_strand` VARCHAR(150) NOT NULL,
  `year_grade_level` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`student_profile_id`),
  UNIQUE KEY `uq_student_profiles_account` (`account_id`),
  KEY `idx_student_profiles_name` (`last_name`, `first_name`),
  KEY `idx_student_profiles_program_year` (`program_strand`, `year_grade_level`),
  CONSTRAINT `fk_student_profiles_account`
    FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Server-side authentication sessions. Browser cookies store only an opaque ID.
CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `session_id` VARCHAR(128) NOT NULL,
  `session_data` MEDIUMTEXT NOT NULL,
  `expires_at` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`session_id`),
  KEY `idx_auth_sessions_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- 2. DIGITAL CATALOGING: CATEGORIES, BOOKS, AND RESEARCH MATERIALS
-- Each material row represents one individually barcoded physical item.
-- ============================================================================

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

CREATE TABLE IF NOT EXISTS `materials` (
  `material_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT UNSIGNED DEFAULT NULL,
  `barcode` VARCHAR(100) NOT NULL,
  `qr_code_data` LONGTEXT DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `author` VARCHAR(255) NOT NULL,
  `isbn` VARCHAR(30) DEFAULT NULL,
  `publication_year` SMALLINT UNSIGNED DEFAULT NULL,
  `shelf_location` VARCHAR(100) NOT NULL,
  `material_type` ENUM('Book', 'Thesis/Manuscript') NOT NULL DEFAULT 'Book',
  `availability_status` ENUM('Available', 'Borrowed', 'Reserved', 'Unavailable') NOT NULL DEFAULT 'Available',
  `department_or_program` VARCHAR(150) DEFAULT NULL,
  `abstract_text` TEXT,
  `date_added` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`material_id`),
  UNIQUE KEY `uq_materials_barcode` (`barcode`),
  KEY `idx_materials_category_id` (`category_id`),
  KEY `idx_materials_isbn` (`isbn`),
  KEY `idx_materials_title` (`title`(191)),
  KEY `idx_materials_type_status` (`material_type`, `availability_status`),
  KEY `idx_materials_shelf_location` (`shelf_location`),
  CONSTRAINT `fk_materials_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Independent physically bound research/thesis inventory. This ledger does
-- not reference bibliographic book-title tables.
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
  `lifecycle_status` ENUM('Active', 'Archived') NOT NULL DEFAULT 'Active',
  `shelf_location` VARCHAR(100) NOT NULL,
  `last_audited_at` DATETIME DEFAULT NULL,
  `archived_at` DATETIME DEFAULT NULL,
  `archive_reason` VARCHAR(255) DEFAULT NULL,
  `archived_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
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
  KEY `idx_research_inventory_lifecycle` (`lifecycle_status`, `availability_status`, `publication_year`),
  KEY `idx_research_inventory_shelf` (`shelf_location`),
  KEY `idx_research_inventory_last_audited` (`last_audited_at`),
  KEY `idx_research_inventory_archived_by` (`archived_by_user_id`),
  CONSTRAINT `fk_research_inventory_archived_by`
    FOREIGN KEY (`archived_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `research_inventory_audit_events` (
  `research_inventory_audit_event_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `research_inventory_id` BIGINT UNSIGNED DEFAULT NULL,
  `barcode_snapshot` VARCHAR(100) NOT NULL,
  `event_type` ENUM('verified', 'condition_changed', 'availability_changed', 'lost_override', 'archived', 'deleted') NOT NULL,
  `previous_condition` ENUM('good', 'fair', 'for_repair', 'damaged', 'lost') DEFAULT NULL,
  `new_condition` ENUM('good', 'fair', 'for_repair', 'damaged', 'lost') DEFAULT NULL,
  `previous_availability` ENUM('available', 'unavailable', 'borrowed', 'reserved') DEFAULT NULL,
  `new_availability` ENUM('available', 'unavailable', 'borrowed', 'reserved') DEFAULT NULL,
  `action_reason` VARCHAR(255) DEFAULT NULL,
  `performed_by_id` BIGINT UNSIGNED DEFAULT NULL,
  `performed_by_label` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`research_inventory_audit_event_id`),
  KEY `idx_research_audit_item_date` (`research_inventory_id`, `created_at`),
  KEY `idx_research_audit_barcode_date` (`barcode_snapshot`, `created_at`),
  KEY `idx_research_audit_type_date` (`event_type`, `created_at`),
  CONSTRAINT `fk_research_inventory_audit_item`
    FOREIGN KEY (`research_inventory_id`) REFERENCES `research_inventory` (`research_inventory_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- 3. AUTOMATED CIRCULATION AND RESERVATIONS
-- Students are limited to two simultaneous Borrowed/Overdue materials.
-- Faculty and staff roles are not limited by the database trigger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `borrow_transactions` (
  `transaction_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `material_id` BIGINT UNSIGNED NOT NULL,
  `physical_copy_id` BIGINT UNSIGNED DEFAULT NULL,
  `reservation_id` BIGINT UNSIGNED DEFAULT NULL,
  `request_group_id` CHAR(36) DEFAULT NULL,
  `processed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `borrowed_at` DATETIME DEFAULT NULL,
  `due_at` DATETIME DEFAULT NULL,
  `returned_at` DATETIME DEFAULT NULL,
  `reported_lost_at` DATETIME DEFAULT NULL,
  `lost_confirmed_at` DATETIME DEFAULT NULL,
  `cancelled_at` DATETIME DEFAULT NULL,
  `cancelled_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `cancellation_reason` VARCHAR(255) DEFAULT NULL,
  `transaction_status` ENUM('Pending', 'Borrowed', 'Returned', 'Overdue', 'Cancelled') NOT NULL DEFAULT 'Pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`transaction_id`),
  KEY `idx_borrow_user_status` (`user_id`, `transaction_status`),
  KEY `idx_borrow_material_status` (`material_id`, `transaction_status`),
  KEY `idx_borrow_copy_status` (`physical_copy_id`, `transaction_status`),
  UNIQUE KEY `uq_borrow_reservation` (`reservation_id`),
  KEY `idx_borrow_request_group` (`request_group_id`, `transaction_status`),
  KEY `idx_borrow_user_queue` (`user_id`, `transaction_status`, `created_at`, `transaction_id`),
  KEY `idx_borrow_due_at` (`due_at`),
  KEY `idx_borrow_lost_status` (`user_id`, `lost_confirmed_at`, `transaction_status`),
  KEY `idx_borrow_processed_by` (`processed_by_user_id`),
  KEY `idx_borrow_cancelled_by` (`cancelled_by_user_id`, `cancelled_at`),
  CONSTRAINT `fk_borrow_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_borrow_material`
    FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_borrow_physical_copy`
    FOREIGN KEY (`physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_borrow_processed_by`
    FOREIGN KEY (`processed_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_borrow_cancelled_by`
    FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `reservations` (
  `reservation_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `material_id` BIGINT UNSIGNED NOT NULL,
  `book_title_id` BIGINT UNSIGNED DEFAULT NULL,
  `accession_id` BIGINT UNSIGNED DEFAULT NULL,
  `assigned_physical_copy_id` BIGINT UNSIGNED DEFAULT NULL,
  `queue_position` INT UNSIGNED NOT NULL,
  `reservation_status` ENUM('pending', 'approved', 'ready_for_pickup', 'claimed', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  `reserved_at` DATETIME NOT NULL,
  `pickup_deadline` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`reservation_id`),
  KEY `idx_reservation_status_reserved` (`reservation_status`, `reserved_at`, `reservation_id`),
  KEY `idx_reservation_user_status` (`user_id`, `reservation_status`, `reserved_at`),
  KEY `idx_reservation_material_status` (`material_id`, `reservation_status`, `reserved_at`),
  KEY `idx_reservation_pickup_expiry` (`reservation_status`, `pickup_deadline`),
  KEY `idx_reservation_accession_status` (`accession_id`, `reservation_status`),
  KEY `idx_reservation_title_queue` (`book_title_id`, `reservation_status`, `queue_position`, `reserved_at`),
  KEY `idx_reservation_assigned_copy` (`assigned_physical_copy_id`, `reservation_status`),
  CONSTRAINT `fk_reservation_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_reservation_material`
    FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_reservation_accession`
    FOREIGN KEY (`accession_id`) REFERENCES `materials` (`material_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_reservations_book_title`
    FOREIGN KEY (`book_title_id`) REFERENCES `titles` (`title_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_reservations_assigned_copy`
    FOREIGN KEY (`assigned_physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `borrow_transactions`
  ADD CONSTRAINT `fk_borrow_reservation`
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`reservation_id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- ============================================================================
-- 4. FINES AND DIGITAL CLEARANCE
-- Fine policy: PHP 2.00/hour after the 8:59 AM cutoff on the due date;
-- beginning the following day, use the PHP 10.00/day rate.
-- The service layer records the calculation inputs for auditability.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `fines` (
  `fine_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_id` BIGINT UNSIGNED DEFAULT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `fine_type` ENUM('Overdue','Infraction') NOT NULL DEFAULT 'Overdue',
  `fine_amount` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `payment_status` ENUM('Accruing','Unpaid','Partially Paid','Paid','Waived','Voided') NOT NULL DEFAULT 'Unpaid',
  `calculation_basis` ENUM('Hourly', 'Daily', 'Manual') NOT NULL DEFAULT 'Hourly',
  `overdue_units` INT UNSIGNED NOT NULL DEFAULT 0,
  `rate_applied` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 2.00,
  `maximum_cap_applied` DECIMAL(10,2) UNSIGNED DEFAULT NULL,
  `applied_date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finalized_at` DATETIME DEFAULT NULL,
  `paid_at` DATETIME DEFAULT NULL,
  `notes` VARCHAR(255) DEFAULT NULL,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`fine_id`),
  UNIQUE KEY `uq_fines_transaction` (`transaction_id`),
  KEY `idx_fines_user_payment` (`user_id`, `payment_status`),
  KEY `idx_fines_applied_date` (`applied_date`),
  KEY `idx_fines_type_status_date` (`fine_type`,`payment_status`,`applied_date`),
  CONSTRAINT `fk_fines_transaction`
    FOREIGN KEY (`transaction_id`) REFERENCES `borrow_transactions` (`transaction_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_fines_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `fine_policy_versions` (
  `fine_policy_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hourly_rate` DECIMAL(10,2) UNSIGNED NOT NULL,
  `daily_rate` DECIMAL(10,2) UNSIGNED NOT NULL,
  `maximum_penalty` DECIMAL(10,2) UNSIGNED NOT NULL,
  `effective_from` DATETIME NOT NULL,
  `effective_until` DATETIME DEFAULT NULL,
  `is_active` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  `created_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_policy_id`),
  KEY `idx_fine_policy_active_effective` (`is_active`,`effective_from`,`effective_until`),
  CONSTRAINT `fk_fine_policy_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO `fine_policy_versions` (`hourly_rate`,`daily_rate`,`maximum_penalty`,`effective_from`,`is_active`)
SELECT 2.00,10.00,500.00,'2026-01-01 00:00:00',1 WHERE NOT EXISTS (SELECT 1 FROM `fine_policy_versions`);

CREATE TABLE IF NOT EXISTS `fine_infractions` (
  `fine_infraction_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fine_id` BIGINT UNSIGNED NOT NULL,
  `category` VARCHAR(80) NOT NULL,
  `incident_at` DATETIME NOT NULL,
  `incident_location` VARCHAR(150) DEFAULT NULL,
  `details` VARCHAR(500) NOT NULL,
  `issued_by_user_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_infraction_id`),
  UNIQUE KEY `uq_fine_infraction_fine` (`fine_id`),
  KEY `idx_fine_infraction_incident` (`incident_at`,`category`),
  CONSTRAINT `fk_fine_infraction_fine` FOREIGN KEY (`fine_id`) REFERENCES `fines` (`fine_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_infraction_issuer` FOREIGN KEY (`issued_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `fine_payment_receipts` (
  `fine_payment_receipt_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `receipt_number` VARCHAR(32) DEFAULT NULL,
  `request_key` VARCHAR(64) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `amount_received` DECIMAL(10,2) UNSIGNED NOT NULL,
  `payment_method` ENUM('Cash') NOT NULL DEFAULT 'Cash',
  `received_by_user_id` BIGINT UNSIGNED NOT NULL,
  `received_at` DATETIME NOT NULL,
  `receipt_status` ENUM('Issued','Reversed') NOT NULL DEFAULT 'Issued',
  `reversed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `reversed_at` DATETIME DEFAULT NULL,
  `reversal_reason` VARCHAR(500) DEFAULT NULL,
  `notes` VARCHAR(500) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_payment_receipt_id`),
  UNIQUE KEY `uq_fine_receipt_number` (`receipt_number`),
  UNIQUE KEY `uq_fine_receipt_request` (`request_key`),
  KEY `idx_fine_receipt_user_date` (`user_id`,`received_at`),
  KEY `idx_fine_receipt_status_date` (`receipt_status`,`received_at`),
  CONSTRAINT `fk_fine_receipt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_receipt_receiver` FOREIGN KEY (`received_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_receipt_reverser` FOREIGN KEY (`reversed_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `fine_payment_allocations` (
  `fine_payment_allocation_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fine_payment_receipt_id` BIGINT UNSIGNED NOT NULL,
  `fine_id` BIGINT UNSIGNED DEFAULT NULL,
  `lost_book_report_id` BIGINT UNSIGNED DEFAULT NULL,
  `amount_allocated` DECIMAL(10,2) UNSIGNED NOT NULL,
  `balance_before` DECIMAL(10,2) UNSIGNED NOT NULL,
  `balance_after` DECIMAL(10,2) UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_payment_allocation_id`),
  UNIQUE KEY `uq_receipt_fine_allocation` (`fine_payment_receipt_id`,`fine_id`),
  UNIQUE KEY `uq_receipt_lost_allocation` (`fine_payment_receipt_id`,`lost_book_report_id`),
  KEY `idx_fine_allocation_fine` (`fine_id`,`fine_payment_receipt_id`),
  KEY `idx_fine_allocation_lost` (`lost_book_report_id`,`fine_payment_receipt_id`),
  CONSTRAINT `fk_fine_allocation_receipt` FOREIGN KEY (`fine_payment_receipt_id`) REFERENCES `fine_payment_receipts` (`fine_payment_receipt_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_allocation_fine` FOREIGN KEY (`fine_id`) REFERENCES `fines` (`fine_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `fine_adjustments` (
  `fine_adjustment_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fine_id` BIGINT UNSIGNED NOT NULL,
  `adjustment_type` ENUM('Waiver','Reduction','Void') NOT NULL,
  `amount_adjusted` DECIMAL(10,2) UNSIGNED NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `adjusted_by_user_id` BIGINT UNSIGNED NOT NULL,
  `adjusted_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fine_adjustment_id`),
  KEY `idx_fine_adjustment_fine_date` (`fine_id`,`adjusted_at`),
  KEY `idx_fine_adjustment_actor_date` (`adjusted_by_user_id`,`adjusted_at`),
  CONSTRAINT `fk_fine_adjustment_fine` FOREIGN KEY (`fine_id`) REFERENCES `fines` (`fine_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_fine_adjustment_actor` FOREIGN KEY (`adjusted_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `clearance_statuses` (
  `clearance_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `standing_status` ENUM('Cleared', 'Not Cleared') NOT NULL DEFAULT 'Cleared',
  `reason_block_details` TEXT,
  `reviewed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `last_checked_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`clearance_id`),
  UNIQUE KEY `uq_clearance_user` (`user_id`),
  KEY `idx_clearance_standing` (`standing_status`),
  KEY `idx_clearance_reviewer` (`reviewed_by_user_id`),
  CONSTRAINT `fk_clearance_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_clearance_reviewer`
    FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `clearance_overrides` (
  `clearance_override_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `override_status` ENUM('Cleared','Not Cleared') NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `applied_by_user_id` BIGINT UNSIGNED NOT NULL,
  `applied_at` DATETIME NOT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `revoked_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `revoked_at` DATETIME DEFAULT NULL,
  `revocation_reason` VARCHAR(500) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`clearance_override_id`),
  KEY `idx_clearance_override_user_active` (`user_id`, `revoked_at`, `expires_at`, `applied_at`),
  CONSTRAINT `fk_clearance_override_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_clearance_override_applier` FOREIGN KEY (`applied_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_clearance_override_revoker` FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `lost_book_reports` (
  `lost_book_report_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `physical_copy_id` BIGINT UNSIGNED DEFAULT NULL,
  `report_status` ENUM('Pending','Confirmed','Rejected') NOT NULL DEFAULT 'Pending',
  `purchase_price_snapshot` DECIMAL(10,2) UNSIGNED DEFAULT NULL,
  `replacement_charge` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `payment_status` ENUM('Unpaid','Paid') NOT NULL DEFAULT 'Unpaid',
  `reported_at` DATETIME NOT NULL,
  `verified_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `staff_notes` VARCHAR(500) DEFAULT NULL,
  `paid_at` DATETIME DEFAULT NULL,
  `payment_recorded_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`lost_book_report_id`),
  UNIQUE KEY `uq_lost_book_transaction` (`transaction_id`),
  KEY `idx_lost_book_user_status` (`user_id`, `report_status`, `payment_status`),
  CONSTRAINT `fk_lost_book_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `borrow_transactions` (`transaction_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_lost_book_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_lost_book_copy` FOREIGN KEY (`physical_copy_id`) REFERENCES `physical_copies` (`physical_copy_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_lost_book_verifier` FOREIGN KEY (`verified_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_lost_book_payment_recorder` FOREIGN KEY (`payment_recorded_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `fine_payment_allocations`
  ADD CONSTRAINT `fk_fine_allocation_lost`
    FOREIGN KEY (`lost_book_report_id`) REFERENCES `lost_book_reports` (`lost_book_report_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- ============================================================================
-- 5. QR-BASED ATTENDANCE MONITORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS `academic_terms` (
  `academic_term_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year` VARCHAR(20) NOT NULL,
  `term_name` VARCHAR(100) NOT NULL,
  `starts_on` DATE NOT NULL,
  `ends_on` DATE NOT NULL,
  `is_active` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`academic_term_id`),
  UNIQUE KEY `uq_academic_terms_name_year` (`academic_year`, `term_name`),
  KEY `idx_academic_terms_dates` (`starts_on`, `ends_on`),
  KEY `idx_academic_terms_active_dates` (`is_active`, `starts_on`, `ends_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `attendance_date` DATE NOT NULL,
  `time_in` TIME NOT NULL,
  `time_out` TIME DEFAULT NULL,
  `reason_for_visit` ENUM('Library Visit', 'Study', 'Research', 'Book Borrowing', 'Printing', 'Photocopy') NOT NULL,
  `qr_reference` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_attendance_user_date` (`user_id`, `attendance_date`),
  KEY `idx_attendance_date_time` (`attendance_date`, `time_in`),
  KEY `idx_attendance_reason` (`reason_for_visit`),
  KEY `idx_attendance_presence` (`attendance_date`, `time_out`, `user_id`),
  KEY `idx_attendance_purpose_date` (`reason_for_visit`, `attendance_date`),
  CONSTRAINT `fk_attendance_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- 6. ONLINE PRINTING SERVICE REQUEST AND QUEUE
-- Store only file metadata/path here; do not store uploaded binary files.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `print_requests` (
  `request_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `processed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `number_of_copies` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `print_type` ENUM('Colored', 'Monochrome') NOT NULL DEFAULT 'Monochrome',
  `optional_notes` TEXT,
  `calculated_cost` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `job_status` ENUM('Pending', 'Printing', 'Ready for Pickup', 'Completed') NOT NULL DEFAULT 'Pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  `completed_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `idx_print_user_status` (`user_id`, `job_status`),
  KEY `idx_print_queue` (`job_status`, `created_at`),
  KEY `idx_print_processed_by` (`processed_by_user_id`),
  CONSTRAINT `fk_print_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_print_processed_by`
    FOREIGN KEY (`processed_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `printing_service_settings` (
  `settings_id` TINYINT UNSIGNED NOT NULL,
  `accepting_requests` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  `unavailable_reason` VARCHAR(255) DEFAULT NULL,
  `updated_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`settings_id`),
  KEY `idx_print_service_accepting` (`accepting_requests`),
  KEY `idx_print_service_updated_by` (`updated_by_user_id`),
  CONSTRAINT `fk_print_service_updated_by`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `printing_service_settings` (`settings_id`,`accepting_requests`) VALUES (1,1);

CREATE TABLE IF NOT EXISTS `print_file_download_audit` (
  `download_audit_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_id` BIGINT UNSIGNED NOT NULL,
  `downloaded_by_user_id` BIGINT UNSIGNED NOT NULL,
  `downloaded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `source_ip` VARCHAR(45) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`download_audit_id`),
  KEY `idx_print_download_request_date` (`request_id`,`downloaded_at`),
  KEY `idx_print_download_user_date` (`downloaded_by_user_id`,`downloaded_at`),
  CONSTRAINT `fk_print_download_request` FOREIGN KEY (`request_id`) REFERENCES `print_requests` (`request_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_print_download_user` FOREIGN KEY (`downloaded_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- 7. PRINTING SUPPLIES AND ASSET MANAGEMENT
-- Replenishment history is normalized into a child table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `printers` (
  `printer_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `printer_name` VARCHAR(100) NOT NULL,
  `printer_model` VARCHAR(100) DEFAULT NULL,
  `location` VARCHAR(100) NOT NULL,
  `is_active` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`printer_id`),
  UNIQUE KEY `uq_printers_name_location` (`printer_name`, `location`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `ink_repository` (
  `ink_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `printer_id` INT UNSIGNED DEFAULT NULL,
  `cartridge_type` VARCHAR(100) NOT NULL,
  `color_variation` ENUM('Cyan', 'Magenta', 'Yellow', 'Black') NOT NULL,
  `available_bottles` INT UNSIGNED NOT NULL DEFAULT 0,
  `low_stock_threshold_bottles` INT UNSIGNED NOT NULL DEFAULT 1,
  `cost_per_bottle` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `remaining_fluid_percentage` DECIMAL(5,2) UNSIGNED NOT NULL DEFAULT 100.00,
  `low_ink_threshold` DECIMAL(5,2) UNSIGNED NOT NULL DEFAULT 20.00,
  `last_replenished_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`ink_id`),
  KEY `idx_ink_printer` (`printer_id`),
  KEY `idx_ink_color` (`color_variation`),
  CONSTRAINT `fk_ink_printer`
    FOREIGN KEY (`printer_id`) REFERENCES `printers` (`printer_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `bond_paper_stocks` (
  `paper_stock_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `paper_size_dimension` ENUM('Short', 'A4', 'Long') NOT NULL,
  `remaining_reams` DECIMAL(8,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `unopened_reams` INT UNSIGNED NOT NULL DEFAULT 0,
  `low_stock_threshold_reams` DECIMAL(8,2) UNSIGNED NOT NULL DEFAULT 2.00,
  `average_expense_cost` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`paper_stock_id`),
  UNIQUE KEY `uq_paper_size` (`paper_size_dimension`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `paper_replenishments` (
  `replenishment_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `paper_stock_id` INT UNSIGNED NOT NULL,
  `recorded_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `replenishment_date` DATETIME NOT NULL,
  `quantity_added_reams` DECIMAL(8,2) UNSIGNED NOT NULL,
  `expense_cost` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `notes` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`replenishment_id`),
  KEY `idx_paper_replenishment_stock_date` (`paper_stock_id`, `replenishment_date`),
  KEY `idx_paper_replenishment_recorder` (`recorded_by_user_id`),
  CONSTRAINT `fk_replenishment_stock`
    FOREIGN KEY (`paper_stock_id`) REFERENCES `bond_paper_stocks` (`paper_stock_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_replenishment_recorder`
    FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `print_cash_payments` (
  `print_cash_payment_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_id` BIGINT UNSIGNED NOT NULL,
  `amount_paid` DECIMAL(10,2) UNSIGNED NOT NULL,
  `received_by_user_id` BIGINT UNSIGNED NULL,
  `received_at` DATETIME NOT NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`print_cash_payment_id`),
  UNIQUE KEY `uq_print_cash_request` (`request_id`),
  KEY `idx_print_cash_received_at` (`received_at`),
  KEY `idx_print_cash_received_date` (`received_by_user_id`,`received_at`),
  CONSTRAINT `fk_print_cash_request` FOREIGN KEY (`request_id`) REFERENCES `print_requests` (`request_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_print_cash_receiver` FOREIGN KEY (`received_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `ink_stock_movements` (
  `ink_stock_movement_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ink_id` INT UNSIGNED NOT NULL,
  `movement_type` ENUM('Restock','Issued','Adjustment','Reversal') NOT NULL,
  `activity_code` VARCHAR(32) NOT NULL DEFAULT 'Legacy',
  `quantity_bottles` INT UNSIGNED NOT NULL,
  `unit_cost_per_bottle` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `expense_amount` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `balance_before` INT UNSIGNED NULL,
  `balance_after` INT UNSIGNED NULL,
  `recorded_by_user_id` BIGINT UNSIGNED NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ink_stock_movement_id`),
  KEY `idx_ink_movement_stock_date` (`ink_id`,`created_at`),
  KEY `idx_ink_movement_type_date` (`movement_type`,`created_at`),
  KEY `idx_ink_activity_date` (`activity_code`,`created_at`),
  CONSTRAINT `fk_ink_movement_stock` FOREIGN KEY (`ink_id`) REFERENCES `ink_repository` (`ink_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_ink_movement_recorder` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `paper_stock_movements` (
  `paper_stock_movement_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `paper_stock_id` INT UNSIGNED NOT NULL,
  `print_request_id` BIGINT UNSIGNED NULL,
  `movement_type` ENUM('Restock','Issued','Adjustment','Reversal') NOT NULL,
  `activity_code` VARCHAR(32) NOT NULL DEFAULT 'Legacy',
  `quantity_reams` DECIMAL(10,4) UNSIGNED NOT NULL,
  `unit_cost_per_ream` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `expense_amount` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `balance_before` DECIMAL(10,4) UNSIGNED NULL,
  `balance_after` DECIMAL(10,4) UNSIGNED NULL,
  `recorded_by_user_id` BIGINT UNSIGNED NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`paper_stock_movement_id`),
  UNIQUE KEY `uq_paper_movement_request_issue` (`print_request_id`,`movement_type`),
  KEY `idx_paper_movement_stock_date` (`paper_stock_id`,`created_at`),
  KEY `idx_paper_movement_type_date` (`movement_type`,`created_at`),
  KEY `idx_paper_activity_date` (`activity_code`,`created_at`),
  CONSTRAINT `fk_paper_movement_stock` FOREIGN KEY (`paper_stock_id`) REFERENCES `bond_paper_stocks` (`paper_stock_id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_paper_movement_request` FOREIGN KEY (`print_request_id`) REFERENCES `print_requests` (`request_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_paper_movement_recorder` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- 8. SYSTEM NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS `notifications` (
  `notification_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `message_title` VARCHAR(150) NOT NULL,
  `message_body` TEXT NOT NULL,
  `trigger_type` ENUM('Due Date', 'Overdue Penalty', 'Reservation Arrival', 'Printing Update', 'Library Schedule', 'Announcement', 'Lost Book', 'Fine') NOT NULL,
  `source_type` VARCHAR(40) DEFAULT NULL,
  `source_id` BIGINT UNSIGNED DEFAULT NULL,
  `action_path` VARCHAR(255) DEFAULT NULL,
  `priority` ENUM('Normal','Important','Urgent') NOT NULL DEFAULT 'Normal',
  `dedupe_key` VARCHAR(191) DEFAULT NULL,
  `scheduled_for` DATETIME DEFAULT NULL,
  `delivered_at` DATETIME DEFAULT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `is_read` TINYINT(1) UNSIGNED NOT NULL DEFAULT 0,
  `notification_timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  UNIQUE KEY `uq_notification_user_dedupe` (`user_id`, `dedupe_key`),
  KEY `idx_notification_user_read` (`user_id`, `is_read`),
  KEY `idx_notification_timestamp` (`notification_timestamp`),
  KEY `idx_notification_trigger` (`trigger_type`),
  KEY `idx_notification_schedule` (`scheduled_for`, `delivered_at`),
  KEY `idx_notification_source` (`source_type`, `source_id`),
  CONSTRAINT `fk_notification_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `library_closed_days` (
  `closed_date` DATE NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `created_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`closed_date`),
  KEY `idx_library_closed_days_creator` (`created_by_user_id`),
  CONSTRAINT `fk_library_closed_days_creator`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `library_operating_schedule` (
  `day_of_week` TINYINT UNSIGNED NOT NULL,
  `is_open` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  `opens_at` TIME DEFAULT NULL,
  `closes_at` TIME DEFAULT NULL,
  `updated_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`day_of_week`),
  CONSTRAINT `fk_library_schedule_updater` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `library_operating_schedule` (`day_of_week`,`is_open`,`opens_at`,`closes_at`) VALUES
  (1,1,'07:00:00','17:00:00'),(2,1,'07:00:00','17:00:00'),(3,1,'07:00:00','17:00:00'),
  (4,1,'07:00:00','17:00:00'),(5,1,'07:00:00','17:00:00'),(6,1,'07:00:00','17:00:00'),(7,0,NULL,NULL);

CREATE TABLE IF NOT EXISTS `announcements` (
  `announcement_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(150) NOT NULL,
  `message_body` TEXT NOT NULL,
  `priority` ENUM('Normal','Important','Urgent') NOT NULL DEFAULT 'Normal',
  `announcement_status` ENUM('Draft','Scheduled','Published','Archived') NOT NULL DEFAULT 'Draft',
  `publish_at` DATETIME DEFAULT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `published_at` DATETIME DEFAULT NULL,
  `archived_at` DATETIME DEFAULT NULL,
  `created_by_user_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`announcement_id`),
  KEY `idx_announcement_status_publish` (`announcement_status`, `publish_at`),
  CONSTRAINT `fk_announcement_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `announcement_revisions` (
  `announcement_revision_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `announcement_id` BIGINT UNSIGNED NOT NULL,
  `revision_number` INT UNSIGNED NOT NULL,
  `title_snapshot` VARCHAR(150) NOT NULL,
  `body_snapshot` TEXT NOT NULL,
  `priority_snapshot` ENUM('Normal','Important','Urgent') NOT NULL,
  `changed_by_user_id` BIGINT UNSIGNED NOT NULL,
  `change_reason` VARCHAR(500) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`announcement_revision_id`),
  UNIQUE KEY `uq_announcement_revision` (`announcement_id`, `revision_number`),
  CONSTRAINT `fk_announcement_revision_parent` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`announcement_id`) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_announcement_revision_actor` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `admin_notifications` (
  `admin_notification_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_type` ENUM('reservation_requested','reservation_cancelled','borrow_request_submitted','borrow_request_cancelled','checkout_confirmed','return_completed','overdue_detected','lost_book_reported','lost_book_confirmed') NOT NULL,
  `actor_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `reservation_id` BIGINT UNSIGNED DEFAULT NULL,
  `borrow_transaction_id` BIGINT UNSIGNED DEFAULT NULL,
  `book_title_id` BIGINT UNSIGNED DEFAULT NULL,
  `message_title` VARCHAR(150) NOT NULL,
  `message_body` VARCHAR(500) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_notification_id`),
  KEY `idx_admin_notifications_created` (`created_at`, `admin_notification_id`),
  KEY `idx_admin_notifications_event_created` (`event_type`, `created_at`),
  KEY `idx_admin_notifications_reservation` (`reservation_id`),
  KEY `idx_admin_notifications_borrow` (`borrow_transaction_id`),
  CONSTRAINT `fk_admin_notifications_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_admin_notifications_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`reservation_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_admin_notifications_borrow` FOREIGN KEY (`borrow_transaction_id`) REFERENCES `borrow_transactions` (`transaction_id`) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_admin_notifications_title` FOREIGN KEY (`book_title_id`) REFERENCES `titles` (`title_id`) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Read-only compatibility ledger for integrations using queue-phase names.
CREATE OR REPLACE ALGORITHM=MERGE VIEW `borrow_records` AS
SELECT
  bt.`transaction_id` AS `id`,
  bt.`request_group_id`,
  bt.`reservation_id`,
  bt.`user_id`,
  bt.`physical_copy_id`,
  CASE bt.`transaction_status`
    WHEN 'Pending' THEN 'pending_claim'
    WHEN 'Borrowed' THEN 'active'
    WHEN 'Overdue' THEN 'overdue'
    WHEN 'Returned' THEN 'returned'
    WHEN 'Cancelled' THEN 'cancelled'
  END AS `borrow_status`,
  bt.`borrowed_at` AS `borrow_date`,
  bt.`due_at` AS `due_date`,
  bt.`returned_at` AS `return_date`,
  bt.`cancelled_at`,
  bt.`created_at`,
  bt.`updated_at`
FROM `borrow_transactions` bt;

-- ============================================================================
-- 9. MYSQL 5.6-COMPATIBLE BUSINESS-RULE TRIGGERS
-- MySQL 5.6 parses CHECK clauses but does not enforce them, so triggers enforce
-- the critical borrowing, due-time, and ink-percentage rules.
-- ============================================================================

DELIMITER $$

DROP TRIGGER IF EXISTS `trg_research_inventory_lost_before_insert`$$
CREATE TRIGGER `trg_research_inventory_lost_before_insert`
BEFORE INSERT ON `research_inventory`
FOR EACH ROW
SET NEW.`availability_status` = IF(NEW.`condition_state` = 'lost', 'unavailable', NEW.`availability_status`)$$

DROP TRIGGER IF EXISTS `trg_research_inventory_lost_before_update`$$
CREATE TRIGGER `trg_research_inventory_lost_before_update`
BEFORE UPDATE ON `research_inventory`
FOR EACH ROW
SET NEW.`availability_status` = IF(NEW.`condition_state` = 'lost', 'unavailable', NEW.`availability_status`)$$

DROP TRIGGER IF EXISTS `trg_research_inventory_lost_after_insert`$$
CREATE TRIGGER `trg_research_inventory_lost_after_insert`
AFTER INSERT ON `research_inventory`
FOR EACH ROW
UPDATE `materials` SET `availability_status` = 'Unavailable', `updated_at` = NOW()
WHERE NEW.`condition_state` = 'lost' AND `barcode` = NEW.`barcode`$$

DROP TRIGGER IF EXISTS `trg_research_inventory_lost_after_update`$$
CREATE TRIGGER `trg_research_inventory_lost_after_update`
AFTER UPDATE ON `research_inventory`
FOR EACH ROW
UPDATE `materials` SET `availability_status` = 'Unavailable', `updated_at` = NOW()
WHERE NEW.`condition_state` = 'lost' AND `barcode` = NEW.`barcode`$$

DROP TRIGGER IF EXISTS `trg_material_research_lost_before_update`$$
CREATE TRIGGER `trg_material_research_lost_before_update`
BEFORE UPDATE ON `materials`
FOR EACH ROW
SET NEW.`availability_status` = IF(
  EXISTS (SELECT 1 FROM `research_inventory` ri WHERE ri.`barcode` = NEW.`barcode` AND ri.`condition_state` = 'lost'),
  'Unavailable', NEW.`availability_status`
)$$

DROP TRIGGER IF EXISTS `trg_borrow_before_insert`$$
CREATE TRIGGER `trg_borrow_before_insert`
BEFORE INSERT ON `borrow_transactions`
FOR EACH ROW
BEGIN
  DECLARE v_role_name VARCHAR(50);
  DECLARE v_account_status VARCHAR(20);
  DECLARE v_active_user_count INT DEFAULT 0;
  DECLARE v_active_material_count INT DEFAULT 0;
  DECLARE v_locked_material_id BIGINT UNSIGNED;

  IF NEW.`transaction_status` IN ('Borrowed', 'Overdue') THEN
    IF NEW.`borrowed_at` IS NULL THEN
      SET NEW.`borrowed_at` = NOW();
    END IF;

    -- Strict one-day loan period with an 8:59 AM cutoff on the next day.
    SET NEW.`due_at` = TIMESTAMP(
      DATE_ADD(DATE(NEW.`borrowed_at`), INTERVAL 1 DAY),
      '08:59:00'
    );

    -- Lock the user and material rows to serialize competing borrow attempts.
    SELECT r.`role_name`, u.`account_status`
      INTO v_role_name, v_account_status
      FROM `users` u
      INNER JOIN `roles` r ON r.`role_id` = u.`role_id`
      WHERE u.`user_id` = NEW.`user_id`
      FOR UPDATE;

    IF v_account_status <> 'Active' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Deactivated users cannot borrow materials.';
    END IF;

    SELECT m.`material_id`
      INTO v_locked_material_id
      FROM `materials` m
      WHERE m.`material_id` = NEW.`material_id`
      FOR UPDATE;

    SELECT COUNT(*)
      INTO v_active_material_count
      FROM `borrow_transactions`
      WHERE `material_id` = NEW.`material_id`
        AND `transaction_status` IN ('Borrowed', 'Overdue');

    IF v_active_material_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Material already has an active borrow transaction.';
    END IF;

    IF v_role_name = 'Student' THEN
      SELECT COUNT(*)
        INTO v_active_user_count
        FROM `borrow_transactions`
        WHERE `user_id` = NEW.`user_id`
          AND `transaction_status` IN ('Borrowed', 'Overdue');

      IF v_active_user_count >= 2 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Student borrowing limit exceeded: maximum of two active materials.';
      END IF;
    END IF;
  ELSEIF NEW.`borrowed_at` IS NOT NULL THEN
    SET NEW.`due_at` = TIMESTAMP(
      DATE_ADD(DATE(NEW.`borrowed_at`), INTERVAL 1 DAY),
      '08:59:00'
    );
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_borrow_before_update`$$
CREATE TRIGGER `trg_borrow_before_update`
BEFORE UPDATE ON `borrow_transactions`
FOR EACH ROW
BEGIN
  DECLARE v_role_name VARCHAR(50);
  DECLARE v_account_status VARCHAR(20);
  DECLARE v_active_user_count INT DEFAULT 0;
  DECLARE v_active_material_count INT DEFAULT 0;
  DECLARE v_locked_material_id BIGINT UNSIGNED;

  IF NEW.`transaction_status` IN ('Borrowed', 'Overdue') THEN
    IF NEW.`borrowed_at` IS NULL THEN
      SET NEW.`borrowed_at` = NOW();
    END IF;

    SET NEW.`due_at` = TIMESTAMP(
      DATE_ADD(DATE(NEW.`borrowed_at`), INTERVAL 1 DAY),
      '08:59:00'
    );

    SELECT r.`role_name`, u.`account_status`
      INTO v_role_name, v_account_status
      FROM `users` u
      INNER JOIN `roles` r ON r.`role_id` = u.`role_id`
      WHERE u.`user_id` = NEW.`user_id`
      FOR UPDATE;

    IF v_account_status <> 'Active' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Deactivated users cannot borrow materials.';
    END IF;

    SELECT m.`material_id`
      INTO v_locked_material_id
      FROM `materials` m
      WHERE m.`material_id` = NEW.`material_id`
      FOR UPDATE;

    SELECT COUNT(*)
      INTO v_active_material_count
      FROM `borrow_transactions`
      WHERE `material_id` = NEW.`material_id`
        AND `transaction_status` IN ('Borrowed', 'Overdue')
        AND `transaction_id` <> NEW.`transaction_id`;

    IF v_active_material_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Material already has another active borrow transaction.';
    END IF;

    IF v_role_name = 'Student' THEN
      SELECT COUNT(*)
        INTO v_active_user_count
        FROM `borrow_transactions`
        WHERE `user_id` = NEW.`user_id`
          AND `transaction_status` IN ('Borrowed', 'Overdue')
          AND `transaction_id` <> NEW.`transaction_id`;

      IF v_active_user_count >= 2 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Student borrowing limit exceeded: maximum of two active materials.';
      END IF;
    END IF;
  ELSEIF NEW.`borrowed_at` IS NOT NULL THEN
    SET NEW.`due_at` = TIMESTAMP(
      DATE_ADD(DATE(NEW.`borrowed_at`), INTERVAL 1 DAY),
      '08:59:00'
    );
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_borrow_after_insert`$$
CREATE TRIGGER `trg_borrow_after_insert`
AFTER INSERT ON `borrow_transactions`
FOR EACH ROW
BEGIN
  IF NEW.`transaction_status` IN ('Borrowed', 'Overdue') THEN
    UPDATE `materials`
      SET `availability_status` = 'Borrowed',
          `updated_at` = NOW()
      WHERE `material_id` = NEW.`material_id`;
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_borrow_after_update`$$
CREATE TRIGGER `trg_borrow_after_update`
AFTER UPDATE ON `borrow_transactions`
FOR EACH ROW
BEGIN
  DECLARE v_waiting_reservations INT DEFAULT 0;

  IF NEW.`transaction_status` IN ('Borrowed', 'Overdue') THEN
    UPDATE `materials`
      SET `availability_status` = 'Borrowed',
          `updated_at` = NOW()
      WHERE `material_id` = NEW.`material_id`;
  ELSEIF NEW.`transaction_status` = 'Returned' THEN
    SELECT COUNT(*)
      INTO v_waiting_reservations
      FROM `reservations`
      WHERE `material_id` = NEW.`material_id`
        AND `reservation_status` = 'Waiting';

    UPDATE `materials`
      SET `availability_status` = IF(v_waiting_reservations > 0, 'Reserved', 'Available'),
          `updated_at` = NOW()
      WHERE `material_id` = NEW.`material_id`;
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_fine_before_insert`$$
CREATE TRIGGER `trg_fine_before_insert`
BEFORE INSERT ON `fines`
FOR EACH ROW
BEGIN
  DECLARE v_transaction_user_id BIGINT UNSIGNED;

  IF NEW.`transaction_id` IS NOT NULL THEN
    SELECT `user_id`
      INTO v_transaction_user_id
      FROM `borrow_transactions`
      WHERE `transaction_id` = NEW.`transaction_id`;

    SET NEW.`user_id` = v_transaction_user_id;
  END IF;

  IF NEW.`payment_status` = 'Paid' AND NEW.`paid_at` IS NULL THEN
    SET NEW.`paid_at` = NOW();
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_fine_before_update`$$
CREATE TRIGGER `trg_fine_before_update`
BEFORE UPDATE ON `fines`
FOR EACH ROW
BEGIN
  DECLARE v_transaction_user_id BIGINT UNSIGNED;

  IF NEW.`transaction_id` IS NOT NULL THEN
    SELECT `user_id`
      INTO v_transaction_user_id
      FROM `borrow_transactions`
      WHERE `transaction_id` = NEW.`transaction_id`;

    SET NEW.`user_id` = v_transaction_user_id;
  END IF;

  IF NEW.`payment_status` = 'Paid' AND NEW.`paid_at` IS NULL THEN
    SET NEW.`paid_at` = NOW();
  ELSEIF NEW.`payment_status` = 'Unpaid' THEN
    SET NEW.`paid_at` = NULL;
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_ink_before_insert`$$
CREATE TRIGGER `trg_ink_before_insert`
BEFORE INSERT ON `ink_repository`
FOR EACH ROW
BEGIN
  IF NEW.`remaining_fluid_percentage` > 100.00 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Remaining ink percentage cannot exceed 100.';
  END IF;

  IF NEW.`low_ink_threshold` > 100.00 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Low-ink threshold cannot exceed 100.';
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_ink_before_update`$$
CREATE TRIGGER `trg_ink_before_update`
BEFORE UPDATE ON `ink_repository`
FOR EACH ROW
BEGIN
  IF NEW.`remaining_fluid_percentage` > 100.00 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Remaining ink percentage cannot exceed 100.';
  END IF;

  IF NEW.`low_ink_threshold` > 100.00 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Low-ink threshold cannot exceed 100.';
  END IF;
END$$

DELIMITER ;

-- End of schema.
SELECT 'STI Ormoc Smart Library schema created successfully.' AS `schema_status`;
