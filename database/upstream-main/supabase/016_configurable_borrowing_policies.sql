-- Configurable immutable borrowing policy versions (Postgres).
-- Legacy baseline mirrors pre-policy hardcoded Student=2 / 1 day / 08:59 behavior.

CREATE TABLE IF NOT EXISTS borrowing_policy_versions (
  borrowing_policy_version_id BIGSERIAL PRIMARY KEY,
  effective_on DATE NOT NULL,
  student_max_active_books INTEGER NOT NULL CHECK (student_max_active_books >= 1),
  faculty_max_active_books INTEGER NULL CHECK (faculty_max_active_books IS NULL OR faculty_max_active_books >= 1),
  borrowing_days INTEGER NOT NULL CHECK (borrowing_days >= 1),
  due_time_cutoff TIME NOT NULL,
  max_renewals INTEGER NOT NULL CHECK (max_renewals >= 0),
  renewal_extension_days INTEGER NOT NULL CHECK (renewal_extension_days >= 1),
  student_max_active_reservations INTEGER NOT NULL CHECK (student_max_active_reservations >= 1),
  faculty_max_active_reservations INTEGER NULL CHECK (faculty_max_active_reservations IS NULL OR faculty_max_active_reservations >= 1),
  block_renewal_if_overdue BOOLEAN NOT NULL DEFAULT TRUE,
  block_renewal_if_unpaid_fines BOOLEAN NOT NULL DEFAULT TRUE,
  block_renewal_if_reserved BOOLEAN NOT NULL DEFAULT TRUE,
  long_overdue_after_days INTEGER NULL CHECK (long_overdue_after_days IS NULL OR (long_overdue_after_days >= 1 AND long_overdue_after_days <= 365)),
  change_reason VARCHAR(500) NOT NULL,
  created_by_user_id BIGINT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_borrowing_policy_effective
  ON borrowing_policy_versions (effective_on DESC, borrowing_policy_version_id DESC);

CREATE TABLE IF NOT EXISTS borrowing_policy_material_rules (
  borrowing_policy_version_id BIGINT NOT NULL REFERENCES borrowing_policy_versions (borrowing_policy_version_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  material_type VARCHAR(40) NOT NULL,
  is_borrowable BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (borrowing_policy_version_id, material_type)
);

INSERT INTO borrowing_policy_versions (
  borrowing_policy_version_id,
  effective_on,
  student_max_active_books,
  faculty_max_active_books,
  borrowing_days,
  due_time_cutoff,
  max_renewals,
  renewal_extension_days,
  student_max_active_reservations,
  faculty_max_active_reservations,
  block_renewal_if_overdue,
  block_renewal_if_unpaid_fines,
  block_renewal_if_reserved,
  long_overdue_after_days,
  change_reason,
  created_by_user_id
)
SELECT
  1,
  DATE '2000-01-01',
  2,
  NULL,
  1,
  TIME '08:59:00',
  1,
  1,
  2,
  NULL,
  TRUE,
  TRUE,
  TRUE,
  NULL,
  'Legacy baseline reflecting behavior before configurable borrowing policies.',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM borrowing_policy_versions WHERE borrowing_policy_version_id = 1
);

SELECT setval(
  pg_get_serial_sequence('borrowing_policy_versions', 'borrowing_policy_version_id'),
  GREATEST((SELECT COALESCE(MAX(borrowing_policy_version_id), 1) FROM borrowing_policy_versions), 1)
);

INSERT INTO borrowing_policy_material_rules (borrowing_policy_version_id, material_type, is_borrowable)
SELECT 1, 'Book', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM borrowing_policy_material_rules
  WHERE borrowing_policy_version_id = 1 AND material_type = 'Book'
);

INSERT INTO borrowing_policy_material_rules (borrowing_policy_version_id, material_type, is_borrowable)
SELECT 1, 'Thesis/Manuscript', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM borrowing_policy_material_rules
  WHERE borrowing_policy_version_id = 1 AND material_type = 'Thesis/Manuscript'
);

ALTER TABLE borrow_transactions
  ADD COLUMN IF NOT EXISTS borrowing_policy_version_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_borrow_policy_version'
  ) THEN
    ALTER TABLE borrow_transactions
      ADD CONSTRAINT fk_borrow_policy_version
      FOREIGN KEY (borrowing_policy_version_id)
      REFERENCES borrowing_policy_versions (borrowing_policy_version_id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_borrow_policy_version ON borrow_transactions (borrowing_policy_version_id);

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS borrowing_policy_version_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_reservation_policy_version'
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT fk_reservation_policy_version
      FOREIGN KEY (borrowing_policy_version_id)
      REFERENCES borrowing_policy_versions (borrowing_policy_version_id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservation_policy_version ON reservations (borrowing_policy_version_id);

UPDATE borrow_transactions
SET borrowing_policy_version_id = 1
WHERE borrowing_policy_version_id IS NULL
  AND transaction_status IN ('Borrowed', 'Overdue', 'Returned');

UPDATE reservations
SET borrowing_policy_version_id = 1
WHERE borrowing_policy_version_id IS NULL;

CREATE OR REPLACE FUNCTION reject_borrowing_policy_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Published borrowing policy rows are immutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_borrowing_policy_versions_no_update ON borrowing_policy_versions;
CREATE TRIGGER trg_borrowing_policy_versions_no_update
BEFORE UPDATE ON borrowing_policy_versions
FOR EACH ROW EXECUTE FUNCTION reject_borrowing_policy_mutation();

DROP TRIGGER IF EXISTS trg_borrowing_policy_versions_no_delete ON borrowing_policy_versions;
CREATE TRIGGER trg_borrowing_policy_versions_no_delete
BEFORE DELETE ON borrowing_policy_versions
FOR EACH ROW EXECUTE FUNCTION reject_borrowing_policy_mutation();

DROP TRIGGER IF EXISTS trg_borrowing_policy_material_rules_no_update ON borrowing_policy_material_rules;
CREATE TRIGGER trg_borrowing_policy_material_rules_no_update
BEFORE UPDATE ON borrowing_policy_material_rules
FOR EACH ROW EXECUTE FUNCTION reject_borrowing_policy_mutation();

DROP TRIGGER IF EXISTS trg_borrowing_policy_material_rules_no_delete ON borrowing_policy_material_rules;
CREATE TRIGGER trg_borrowing_policy_material_rules_no_delete
BEFORE DELETE ON borrowing_policy_material_rules
FOR EACH ROW EXECUTE FUNCTION reject_borrowing_policy_mutation();

CREATE OR REPLACE FUNCTION protect_borrow_policy_version_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.borrowing_policy_version_id IS NOT NULL
     AND NEW.borrowing_policy_version_id IS NOT NULL
     AND OLD.borrowing_policy_version_id <> NEW.borrowing_policy_version_id
     AND OLD.transaction_status IN ('Borrowed', 'Overdue', 'Returned') THEN
    RAISE EXCEPTION 'borrowing_policy_version_id cannot change after a loan is finalized.';
  END IF;
  IF NEW.transaction_status IN ('Borrowed', 'Overdue') THEN
    IF NEW.due_at IS NULL THEN
      RAISE EXCEPTION 'Active loans require an application-supplied due_at.';
    END IF;
    IF NEW.borrowing_policy_version_id IS NULL THEN
      RAISE EXCEPTION 'Active loans require a borrowing_policy_version_id.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_borrow_protect_policy_version ON borrow_transactions;
CREATE TRIGGER trg_borrow_protect_policy_version
BEFORE INSERT OR UPDATE ON borrow_transactions
FOR EACH ROW EXECUTE FUNCTION protect_borrow_policy_version_id();
