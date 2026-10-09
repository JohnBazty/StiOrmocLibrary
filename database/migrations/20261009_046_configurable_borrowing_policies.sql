-- Configurable immutable borrowing policy versions.
-- Legacy baseline mirrors pre-policy hardcoded Student=2 / 1 day / 08:59 behavior.

CREATE TABLE IF NOT EXISTS `borrowing_policy_versions` (
  `borrowing_policy_version_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `effective_on` DATE NOT NULL,
  `student_max_active_books` INT UNSIGNED NOT NULL,
  `faculty_max_active_books` INT UNSIGNED DEFAULT NULL,
  `borrowing_days` INT UNSIGNED NOT NULL,
  `due_time_cutoff` TIME NOT NULL,
  `max_renewals` INT UNSIGNED NOT NULL,
  `renewal_extension_days` INT UNSIGNED NOT NULL,
  `student_max_active_reservations` INT UNSIGNED NOT NULL,
  `faculty_max_active_reservations` INT UNSIGNED DEFAULT NULL,
  `block_renewal_if_overdue` TINYINT(1) NOT NULL DEFAULT 1,
  `block_renewal_if_unpaid_fines` TINYINT(1) NOT NULL DEFAULT 1,
  `block_renewal_if_reserved` TINYINT(1) NOT NULL DEFAULT 1,
  `long_overdue_after_days` INT UNSIGNED DEFAULT NULL,
  `change_reason` VARCHAR(500) NOT NULL,
  `created_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`borrowing_policy_version_id`),
  KEY `idx_borrowing_policy_effective` (`effective_on`, `borrowing_policy_version_id`),
  CONSTRAINT `fk_borrowing_policy_created_by`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `borrowing_policy_material_rules` (
  `borrowing_policy_version_id` BIGINT UNSIGNED NOT NULL,
  `material_type` VARCHAR(40) NOT NULL,
  `is_borrowable` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`borrowing_policy_version_id`, `material_type`),
  CONSTRAINT `fk_borrowing_policy_material_version`
    FOREIGN KEY (`borrowing_policy_version_id`) REFERENCES `borrowing_policy_versions` (`borrowing_policy_version_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO `borrowing_policy_versions` (
  `borrowing_policy_version_id`,
  `effective_on`,
  `student_max_active_books`,
  `faculty_max_active_books`,
  `borrowing_days`,
  `due_time_cutoff`,
  `max_renewals`,
  `renewal_extension_days`,
  `student_max_active_reservations`,
  `faculty_max_active_reservations`,
  `block_renewal_if_overdue`,
  `block_renewal_if_unpaid_fines`,
  `block_renewal_if_reserved`,
  `long_overdue_after_days`,
  `change_reason`,
  `created_by_user_id`
)
SELECT
  1,
  '2000-01-01',
  2,
  NULL,
  1,
  '08:59:00',
  1,
  1,
  2,
  NULL,
  1,
  1,
  1,
  NULL,
  'Legacy baseline reflecting behavior before configurable borrowing policies.',
  NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `borrowing_policy_versions` WHERE `borrowing_policy_version_id` = 1
);

INSERT INTO `borrowing_policy_material_rules` (`borrowing_policy_version_id`, `material_type`, `is_borrowable`)
SELECT 1, 'Book', 1 FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `borrowing_policy_material_rules`
  WHERE `borrowing_policy_version_id` = 1 AND `material_type` = 'Book'
);

INSERT INTO `borrowing_policy_material_rules` (`borrowing_policy_version_id`, `material_type`, `is_borrowable`)
SELECT 1, 'Thesis/Manuscript', 0 FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `borrowing_policy_material_rules`
  WHERE `borrowing_policy_version_id` = 1 AND `material_type` = 'Thesis/Manuscript'
);

ALTER TABLE `borrow_transactions`
  ADD COLUMN `borrowing_policy_version_id` BIGINT UNSIGNED DEFAULT NULL AFTER `reservation_id`,
  ADD KEY `idx_borrow_policy_version` (`borrowing_policy_version_id`),
  ADD CONSTRAINT `fk_borrow_policy_version`
    FOREIGN KEY (`borrowing_policy_version_id`) REFERENCES `borrowing_policy_versions` (`borrowing_policy_version_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE `reservations`
  ADD COLUMN `borrowing_policy_version_id` BIGINT UNSIGNED DEFAULT NULL AFTER `assigned_physical_copy_id`,
  ADD KEY `idx_reservation_policy_version` (`borrowing_policy_version_id`),
  ADD CONSTRAINT `fk_reservation_policy_version`
    FOREIGN KEY (`borrowing_policy_version_id`) REFERENCES `borrowing_policy_versions` (`borrowing_policy_version_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT;

UPDATE `borrow_transactions`
SET `borrowing_policy_version_id` = 1
WHERE `borrowing_policy_version_id` IS NULL
  AND `transaction_status` IN ('Borrowed', 'Overdue', 'Returned');

UPDATE `reservations`
SET `borrowing_policy_version_id` = 1
WHERE `borrowing_policy_version_id` IS NULL;

DELIMITER $$

DROP TRIGGER IF EXISTS `trg_borrowing_policy_versions_no_update`$$
CREATE TRIGGER `trg_borrowing_policy_versions_no_update`
BEFORE UPDATE ON `borrowing_policy_versions`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Published borrowing policy versions are immutable.';
END$$

DROP TRIGGER IF EXISTS `trg_borrowing_policy_versions_no_delete`$$
CREATE TRIGGER `trg_borrowing_policy_versions_no_delete`
BEFORE DELETE ON `borrowing_policy_versions`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Published borrowing policy versions cannot be deleted.';
END$$

DROP TRIGGER IF EXISTS `trg_borrowing_policy_material_rules_no_update`$$
CREATE TRIGGER `trg_borrowing_policy_material_rules_no_update`
BEFORE UPDATE ON `borrowing_policy_material_rules`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Published borrowing policy material rules are immutable.';
END$$

DROP TRIGGER IF EXISTS `trg_borrowing_policy_material_rules_no_delete`$$
CREATE TRIGGER `trg_borrowing_policy_material_rules_no_delete`
BEFORE DELETE ON `borrowing_policy_material_rules`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Published borrowing policy material rules cannot be deleted.';
END$$

DROP TRIGGER IF EXISTS `trg_borrow_before_insert`$$
CREATE TRIGGER `trg_borrow_before_insert`
BEFORE INSERT ON `borrow_transactions`
FOR EACH ROW
BEGIN
  DECLARE v_account_status VARCHAR(20);
  DECLARE v_active_material_count INT DEFAULT 0;
  DECLARE v_locked_material_id BIGINT UNSIGNED;

  IF NEW.`transaction_status` IN ('Borrowed', 'Overdue') THEN
    IF NEW.`borrowed_at` IS NULL THEN
      SET NEW.`borrowed_at` = NOW();
    END IF;

    IF NEW.`due_at` IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Active loans require an application-supplied due_at.';
    END IF;

    IF NEW.`borrowing_policy_version_id` IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Active loans require a borrowing_policy_version_id.';
    END IF;

    SELECT u.`account_status`
      INTO v_account_status
      FROM `users` u
      WHERE u.`user_id` = NEW.`user_id`
      FOR UPDATE;

    IF v_account_status <> 'Active' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Deactivated users cannot borrow materials.';
    END IF;

    SELECT m.`material_id`
      INTO v_locked_material_id
      FROM `materials` m
      WHERE m.`material_id` = NEW.`material_id`
      FOR UPDATE;

    SELECT COUNT(*)
      INTO v_active_material_count
      FROM `borrow_transactions`
      WHERE `material_id` = NEW.`material_id`
        AND `transaction_status` IN ('Borrowed', 'Overdue');

    IF v_active_material_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Material already has an active borrow transaction.';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS `trg_borrow_before_update`$$
CREATE TRIGGER `trg_borrow_before_update`
BEFORE UPDATE ON `borrow_transactions`
FOR EACH ROW
BEGIN
  DECLARE v_account_status VARCHAR(20);
  DECLARE v_active_material_count INT DEFAULT 0;
  DECLARE v_locked_material_id BIGINT UNSIGNED;

  IF OLD.`borrowing_policy_version_id` IS NOT NULL
     AND NEW.`borrowing_policy_version_id` IS NOT NULL
     AND OLD.`borrowing_policy_version_id` <> NEW.`borrowing_policy_version_id`
     AND OLD.`transaction_status` IN ('Borrowed', 'Overdue', 'Returned') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'borrowing_policy_version_id cannot change after a loan is finalized.';
  END IF;

  IF NEW.`transaction_status` IN ('Borrowed', 'Overdue') THEN
    IF NEW.`borrowed_at` IS NULL THEN
      SET NEW.`borrowed_at` = NOW();
    END IF;

    IF NEW.`due_at` IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Active loans require an application-supplied due_at.';
    END IF;

    IF NEW.`borrowing_policy_version_id` IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Active loans require a borrowing_policy_version_id.';
    END IF;

    SELECT u.`account_status`
      INTO v_account_status
      FROM `users` u
      WHERE u.`user_id` = NEW.`user_id`
      FOR UPDATE;

    IF v_account_status <> 'Active' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Deactivated users cannot borrow materials.';
    END IF;

    SELECT m.`material_id`
      INTO v_locked_material_id
      FROM `materials` m
      WHERE m.`material_id` = NEW.`material_id`
      FOR UPDATE;

    SELECT COUNT(*)
      INTO v_active_material_count
      FROM `borrow_transactions`
      WHERE `material_id` = NEW.`material_id`
        AND `transaction_status` IN ('Borrowed', 'Overdue')
        AND `transaction_id` <> NEW.`transaction_id`;

    IF v_active_material_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Material already has another active borrow transaction.';
    END IF;
  END IF;
END$$

DELIMITER ;
