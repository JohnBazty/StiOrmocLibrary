-- Violation rules maintained in Library setup instead of fixed lists.
-- Default seed (change in Library setup -> Violation rules): PHP 50.00 fine, 2 warnings before the fine, per category.
-- Before applying on live: SELECT DISTINCT category FROM conduct_incidents UNION SELECT category FROM conduct_students;
-- every value must be Noise, Eating or food or Other conduct, or the foreign keys below fail (and nothing is changed).
SET LOCAL lock_timeout = '5s';
CREATE TABLE violation_categories (
 category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name TEXT NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 2 AND 80),
 description TEXT CHECK(length(description)<=300),
 warnings_before_fine INTEGER NOT NULL DEFAULT 2 CHECK(warnings_before_fine BETWEEN 0 AND 3),
 fine_amount NUMERIC(10,2) NOT NULL CHECK(fine_amount>0 AND fine_amount<=999999.99),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 sort_order INTEGER NOT NULL DEFAULT 0,
 updated_by_account_id BIGINT REFERENCES accounts(account_id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX violation_categories_name_lower ON violation_categories(lower(name));
INSERT INTO violation_categories(name,warnings_before_fine,fine_amount,sort_order)
VALUES('Noise',2,50.00,1),('Eating or food',2,50.00,2),('Other conduct',2,50.00,3);

-- The fixed-list CHECKs become a foreign key to the maintained list. Names are locked once used, so no cascade is needed.
ALTER TABLE conduct_students DROP CONSTRAINT conduct_students_category_check;
ALTER TABLE conduct_incidents DROP CONSTRAINT conduct_incidents_category_check;
ALTER TABLE conduct_students ADD CONSTRAINT conduct_students_category_fk FOREIGN KEY(category) REFERENCES violation_categories(name);
ALTER TABLE conduct_incidents ADD CONSTRAINT conduct_incidents_category_fk FOREIGN KEY(category) REFERENCES violation_categories(name);
CREATE INDEX conduct_incidents_category ON conduct_incidents(category);

-- 'Final warning' stays valid in conduct_incidents.action for rows saved under the old rule; new rows never use it.
-- A record copied from the paper log is always a warning: it never has a fine.
ALTER TABLE conduct_incidents ADD COLUMN source TEXT NOT NULL DEFAULT 'Recorded' CHECK(source IN ('Recorded','Paper log'));
ALTER TABLE conduct_incidents ADD CONSTRAINT conduct_paper_log_no_fine CHECK(source='Recorded' OR fine_id IS NULL);

ALTER TABLE violation_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON violation_categories FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE violation_categories_category_id_seq FROM PUBLIC,anon,authenticated;
