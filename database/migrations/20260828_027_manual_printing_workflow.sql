-- Manual printing workflow: request acceptance is controlled at service level,
-- not by registered printer hardware. Legacy printer links remain nullable.
CREATE TABLE IF NOT EXISTS `printing_service_settings` (
  `settings_id` TINYINT UNSIGNED NOT NULL,
  `accepting_requests` TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  `unavailable_reason` VARCHAR(255) NULL,
  `updated_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`settings_id`),
  KEY `idx_print_service_accepting` (`accepting_requests`),
  KEY `idx_print_service_updated_by` (`updated_by_user_id`),
  CONSTRAINT `fk_print_service_updated_by`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `printing_service_settings`
  (`settings_id`, `accepting_requests`, `unavailable_reason`)
VALUES (1, 1, NULL);

CREATE TABLE IF NOT EXISTS `print_file_download_audit` (
  `download_audit_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_id` BIGINT UNSIGNED NOT NULL,
  `downloaded_by_user_id` BIGINT UNSIGNED NOT NULL,
  `downloaded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `source_ip` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  PRIMARY KEY (`download_audit_id`),
  KEY `idx_print_download_request_date` (`request_id`, `downloaded_at`),
  KEY `idx_print_download_user_date` (`downloaded_by_user_id`, `downloaded_at`),
  CONSTRAINT `fk_print_download_request`
    FOREIGN KEY (`request_id`) REFERENCES `print_requests` (`request_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_print_download_user`
    FOREIGN KEY (`downloaded_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
