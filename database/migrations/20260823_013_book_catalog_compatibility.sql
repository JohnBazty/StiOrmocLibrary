-- ============================================================================
-- SmartLib Book Catalog and Overview
-- MySQL 5.6 compatible | additive | InnoDB-backed source tables | utf8
--
-- `titles`, `authors`, and `physical_copies` remain the authoritative catalog.
-- The compatibility view exposes the requested `book_titles` contract without
-- creating a second writable source of book metadata.
-- ============================================================================

SET NAMES utf8;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
USE `sti_ormoc_library`;

-- Optimize the most common book-only category/year/title lookup path.
ALTER TABLE `titles`
  ADD KEY `idx_titles_book_catalog_lookup`
    (`record_type`, `lifecycle_status`, `category_id`, `publication_year`, `normalized_title`(120), `isbn`);

-- Support author-prefix lookup followed by an efficient join to the title.
ALTER TABLE `authors`
  ADD KEY `idx_authors_catalog_lookup` (`normalized_name`, `title_id`);

-- Read-only compatibility matrix requested by integrations that use the
-- `book_titles` name. Multi-author credits stay normalized in `authors`.
CREATE OR REPLACE ALGORITHM=UNDEFINED VIEW `book_titles` AS
SELECT
  t.`title_id` AS `id`,
  t.`title`,
  GROUP_CONCAT(a.`author_name` ORDER BY a.`author_order` SEPARATOR ', ') AS `author`,
  t.`isbn`,
  t.`publisher`,
  t.`publication_year`,
  t.`category_id`
FROM `titles` AS t
LEFT JOIN `authors` AS a ON a.`title_id` = t.`title_id`
WHERE t.`record_type` = 'Book'
  AND t.`lifecycle_status` = 'Active'
GROUP BY
  t.`title_id`, t.`title`, t.`isbn`, t.`publisher`,
  t.`publication_year`, t.`category_id`;
