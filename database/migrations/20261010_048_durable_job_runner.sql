-- Durable scheduled job leases and run history (MySQL rollback reference).

CREATE TABLE IF NOT EXISTS `scheduled_job_state` (
  `job_name` VARCHAR(64) NOT NULL,
  `lease_token` CHAR(36) DEFAULT NULL,
  `lease_expires_at` DATETIME DEFAULT NULL,
  `last_started_at` DATETIME DEFAULT NULL,
  `last_success_at` DATETIME DEFAULT NULL,
  `last_failure_at` DATETIME DEFAULT NULL,
  `last_outcome` ENUM('succeeded', 'failed', 'skipped') DEFAULT NULL,
  `last_error_code` VARCHAR(64) DEFAULT NULL,
  `last_error_message` VARCHAR(500) DEFAULT NULL,
  `last_result_json` TEXT DEFAULT NULL,
  `progress_cursor` TEXT DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`job_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `scheduled_job_runs` (
  `run_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_name` VARCHAR(64) NOT NULL,
  `started_at` DATETIME NOT NULL,
  `finished_at` DATETIME NOT NULL,
  `outcome` ENUM('succeeded', 'failed', 'skipped') NOT NULL,
  `result_json` TEXT DEFAULT NULL,
  `error_code` VARCHAR(64) DEFAULT NULL,
  `error_message` VARCHAR(500) DEFAULT NULL,
  `lease_token` CHAR(36) DEFAULT NULL,
  PRIMARY KEY (`run_id`),
  KEY `idx_scheduled_job_runs_job_started` (`job_name`, `started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `scheduled_job_state` (`job_name`) VALUES
  ('reservation-expiration'),
  ('circulation-overdue'),
  ('notifications');
