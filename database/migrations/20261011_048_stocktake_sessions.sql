-- Stocktake sessions, expected snapshots, scans, discrepancies, and resolution events.

CREATE TABLE IF NOT EXISTS `stocktake_sessions` (
  `stocktake_session_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_name` VARCHAR(200) NOT NULL,
  `scope_kind` ENUM('shelf', 'category', 'room', 'collection') NOT NULL,
  `scope_id` VARCHAR(100) DEFAULT NULL,
  `scope_label` VARCHAR(255) NOT NULL,
  `asset_kind` ENUM('book', 'research', 'both') NOT NULL,
  `scope_snapshot` LONGTEXT NOT NULL,
  `status` ENUM('in_progress', 'closed', 'reviewed', 'cancelled') NOT NULL DEFAULT 'in_progress',
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `started_by_label` VARCHAR(255) NOT NULL,
  `closed_at` DATETIME DEFAULT NULL,
  `closed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `closed_by_label` VARCHAR(255) DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `reviewed_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `reviewed_by_label` VARCHAR(255) DEFAULT NULL,
  `cancelled_at` DATETIME DEFAULT NULL,
  `cancelled_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `cancelled_by_label` VARCHAR(255) DEFAULT NULL,
  `cancel_reason` VARCHAR(500) DEFAULT NULL,
  `row_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`stocktake_session_id`),
  KEY `idx_stocktake_sessions_status_started` (`status`, `started_at`),
  KEY `idx_stocktake_sessions_scope` (`scope_kind`, `scope_id`),
  CONSTRAINT `fk_stocktake_sessions_started_by`
    FOREIGN KEY (`started_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_stocktake_sessions_closed_by`
    FOREIGN KEY (`closed_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_stocktake_sessions_reviewed_by`
    FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_stocktake_sessions_cancelled_by`
    FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `stocktake_expected_items` (
  `stocktake_expected_item_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stocktake_session_id` BIGINT UNSIGNED NOT NULL,
  `asset_kind` ENUM('book', 'research') NOT NULL,
  `source_item_id` BIGINT UNSIGNED NOT NULL,
  `barcode` VARCHAR(100) NOT NULL,
  `accession_number` VARCHAR(100) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `category_id` BIGINT UNSIGNED DEFAULT NULL,
  `category_name` VARCHAR(255) DEFAULT NULL,
  `home_shelf_id` BIGINT UNSIGNED DEFAULT NULL,
  `home_shelf_label` VARCHAR(100) NOT NULL,
  `home_shelf_column` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `home_shelf_row` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `condition_snapshot` VARCHAR(40) NOT NULL,
  `availability_snapshot` VARCHAR(40) NOT NULL,
  `lifecycle_snapshot` VARCHAR(40) NOT NULL,
  `row_version_snapshot` INT UNSIGNED NOT NULL,
  `loan_state_snapshot` VARCHAR(40) NOT NULL DEFAULT 'none',
  `reservation_state_snapshot` VARCHAR(40) NOT NULL DEFAULT 'none',
  `close_lifecycle_snapshot` VARCHAR(40) DEFAULT NULL,
  `close_loan_state_snapshot` VARCHAR(40) DEFAULT NULL,
  `close_row_version_snapshot` INT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`stocktake_expected_item_id`),
  UNIQUE KEY `uq_stocktake_expected_item` (`stocktake_session_id`, `asset_kind`, `source_item_id`),
  KEY `idx_stocktake_expected_barcode` (`stocktake_session_id`, `barcode`),
  CONSTRAINT `fk_stocktake_expected_session`
    FOREIGN KEY (`stocktake_session_id`) REFERENCES `stocktake_sessions` (`stocktake_session_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `stocktake_scans` (
  `stocktake_scan_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stocktake_session_id` BIGINT UNSIGNED NOT NULL,
  `request_key` VARCHAR(100) NOT NULL,
  `entered_barcode` VARCHAR(100) NOT NULL,
  `resolved_asset_kind` ENUM('book', 'research') DEFAULT NULL,
  `resolved_source_item_id` BIGINT UNSIGNED DEFAULT NULL,
  `observed_shelf_id` BIGINT UNSIGNED DEFAULT NULL,
  `observed_shelf_label` VARCHAR(100) NOT NULL,
  `observed_shelf_column` TINYINT UNSIGNED DEFAULT NULL,
  `observed_shelf_row` TINYINT UNSIGNED DEFAULT NULL,
  `scan_source` ENUM('scanner', 'manual') NOT NULL,
  `lookup_snapshot` LONGTEXT NOT NULL,
  `scanned_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `scanned_by_label` VARCHAR(255) NOT NULL,
  `scanned_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`stocktake_scan_id`),
  UNIQUE KEY `uq_stocktake_scan_request` (`stocktake_session_id`, `request_key`),
  KEY `idx_stocktake_scans_time` (`stocktake_session_id`, `scanned_at`),
  KEY `idx_stocktake_scans_barcode` (`stocktake_session_id`, `entered_barcode`),
  KEY `idx_stocktake_scans_resolved` (`stocktake_session_id`, `resolved_asset_kind`, `resolved_source_item_id`),
  CONSTRAINT `fk_stocktake_scans_session`
    FOREIGN KEY (`stocktake_session_id`) REFERENCES `stocktake_sessions` (`stocktake_session_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_stocktake_scans_actor`
    FOREIGN KEY (`scanned_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `stocktake_discrepancies` (
  `stocktake_discrepancy_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stocktake_session_id` BIGINT UNSIGNED NOT NULL,
  `finding_key` VARCHAR(191) NOT NULL,
  `finding_code` VARCHAR(40) NOT NULL,
  `status` ENUM('open', 'resolved', 'dismissed', 'blocked') NOT NULL DEFAULT 'open',
  `stocktake_expected_item_id` BIGINT UNSIGNED DEFAULT NULL,
  `stocktake_scan_id` BIGINT UNSIGNED DEFAULT NULL,
  `evidence_snapshot` LONGTEXT NOT NULL,
  `row_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`stocktake_discrepancy_id`),
  UNIQUE KEY `uq_stocktake_discrepancy_key` (`stocktake_session_id`, `finding_key`),
  KEY `idx_stocktake_discrepancies_status` (`stocktake_session_id`, `status`, `finding_code`),
  CONSTRAINT `fk_stocktake_discrepancies_session`
    FOREIGN KEY (`stocktake_session_id`) REFERENCES `stocktake_sessions` (`stocktake_session_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_stocktake_discrepancies_expected`
    FOREIGN KEY (`stocktake_expected_item_id`) REFERENCES `stocktake_expected_items` (`stocktake_expected_item_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_stocktake_discrepancies_scan`
    FOREIGN KEY (`stocktake_scan_id`) REFERENCES `stocktake_scans` (`stocktake_scan_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `stocktake_resolution_events` (
  `stocktake_resolution_event_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stocktake_discrepancy_id` BIGINT UNSIGNED NOT NULL,
  `previous_status` ENUM('open', 'resolved', 'dismissed', 'blocked') NOT NULL,
  `next_status` ENUM('open', 'resolved', 'dismissed', 'blocked') NOT NULL,
  `action` VARCHAR(80) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `before_snapshot` LONGTEXT NOT NULL,
  `after_snapshot` LONGTEXT NOT NULL,
  `inventory_audit_event_id` BIGINT UNSIGNED DEFAULT NULL,
  `research_inventory_audit_event_id` BIGINT UNSIGNED DEFAULT NULL,
  `floor_plan_event_id` BIGINT UNSIGNED DEFAULT NULL,
  `acted_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `acted_by_label` VARCHAR(255) NOT NULL,
  `acted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`stocktake_resolution_event_id`),
  KEY `idx_stocktake_resolution_discrepancy_time` (`stocktake_discrepancy_id`, `acted_at`),
  CONSTRAINT `fk_stocktake_resolution_discrepancy`
    FOREIGN KEY (`stocktake_discrepancy_id`) REFERENCES `stocktake_discrepancies` (`stocktake_discrepancy_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_stocktake_resolution_actor`
    FOREIGN KEY (`acted_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
