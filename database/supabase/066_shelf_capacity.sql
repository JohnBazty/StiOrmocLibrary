-- Authoritative shelf dimensions and API-only compartment capacity overrides.
-- Existing assignments, identities and lifecycle states remain unchanged.
-- A NULL default capacity means staff must review the shelf before adding copies.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT column_count AS shelf_column, row_count AS shelf_row FROM public.floor_plan_shelves
      UNION ALL SELECT shelf_column, shelf_row FROM public.categories
      UNION ALL SELECT shelf_column, shelf_row FROM public.physical_copies
      UNION ALL SELECT shelf_column, shelf_row FROM public.research_inventory
    ) positions
    WHERE shelf_column NOT BETWEEN 1 AND 12 OR shelf_row NOT BETWEEN 1 AND 12
  ) THEN
    RAISE EXCEPTION 'Shelf dimensions exceed the supported 1–12 range. Review existing coordinates before applying this migration.';
  END IF;
END $$;

ALTER TABLE public.catalog_locations
  ADD COLUMN column_count SMALLINT NOT NULL DEFAULT 1 CHECK (column_count BETWEEN 1 AND 12),
  ADD COLUMN row_count SMALLINT NOT NULL DEFAULT 1 CHECK (row_count BETWEEN 1 AND 12),
  ADD COLUMN default_capacity INTEGER CHECK (default_capacity > 0);

-- Keep previously assigned labels discoverable even if they predate location maintenance.
INSERT INTO public.catalog_locations(name)
SELECT DISTINCT label FROM (
  SELECT label FROM public.floor_plan_shelves
  UNION SELECT shelf_location FROM public.categories
  UNION SELECT shelf_location FROM public.physical_copies
  UNION SELECT shelf_location FROM public.research_inventory
) existing_locations
WHERE label IS NOT NULL AND TRIM(label) <> ''
ON CONFLICT (name) DO NOTHING;

-- Include archived assignments so restoring a record never loses its recorded position.
WITH dimensions AS (
  SELECT label, MAX(shelf_column) AS column_count, MAX(shelf_row) AS row_count
  FROM (
    SELECT label, column_count AS shelf_column, row_count AS shelf_row FROM public.floor_plan_shelves
    UNION ALL SELECT shelf_location, shelf_column, shelf_row FROM public.categories
    UNION ALL SELECT shelf_location, shelf_column, shelf_row FROM public.physical_copies
    UNION ALL SELECT shelf_location, shelf_column, shelf_row FROM public.research_inventory
  ) positions
  GROUP BY label
)
UPDATE public.catalog_locations locations
SET column_count = GREATEST(1, dimensions.column_count),
    row_count = GREATEST(1, dimensions.row_count)
FROM dimensions
WHERE dimensions.label = locations.name;

CREATE TABLE public.catalog_location_capacities (
  location_id BIGINT NOT NULL REFERENCES public.catalog_locations(location_id) ON DELETE CASCADE,
  shelf_column SMALLINT NOT NULL CHECK (shelf_column BETWEEN 1 AND 12),
  shelf_row SMALLINT NOT NULL CHECK (shelf_row BETWEEN 1 AND 12),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  PRIMARY KEY (location_id, shelf_column, shelf_row)
);
ALTER TABLE public.catalog_location_capacities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_location_capacities FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.catalog_location_capacities TO service_role;
