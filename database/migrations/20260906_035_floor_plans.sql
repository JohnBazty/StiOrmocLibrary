CREATE TABLE IF NOT EXISTS floor_plan_shelves (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  label VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_floor_shelf_label (label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS floor_plan_state (
  id TINYINT UNSIGNED NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  draft LONGTEXT NOT NULL,
  published LONGTEXT NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS floor_plan_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  layout LONGTEXT NOT NULL,
  published_by_account_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_floor_version_actor FOREIGN KEY (published_by_account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS floor_plan_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_floor_event_actor FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO floor_plan_shelves (label)
SELECT DISTINCT TRIM(shelf_location) FROM physical_copies WHERE TRIM(COALESCE(shelf_location,''))<>'';
INSERT IGNORE INTO floor_plan_shelves (label)
SELECT DISTINCT TRIM(shelf_location) FROM categories WHERE TRIM(COALESCE(shelf_location,''))<>'';
INSERT IGNORE INTO floor_plan_shelves (label)
SELECT DISTINCT TRIM(shelf_location) FROM research_inventory WHERE TRIM(COALESCE(shelf_location,''))<>'';
INSERT IGNORE INTO floor_plan_state (id,draft)
VALUES (1,'{"areas":[{"id":"main","name":"Main Library","width":1200,"height":800,"background":null}],"objects":[]}');
