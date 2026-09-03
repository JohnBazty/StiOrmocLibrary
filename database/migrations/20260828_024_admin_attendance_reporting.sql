-- Phase 2: configurable academic terms and indexed attendance reporting.
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

ALTER TABLE `attendance_logs`
  MODIFY `reason_for_visit` ENUM(
    'Library Visit', 'Study', 'Research', 'Book Borrowing', 'Printing', 'Photocopy'
  ) NOT NULL;

SET @database_name := DATABASE();
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='attendance_logs' AND INDEX_NAME='idx_attendance_presence')=0,
  'ALTER TABLE `attendance_logs` ADD KEY `idx_attendance_presence` (`attendance_date`, `time_out`, `user_id`)', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@database_name AND TABLE_NAME='attendance_logs' AND INDEX_NAME='idx_attendance_purpose_date')=0,
  'ALTER TABLE `attendance_logs` ADD KEY `idx_attendance_purpose_date` (`reason_for_visit`, `attendance_date`)', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
