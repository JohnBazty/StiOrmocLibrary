-- A violation fine is at most four digits: PHP 9,999.99 (was PHP 999,999.99 in 074).
-- Before applying on live: SELECT name, fine_amount FROM violation_categories WHERE fine_amount > 9999.99; (must return no rows)
SET LOCAL lock_timeout = '5s';
ALTER TABLE violation_categories DROP CONSTRAINT violation_categories_fine_amount_check;
ALTER TABLE violation_categories ADD CONSTRAINT violation_categories_fine_amount_check CHECK(fine_amount>0 AND fine_amount<=9999.99);
