-- Configurable values used by both operational dashboards. Operating hours and
-- closure dates remain normalized in library_operating_schedule and
-- library_closed_days.
CREATE TABLE IF NOT EXISTS `library_profile_settings` (
  `settings_id` TINYINT UNSIGNED NOT NULL,
  `library_name` VARCHAR(150) NOT NULL DEFAULT 'STI Ormoc Smart Library',
  `seat_capacity` SMALLINT UNSIGNED NOT NULL DEFAULT 80,
  `information_text` VARCHAR(500) DEFAULT NULL,
  `map_asset_path` VARCHAR(255) DEFAULT NULL,
  `updated_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`settings_id`),
  KEY `idx_library_profile_updater` (`updated_by_user_id`),
  CONSTRAINT `fk_library_profile_updater`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `library_profile_settings`
  (`settings_id`, `library_name`, `seat_capacity`, `information_text`)
VALUES
  (1, 'STI Ormoc Smart Library', 80, 'Borrow books, access research, request printing, and study in the library.');
