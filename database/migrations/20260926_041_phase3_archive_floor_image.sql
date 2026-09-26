ALTER TABLE titles ADD COLUMN archived_by_account_id BIGINT UNSIGNED NULL;
ALTER TABLE titles ADD INDEX idx_titles_archived_by (archived_by_account_id);
ALTER TABLE titles ADD CONSTRAINT fk_titles_archived_by_account FOREIGN KEY (archived_by_account_id) REFERENCES accounts(account_id);

CREATE TABLE floor_plan_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  storage_path VARCHAR(255) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  uploaded_by_account_id BIGINT UNSIGNED NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_floor_plan_images_uploaded (uploaded_at),
  CONSTRAINT fk_floor_plan_image_actor FOREIGN KEY (uploaded_by_account_id) REFERENCES accounts(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
