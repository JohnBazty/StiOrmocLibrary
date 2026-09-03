-- Backfill and preserve the writable circulation bridge for normalized books.
-- MySQL 5.6 / InnoDB / utf8 compatible.

-- Use a temporary mapping so physical-copy synchronization triggers can update
-- materials without MySQL's "table already used by invoking statement" error.
DROP TEMPORARY TABLE IF EXISTS `tmp_book_material_bridge`;

CREATE TEMPORARY TABLE `tmp_book_material_bridge` (
  `physical_copy_id` BIGINT UNSIGNED NOT NULL,
  `material_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`physical_copy_id`),
  UNIQUE KEY `uq_tmp_book_material` (`material_id`)
) ENGINE=InnoDB;

INSERT INTO `tmp_book_material_bridge` (`physical_copy_id`, `material_id`)
SELECT pc.`physical_copy_id`, m.`material_id`
FROM `physical_copies` pc
INNER JOIN `materials` m
  ON m.`barcode` = pc.`barcode` AND m.`material_type` = 'Book'
WHERE pc.`material_id` IS NULL;

UPDATE `physical_copies` pc
INNER JOIN `tmp_book_material_bridge` bridge ON bridge.`physical_copy_id` = pc.`physical_copy_id`
SET pc.`material_id` = bridge.`material_id`, pc.`updated_at` = NOW();

TRUNCATE TABLE `tmp_book_material_bridge`;

-- Create one compatibility material for every still-unlinked normalized book
-- copy. It is required by borrow_transactions and reservation foreign keys.
INSERT INTO `materials`
  (`category_id`, `barcode`, `title`, `author`, `isbn`, `publication_year`,
   `shelf_location`, `material_type`, `availability_status`, `date_added`)
SELECT
  t.`category_id`,
  pc.`barcode`,
  t.`title`,
  LEFT(COALESCE(credits.`author`, 'Unknown author'), 255),
  t.`isbn`,
  t.`publication_year`,
  pc.`shelf_location`,
  'Book',
  CASE pc.`availability_status`
    WHEN 'Available' THEN 'Available'
    WHEN 'Borrowed' THEN 'Borrowed'
    WHEN 'Reserved' THEN 'Reserved'
    ELSE 'Unavailable'
  END,
  pc.`created_at`
FROM `physical_copies` pc
INNER JOIN `titles` t
  ON t.`title_id` = pc.`title_id` AND t.`record_type` = 'Book'
LEFT JOIN (
  SELECT a.`title_id`, GROUP_CONCAT(a.`author_name` ORDER BY a.`author_order` SEPARATOR ', ') AS `author`
  FROM `authors` a
  GROUP BY a.`title_id`
) credits ON credits.`title_id` = t.`title_id`
LEFT JOIN `materials` existing_material ON existing_material.`barcode` = pc.`barcode`
WHERE pc.`material_id` IS NULL
  AND existing_material.`material_id` IS NULL;

-- Link newly inserted compatibility rows without reading materials in the
-- physical-copy UPDATE statement that fires synchronization triggers.
INSERT INTO `tmp_book_material_bridge` (`physical_copy_id`, `material_id`)
SELECT pc.`physical_copy_id`, m.`material_id`
FROM `physical_copies` pc
INNER JOIN `materials` m
  ON m.`barcode` = pc.`barcode` AND m.`material_type` = 'Book'
WHERE pc.`material_id` IS NULL;

UPDATE `physical_copies` pc
INNER JOIN `tmp_book_material_bridge` bridge ON bridge.`physical_copy_id` = pc.`physical_copy_id`
SET pc.`material_id` = bridge.`material_id`, pc.`updated_at` = NOW();

DROP TEMPORARY TABLE `tmp_book_material_bridge`;
