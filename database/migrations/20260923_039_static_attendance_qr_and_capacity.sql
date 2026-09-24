-- Permanent offline attendance passes, audited capacity changes, and exact scan timestamps.
-- The QR payload contains an opaque random credential. Personal data is never embedded.

CREATE TABLE IF NOT EXISTS `attendance_qr_credentials` (
  `credential_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `public_id` VARCHAR(40) NOT NULL,
  `secret_hash` BINARY(32) NOT NULL,
  `credential_version` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `credential_status` ENUM('Active','Revoked') NOT NULL DEFAULT 'Active',
  `issued_at` DATETIME NOT NULL,
  `last_used_at` DATETIME DEFAULT NULL,
  `revoked_at` DATETIME DEFAULT NULL,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`credential_id`),
  UNIQUE KEY `uq_attendance_qr_user` (`user_id`),
  UNIQUE KEY `uq_attendance_qr_public_id` (`public_id`),
  KEY `idx_attendance_qr_status` (`credential_status`, `public_id`),
  CONSTRAINT `fk_attendance_qr_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `attendance_logs`
  ADD COLUMN `checked_in_at` DATETIME DEFAULT NULL AFTER `time_in`,
  ADD COLUMN `checked_out_at` DATETIME DEFAULT NULL AFTER `time_out`,
  ADD COLUMN `qr_credential_id` BIGINT UNSIGNED DEFAULT NULL AFTER `qr_reference`,
  ADD COLUMN `scan_method` ENUM('Permanent QR','School ID QR','Dynamic QR','Manual') NOT NULL DEFAULT 'Manual' AFTER `qr_credential_id`,
  ADD COLUMN `checked_in_by_user_id` BIGINT UNSIGNED DEFAULT NULL AFTER `scan_method`,
  ADD COLUMN `checked_out_by_user_id` BIGINT UNSIGNED DEFAULT NULL AFTER `checked_in_by_user_id`,
  ADD COLUMN `entry_request_id` VARCHAR(64) DEFAULT NULL AFTER `checked_out_by_user_id`,
  ADD UNIQUE KEY `uq_attendance_entry_request` (`entry_request_id`),
  ADD KEY `idx_attendance_checked_in_at` (`checked_in_at`),
  ADD KEY `idx_attendance_open_visit` (`attendance_date`, `user_id`, `checked_out_at`),
  ADD KEY `idx_attendance_qr_credential` (`qr_credential_id`),
  ADD KEY `idx_attendance_checkin_staff` (`checked_in_by_user_id`),
  ADD KEY `idx_attendance_checkout_staff` (`checked_out_by_user_id`),
  ADD CONSTRAINT `fk_attendance_qr_credential`
    FOREIGN KEY (`qr_credential_id`) REFERENCES `attendance_qr_credentials` (`credential_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT `fk_attendance_checkin_staff`
    FOREIGN KEY (`checked_in_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT `fk_attendance_checkout_staff`
    FOREIGN KEY (`checked_out_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

UPDATE `attendance_logs`
   SET `checked_in_at` = TIMESTAMP(`attendance_date`, `time_in`),
       `checked_out_at` = CASE WHEN `time_out` IS NULL THEN NULL ELSE TIMESTAMP(`attendance_date`, `time_out`) END
 WHERE `checked_in_at` IS NULL;

CREATE TABLE IF NOT EXISTS `library_capacity_changes` (
  `capacity_change_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `previous_capacity` SMALLINT UNSIGNED NOT NULL,
  `new_capacity` SMALLINT UNSIGNED NOT NULL,
  `change_reason` VARCHAR(255) NOT NULL,
  `changed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `changed_at` DATETIME NOT NULL,
  PRIMARY KEY (`capacity_change_id`),
  KEY `idx_capacity_changes_date` (`changed_at`),
  KEY `idx_capacity_changes_actor` (`changed_by_user_id`),
  CONSTRAINT `fk_capacity_changes_actor`
    FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `notifications`
  MODIFY COLUMN `trigger_type`
    ENUM('Due Date', 'Overdue Penalty', 'Reservation Arrival', 'Printing Update',
         'Library Schedule', 'Announcement', 'Lost Book', 'Fine', 'Attendance') NOT NULL;
