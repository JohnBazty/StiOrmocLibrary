-- Shelf DDC ranges (revisions 2026-11-20, phase 2 slice 2d).
-- A shelf may hold a Dewey Decimal range (e.g. 000-099.999). Shelf suggestions then list the copies
-- whose DDC number falls in that range (as well as those whose category belongs on the shelf),
-- so librarians can move them there and see the shelf in call-number order.
SET LOCAL lock_timeout = '5s';
ALTER TABLE catalog_locations
  ADD COLUMN ddc_from NUMERIC(6,3),
  ADD COLUMN ddc_to NUMERIC(6,3),
  ADD CONSTRAINT catalog_locations_ddc_range CHECK (
    (ddc_from IS NULL AND ddc_to IS NULL)
    OR (ddc_from IS NOT NULL AND ddc_to IS NOT NULL AND ddc_from >= 0 AND ddc_to < 1000 AND ddc_from <= ddc_to)
  );
