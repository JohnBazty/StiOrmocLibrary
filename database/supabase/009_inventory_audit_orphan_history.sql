-- MySQL 012 permits Deleted audit snapshots after removing an unused copy.
-- Keep those historical rows during cutover and subsequent deletions.
ALTER TABLE inventory_audit_events
  ALTER COLUMN physical_copy_id DROP NOT NULL;

ALTER TABLE inventory_audit_events
  DROP CONSTRAINT IF EXISTS inventory_audit_events_physical_copy_id_fkey;

ALTER TABLE inventory_audit_events
  ADD CONSTRAINT fk_inventory_audit_copy_nullable
  FOREIGN KEY (physical_copy_id) REFERENCES physical_copies (physical_copy_id)
  ON UPDATE CASCADE ON DELETE SET NULL;
