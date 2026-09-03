-- ============================================================================
-- SmartLib Research & Thesis Repository search model
-- MySQL 5.6 compatible | additive | InnoDB | utf8
--
-- The normalized research catalog already exists as:
--   titles -> authors + research_records
-- This migration preserves those meanings and links the independently bound
-- research_inventory copy ledger to its parent title for reliable shelf/access
-- reads. It does not create a duplicate research_records table.
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

ALTER TABLE `research_inventory`
  ADD COLUMN `title_id` BIGINT UNSIGNED DEFAULT NULL
    COMMENT 'Normalized titles.title_id for catalog metadata and shelf joins'
    AFTER `research_inventory_id`,
  ADD KEY `idx_research_inventory_title_id` (`title_id`),
  ADD KEY `idx_research_inventory_catalog_access`
    (`title_id`, `lifecycle_status`, `availability_status`, `publication_year`),
  ADD CONSTRAINT `fk_research_inventory_title`
    FOREIGN KEY (`title_id`) REFERENCES `titles` (`title_id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- Backfill older rows first by the historical research-code bridge, then by
-- the complete immutable publication identity used by the original form.
UPDATE `research_inventory` AS ri
JOIN (
  SELECT
    t.`title_id`, t.`title`, t.`publication_year`, rr.`research_code`,
    rr.`adviser_name`,
    GROUP_CONCAT(a.`author_name` ORDER BY a.`author_order` SEPARATOR ', ') AS `authors`
  FROM `titles` AS t
  JOIN `research_records` AS rr ON rr.`title_id` = t.`title_id`
  LEFT JOIN `authors` AS a ON a.`title_id` = t.`title_id`
  WHERE t.`record_type` = 'Research/Thesis'
  GROUP BY t.`title_id`, t.`title`, t.`publication_year`, rr.`research_code`, rr.`adviser_name`
) AS catalog
  ON ri.`barcode` = catalog.`research_code`
  OR ri.`accession_number` = catalog.`research_code`
  OR (
    LOWER(TRIM(ri.`title`)) = LOWER(TRIM(catalog.`title`))
    AND LOWER(TRIM(ri.`authors`)) = LOWER(TRIM(catalog.`authors`))
    AND LOWER(TRIM(ri.`adviser`)) = LOWER(TRIM(catalog.`adviser_name`))
    AND ri.`publication_year` = catalog.`publication_year`
  )
SET ri.`title_id` = catalog.`title_id`
WHERE ri.`title_id` IS NULL;

-- Compound indexes are split across normalized ownership boundaries. This is
-- the indexed equivalent of the requested title/authors/department matrix.
ALTER TABLE `titles`
  ADD KEY `idx_titles_research_catalog_lookup`
    (`record_type`, `lifecycle_status`, `publication_year`, `normalized_title`(120), `title_id`);

ALTER TABLE `research_records`
  ADD KEY `idx_research_catalog_filters`
    (`department_or_program`, `adviser_name`(80), `viewing_status`, `title_id`);
