-- Preserve category locations created after the initial floor-plan migration.
-- They become managed, unplaced shelves and no category assignment is changed.
INSERT IGNORE INTO floor_plan_shelves (label)
SELECT DISTINCT TRIM(shelf_location)
FROM categories
WHERE TRIM(COALESCE(shelf_location, '')) <> '';
