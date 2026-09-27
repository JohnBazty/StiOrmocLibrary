-- MySQL rollback reference for Phase 2 A1. Supabase 011 is the active migration.
ALTER TABLE accounts ADD COLUMN auth_version INT NOT NULL DEFAULT 1;
ALTER TABLE users MODIFY COLUMN account_status ENUM('Active', 'Deactivated', 'Archived') NOT NULL DEFAULT 'Active';
ALTER TABLE users ADD COLUMN auth_version INT NOT NULL DEFAULT 1;

CREATE TABLE account_management_events (
  event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id BIGINT UNSIGNED NOT NULL,
  actor_account_id BIGINT UNSIGNED NOT NULL,
  action_code VARCHAR(30) NOT NULL,
  previous_status VARCHAR(20) NULL,
  new_status VARCHAR(20) NULL,
  changed_fields VARCHAR(255) NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_account_management_events_account (account_id, created_at),
  CONSTRAINT fk_account_management_subject FOREIGN KEY (account_id) REFERENCES accounts(account_id),
  CONSTRAINT fk_account_management_actor FOREIGN KEY (actor_account_id) REFERENCES accounts(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
