-- Make the selected category shelf authoritative for active inventory.
-- Historical audit snapshots are not altered.
UPDATE physical_copies pc
JOIN titles t ON t.title_id = pc.title_id
JOIN categories c ON c.category_id = t.category_id
JOIN floor_plan_shelves s ON s.label = c.shelf_location
SET pc.shelf_location = c.shelf_location, pc.updated_at = NOW()
WHERE t.record_type = 'Book'
  AND t.lifecycle_status = 'Active'
  AND pc.lifecycle_status = 'Active'
  AND NOT (pc.shelf_location <=> c.shelf_location);

UPDATE materials m
JOIN categories c ON c.category_id = m.category_id
JOIN floor_plan_shelves s ON s.label = c.shelf_location
SET m.shelf_location = c.shelf_location, m.updated_at = NOW()
WHERE NOT (m.shelf_location <=> c.shelf_location);

UPDATE research_inventory ri
JOIN titles t ON t.title_id = ri.title_id
JOIN categories c ON c.category_id = t.category_id
JOIN floor_plan_shelves s ON s.label = c.shelf_location
SET ri.shelf_location = c.shelf_location,
    ri.updated_at = NOW(),
    ri.row_version = ri.row_version + 1
WHERE t.record_type = 'Research/Thesis'
  AND t.lifecycle_status = 'Active'
  AND ri.lifecycle_status = 'Active'
  AND NOT (ri.shelf_location <=> c.shelf_location);
