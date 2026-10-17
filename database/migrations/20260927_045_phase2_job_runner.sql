-- MySQL rollback reference only.
CREATE TABLE IF NOT EXISTS `library_job_runs` (
  `job_name` VARCHAR(80) NOT NULL PRIMARY KEY,
  `last_started_at` DATETIME NULL,
  `lease_until` DATETIME NULL,
  `run_token` VARCHAR(36) NULL,
  `last_success_at` DATETIME NULL,
  `last_error_at` DATETIME NULL,
  `last_error` TEXT NULL,
  `run_count` BIGINT NOT NULL DEFAULT 0,
  `failure_count` BIGINT NOT NULL DEFAULT 0,
  `last_duration_ms` INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO `library_job_runs` (`job_name`) VALUES ('operational-minute');
