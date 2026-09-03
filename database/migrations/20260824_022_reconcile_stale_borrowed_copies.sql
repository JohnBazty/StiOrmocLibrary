-- Repair legacy Borrowed flags that have no authoritative open circulation row.
-- Active counter claims, loans, overdue records, and ready pickup holds are preserved.

UPDATE `physical_copies` pc
LEFT JOIN `borrow_transactions` bt
  ON bt.`physical_copy_id` = pc.`physical_copy_id`
 AND bt.`transaction_status` IN ('Pending','Borrowed','Overdue')
LEFT JOIN `reservations` r
  ON r.`assigned_physical_copy_id` = pc.`physical_copy_id`
 AND r.`reservation_status` = 'ready_for_pickup'
SET pc.`availability_status` = 'Available', pc.`updated_at` = NOW(), pc.`row_version` = pc.`row_version` + 1
WHERE pc.`lifecycle_status` = 'Active'
  AND pc.`availability_status` = 'Borrowed'
  AND bt.`transaction_id` IS NULL
  AND r.`reservation_id` IS NULL;

UPDATE `materials` m
INNER JOIN `physical_copies` pc ON pc.`material_id` = m.`material_id`
SET m.`availability_status` = pc.`availability_status`, m.`updated_at` = NOW()
WHERE m.`availability_status` <> pc.`availability_status`
  AND pc.`lifecycle_status` = 'Active'
  AND NOT EXISTS (
    SELECT 1 FROM `borrow_transactions` active_bt
     WHERE active_bt.`material_id` = m.`material_id`
       AND active_bt.`transaction_status` IN ('Pending','Borrowed','Overdue')
  );
