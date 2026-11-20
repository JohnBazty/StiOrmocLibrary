-- The highest fine a violation category may have is a library setting (Library setup -> Violation rules), not a fixed number.
-- It starts at PHP 9,999.99 (as set by 075). The database keeps only a hard ceiling of PHP 999,999.99.
SET LOCAL lock_timeout = '5s';
CREATE TABLE violation_settings (
 settings_id SMALLINT PRIMARY KEY CHECK(settings_id=1),
 max_fine NUMERIC(10,2) NOT NULL DEFAULT 9999.99 CHECK(max_fine>0 AND max_fine<=999999.99),
 updated_by_account_id BIGINT REFERENCES accounts(account_id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO violation_settings(settings_id,max_fine) VALUES(1,9999.99);
ALTER TABLE violation_categories DROP CONSTRAINT violation_categories_fine_amount_check;
ALTER TABLE violation_categories ADD CONSTRAINT violation_categories_fine_amount_check CHECK(fine_amount>0 AND fine_amount<=999999.99);
ALTER TABLE violation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON violation_settings FROM PUBLIC,anon,authenticated;
