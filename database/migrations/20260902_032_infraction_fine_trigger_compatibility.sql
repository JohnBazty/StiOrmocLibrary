-- Preserve the selected user on standalone behavioral infractions while keeping
-- legacy overdue fines tied to their authoritative borrowing transaction.

DROP TRIGGER IF EXISTS `trg_fine_before_insert`;

CREATE TRIGGER `trg_fine_before_insert`
BEFORE INSERT ON `fines`
FOR EACH ROW
SET
  NEW.`user_id` = IF(
    NEW.`transaction_id` IS NULL,
    NEW.`user_id`,
    (SELECT `user_id` FROM `borrow_transactions` WHERE `transaction_id` = NEW.`transaction_id`)
  ),
  NEW.`paid_at` = IF(
    NEW.`payment_status` = 'Paid' AND NEW.`paid_at` IS NULL,
    NOW(),
    NEW.`paid_at`
  );

DROP TRIGGER IF EXISTS `trg_fine_before_update`;

CREATE TRIGGER `trg_fine_before_update`
BEFORE UPDATE ON `fines`
FOR EACH ROW
SET
  NEW.`user_id` = IF(
    NEW.`transaction_id` IS NULL,
    NEW.`user_id`,
    (SELECT `user_id` FROM `borrow_transactions` WHERE `transaction_id` = NEW.`transaction_id`)
  ),
  NEW.`paid_at` = CASE
    WHEN NEW.`payment_status` = 'Paid' AND NEW.`paid_at` IS NULL THEN NOW()
    WHEN NEW.`payment_status` = 'Unpaid' THEN NULL
    ELSE NEW.`paid_at`
  END;
