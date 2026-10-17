-- MySQL rollback-reference mirror of the Supabase Phase 6 registration state.
ALTER TABLE users MODIFY COLUMN user_role ENUM('Admin','Librarian','Student','Faculty','Staff') NOT NULL;
ALTER TABLE accounts MODIFY COLUMN role ENUM('Student','Faculty','Librarian','Admin','Staff') NOT NULL;

INSERT IGNORE INTO roles (role_name, description)
VALUES ('Library Staff', 'Restricted library operations');

CREATE TABLE IF NOT EXISTS registration_requests (
  request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(50) NOT NULL,
  email VARCHAR(191) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  program_strand VARCHAR(150) NULL,
  year_grade_level VARCHAR(100) NULL,
  requested_role VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PendingEmail',
  code_hash CHAR(64) NULL,
  code_expires_at DATETIME NULL,
  code_sent_at DATETIME NULL,
  code_attempts SMALLINT NOT NULL DEFAULT 0,
  email_verified_at DATETIME NULL,
  reviewed_by_account_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  review_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_registration_school_id (school_id),
  UNIQUE KEY uq_registration_email (email),
  KEY idx_registration_requests_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS profile_avatar_submissions (
  submission_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id BIGINT UNSIGNED NOT NULL,
  storage_path VARCHAR(255) NOT NULL,
  mime_type VARCHAR(30) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'Pending',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_account_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  review_reason VARCHAR(500) NULL,
  UNIQUE KEY uq_profile_avatar_path (storage_path),
  KEY idx_profile_avatars_account (account_id, submitted_at),
  KEY idx_profile_avatars_status (status, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
