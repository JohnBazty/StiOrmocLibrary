-- Adds a simple, configurable grid to each managed shelf and records the
-- exact home compartment for categories and physical inventory.
-- MySQL 5.6 compatible; existing records begin at Column 1 / Row 1.

ALTER TABLE floor_plan_shelves
  ADD COLUMN column_count TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER label,
  ADD COLUMN row_count TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER column_count;

ALTER TABLE categories
  ADD COLUMN shelf_column TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER shelf_location,
  ADD COLUMN shelf_row TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER shelf_column;

ALTER TABLE physical_copies
  ADD COLUMN shelf_column TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER shelf_location,
  ADD COLUMN shelf_row TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER shelf_column,
  ADD KEY idx_physical_copies_shelf_grid (shelf_location, shelf_column, shelf_row);

ALTER TABLE research_inventory
  ADD COLUMN shelf_column TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER shelf_location,
  ADD COLUMN shelf_row TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER shelf_column,
  ADD KEY idx_research_inventory_shelf_grid (shelf_location, shelf_column, shelf_row);
