-- Book import without a shelf (revisions 2026-11-20, phase 2 slice 2c).
-- A copy can be added before it has a shelf; it shows as "Unassigned" and appears in shelf
-- suggestions until a librarian places it. The legacy materials row mirrors the copy's shelf.
-- A blank name is still refused: no shelf is NULL, never an empty string.
SET LOCAL lock_timeout = '5s';
ALTER TABLE physical_copies ALTER COLUMN shelf_location DROP NOT NULL;
ALTER TABLE physical_copies ADD CONSTRAINT physical_copies_shelf_location_not_blank
  CHECK (shelf_location IS NULL OR btrim(shelf_location) <> '') NOT VALID;
ALTER TABLE materials ALTER COLUMN shelf_location DROP NOT NULL;
