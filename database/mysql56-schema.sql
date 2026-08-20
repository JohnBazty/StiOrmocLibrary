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
  `title` VARCHAR(255) NOT NULL,
  `author` VARCHAR(255) NOT NULL,
  `isbn` VARCHAR(30) DEFAULT NULL,
  `publication_year` SMALLINT UNSIGNED DEFAULT NULL,
  `shelf_location` VARCHAR(100) NOT NULL,
  `material_type` ENUM('Book', 'Thesis/Manuscript') NOT NULL DEFAULT 'Book',
  `availability_status` ENUM('Available', 'Borrowed', 'Reserved') NOT NULL DEFAULT 'Available',
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

-- ============================================================================
-- 3. AUTOMATED CIRCULATION AND RESERVATIONS
-- Students are limited to two simultaneous Borrowed/Overdue materials.
-- Faculty and staff roles are not limited by the database trigger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `borrow_transactions` (
  `transaction_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `material_id` BIGINT UNSIGNED NOT NULL,
  `processed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `borrowed_at` DATETIME DEFAULT NULL,
  `due_at` DATETIME DEFAULT NULL,
  `returned_at` DATETIME DEFAULT NULL,
  `transaction_status` ENUM('Pending', 'Borrowed', 'Returned', 'Overdue') NOT NULL DEFAULT 'Pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`transaction_id`),
  KEY `idx_borrow_user_status` (`user_id`, `transaction_status`),
  KEY `idx_borrow_material_status` (`material_id`, `transaction_status`),
  KEY `idx_borrow_due_at` (`due_at`),
  KEY `idx_borrow_processed_by` (`processed_by_user_id`),
  CONSTRAINT `fk_borrow_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_borrow_material`
    FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_borrow_processed_by`
    FOREIGN KEY (`processed_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `reservations` (
  `reservation_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `material_id` BIGINT UNSIGNED NOT NULL,
  `accession_id` BIGINT UNSIGNED DEFAULT NULL,
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
  CONSTRAINT `fk_reservation_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_reservation_material`
    FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_reservation_accession`
    FOREIGN KEY (`accession_id`) REFERENCES `materials` (`material_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. FINES AND DIGITAL CLEARANCE
-- Fine policy: PHP 2.00/hour after the 8:59 AM cutoff on the due date;
-- beginning the following day, use the PHP 10.00/day rate.
-- The service layer records the calculation inputs for auditability.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `fines` (
  `fine_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `fine_amount` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0.00,
  `payment_status` ENUM('Paid', 'Unpaid') NOT NULL DEFAULT 'Unpaid',
  `calculation_basis` ENUM('Hourly', 'Daily', 'Manual') NOT NULL DEFAULT 'Hourly',
  `overdue_units` INT UNSIGNED NOT NULL DEFAULT 0,
  `rate_applied` DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 2.00,
  `applied_date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `paid_at` DATETIME DEFAULT NULL,
  `notes` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`fine_id`),
  UNIQUE KEY `uq_fines_transaction` (`transaction_id`),
  KEY `idx_fines_user_payment` (`user_id`, `payment_status`),
  KEY `idx_fines_applied_date` (`applied_date`),
  CONSTRAINT `fk_fines_transaction`
    FOREIGN KEY (`transaction_id`) REFERENCES `borrow_transactions` (`transaction_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_fines_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
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

-- ============================================================================
-- 5. QR-BASED ATTENDANCE MONITORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `attendance_date` DATE NOT NULL,
  `time_in` TIME NOT NULL,
  `time_out` TIME DEFAULT NULL,
  `reason_for_visit` ENUM('Library Visit', 'Printing', 'Photocopy') NOT NULL,
  `qr_reference` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_attendance_user_date` (`user_id`, `attendance_date`),
  KEY `idx_attendance_date_time` (`attendance_date`, `time_in`),
  KEY `idx_attendance_reason` (`reason_for_visit`),
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

-- ============================================================================
-- 8. SYSTEM NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS `notifications` (
  `notification_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `message_title` VARCHAR(150) NOT NULL,
  `message_body` TEXT NOT NULL,
  `trigger_type` ENUM('Due Date', 'Overdue Penalty', 'Reservation Arrival', 'Printing Update') NOT NULL,
  `is_read` TINYINT(1) UNSIGNED NOT NULL DEFAULT 0,
  `notification_timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notification_user_read` (`user_id`, `is_read`),
  KEY `idx_notification_timestamp` (`notification_timestamp`),
  KEY `idx_notification_trigger` (`trigger_type`),
  CONSTRAINT `fk_notification_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================================
-- 9. MYSQL 5.6-COMPATIBLE BUSINESS-RULE TRIGGERS
-- MySQL 5.6 parses CHECK clauses but does not enforce them, so triggers enforce
-- the critical borrowing, due-time, and ink-percentage rules.
-- ============================================================================

DELIMITER $$

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

  SELECT `user_id`
    INTO v_transaction_user_id
    FROM `borrow_transactions`
    WHERE `transaction_id` = NEW.`transaction_id`;

  SET NEW.`user_id` = v_transaction_user_id;

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

  SELECT `user_id`
    INTO v_transaction_user_id
    FROM `borrow_transactions`
    WHERE `transaction_id` = NEW.`transaction_id`;

  SET NEW.`user_id` = v_transaction_user_id;

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
