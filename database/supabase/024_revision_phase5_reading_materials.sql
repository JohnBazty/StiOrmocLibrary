-- Extend the new in-library ledger to reference native thesis inventory directly.
-- Do not create duplicate physical_copies/materials for thesis records.
ALTER TABLE in_library_uses ALTER COLUMN physical_copy_id DROP NOT NULL;
ALTER TABLE in_library_uses ALTER COLUMN material_id DROP NOT NULL;
ALTER TABLE in_library_uses ADD COLUMN research_inventory_id BIGINT REFERENCES research_inventory(research_inventory_id) ON DELETE RESTRICT;
ALTER TABLE in_library_uses ADD CONSTRAINT ck_in_library_physical_source CHECK (
 (physical_copy_id IS NOT NULL AND material_id IS NOT NULL AND research_inventory_id IS NULL) OR
 (physical_copy_id IS NULL AND material_id IS NULL AND research_inventory_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_in_library_open_research ON in_library_uses(research_inventory_id) WHERE ended_at IS NULL;
