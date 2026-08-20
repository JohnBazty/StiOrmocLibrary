-- ============================================================================
-- Backfill normalized research publications into the independent thesis ledger
-- MySQL 5.6 compatible | non-destructive and safe through schema_migrations
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

-- Older publications predate the independent ledger form fields. Preserve the
-- unique research code as their initial accession and barcode so those papers
-- become visible immediately and can be audited by a librarian afterward.
INSERT INTO `research_inventory`
  (`title`, `authors`, `adviser`, `publication_year`, `accession_number`,
   `barcode`, `condition_state`, `availability_status`, `shelf_location`,
   `created_at`, `updated_at`)
SELECT
  t.`title`,
  COALESCE(NULLIF(GROUP_CONCAT(a.`author_name` ORDER BY a.`author_order` SEPARATOR ', '), ''), 'Unknown author'),
  rr.`adviser_name`,
  t.`publication_year`,
  rr.`research_code`,
  rr.`research_code`,
  'good',
  IF(rr.`viewing_status` = 'Archived', 'unavailable', 'available'),
  COALESCE(NULLIF(c.`shelf_location`, ''), 'Research Archive'),
  COALESCE(rr.`created_at`, t.`created_at`, NOW()),
  NOW()
FROM `research_records` rr
JOIN `titles` t ON t.`title_id` = rr.`title_id`
LEFT JOIN `authors` a ON a.`title_id` = t.`title_id`
LEFT JOIN `categories` c ON c.`category_id` = t.`category_id`
WHERE t.`record_type` = 'Research/Thesis'
  AND NOT EXISTS (
    SELECT 1
      FROM `research_inventory` ri
     WHERE ri.`barcode` = rr.`research_code`
        OR ri.`accession_number` = rr.`research_code`
  )
GROUP BY t.`title_id`, t.`title`, rr.`adviser_name`, t.`publication_year`,
         rr.`research_code`, rr.`viewing_status`, c.`shelf_location`,
         rr.`created_at`, t.`created_at`;
