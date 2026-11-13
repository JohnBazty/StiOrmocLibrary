-- Book register (docs/plans/2026-11-13-book-register.md, approved by Ethan 2026-11-13).
-- Adds the accession-register columns: class, volumes and remarks per title; source of fund and cost price per copy.
-- Edition and pages already live in catalog_title_details (021); date received is physical_copies.acquired_at.
-- Safe to run more than once. Volumes is text on purpose: "2 vols." is not a number.

BEGIN;
-- titles and physical_copies serve circulation: give up instead of queueing every loan behind a long transaction. Rerun if it times out.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.titles
  ADD COLUMN IF NOT EXISTS classification TEXT CHECK (classification IS NULL OR char_length(classification) BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS volumes TEXT CHECK (volumes IS NULL OR char_length(volumes) BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS remarks TEXT CHECK (remarks IS NULL OR char_length(remarks) BETWEEN 1 AND 2000);

ALTER TABLE public.physical_copies
  ADD COLUMN IF NOT EXISTS fund_source TEXT CHECK (fund_source IS NULL OR char_length(fund_source) BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS fund_detail TEXT CHECK (fund_detail IS NULL OR char_length(fund_detail) BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS cost_php NUMERIC(9, 2) CHECK (cost_php IS NULL OR cost_php BETWEEN 0 AND 999999.99);

-- Prices above the copy column's range are not copied; say how many so staff can enter them by hand.
DO $$
DECLARE skipped integer;
BEGIN
  SELECT count(*) INTO skipped FROM public.titles WHERE purchase_price > 999999.99;
  IF skipped > 0 THEN RAISE NOTICE '037: % title price(s) above 999999.99 not copied to physical_copies.cost_php', skipped; END IF;
END $$;

-- Cost is per copy from now on. Existing copies take their title's price; titles.purchase_price stays for old readers.
UPDATE public.physical_copies pc
   SET cost_php = t.purchase_price
  FROM public.titles t
 WHERE t.title_id = pc.title_id
   AND pc.cost_php IS NULL
   AND t.purchase_price IS NOT NULL
   AND t.purchase_price BETWEEN 0 AND 999999.99;

COMMIT;
