-- Book condition maintenance (revisions 2026-11-20, phase 2 slice 2b).
-- Librarians can add their own conditions (e.g. "Water damage"). Each one behaves like one of the
-- five base conditions, which lending, returns, stocktake and the lost-book flow already understand.
-- physical_copies.condition_status keeps holding the base condition, so none of that logic changes;
-- the new condition_detail_id names the librarian's condition and must agree with it.
SET LOCAL lock_timeout = '5s';

CREATE TABLE copy_conditions (
  condition_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(40) NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 40),
  behaves_as VARCHAR(12) NOT NULL CHECK (behaves_as IN ('Good','Fair','For Repair','Damaged','Lost')),
  description VARCHAR(300),
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  updated_by_account_id BIGINT REFERENCES accounts(account_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A base condition is exactly one of the five, always active.
  CONSTRAINT copy_conditions_base_is_itself CHECK (NOT is_base OR (name = behaves_as AND is_active))
);
CREATE UNIQUE INDEX copy_conditions_name_key ON copy_conditions (lower(name));
-- Only the five seeded rows are base conditions.
CREATE UNIQUE INDEX copy_conditions_one_base_each ON copy_conditions (behaves_as) WHERE is_base;

INSERT INTO copy_conditions (name, behaves_as, description, is_base, sort_order) VALUES
  ('Good', 'Good', 'No damage. Ready to lend.', TRUE, 10),
  ('Fair', 'Fair', 'Worn but complete and usable. Ready to lend.', TRUE, 20),
  ('For Repair', 'For Repair', 'Needs repair before it can be lent.', TRUE, 30),
  ('Damaged', 'Damaged', 'Damaged; held out of lending until assessed.', TRUE, 40),
  ('Lost', 'Lost', 'Missing. Only the lost-book process sets this.', TRUE, 50);

ALTER TABLE physical_copies
  ADD COLUMN condition_detail_id BIGINT REFERENCES copy_conditions (condition_id) ON DELETE RESTRICT;
CREATE INDEX physical_copies_condition_detail_idx ON physical_copies (condition_detail_id) WHERE condition_detail_id IS NOT NULL;

-- Keeps the detail honest: it must behave as the stored base condition, and any flow that changes
-- only the base condition (a return, a stocktake, the lost-book process) clears a stale detail.
CREATE FUNCTION physical_copies_condition_detail_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE detail_behaves_as VARCHAR(12);
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.condition_status IS DISTINCT FROM OLD.condition_status
     AND NEW.condition_detail_id IS NOT DISTINCT FROM OLD.condition_detail_id THEN
    NEW.condition_detail_id := NULL;
  END IF;
  IF NEW.condition_detail_id IS NOT NULL THEN
    SELECT behaves_as INTO detail_behaves_as FROM copy_conditions WHERE condition_id = NEW.condition_detail_id;
    IF detail_behaves_as IS DISTINCT FROM NEW.condition_status THEN
      RAISE EXCEPTION 'Condition detail % does not match the copy condition %', NEW.condition_detail_id, NEW.condition_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER physical_copies_condition_detail_guard
  BEFORE INSERT OR UPDATE OF condition_status, condition_detail_id ON physical_copies
  FOR EACH ROW EXECUTE FUNCTION physical_copies_condition_detail_guard();

ALTER TABLE copy_conditions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON copy_conditions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION physical_copies_condition_detail_guard() FROM PUBLIC, anon, authenticated;
