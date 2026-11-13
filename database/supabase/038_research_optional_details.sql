-- Optional research adviser and abstract (docs/plans/2026-11-13-research-import.md, approved by Ethan 2026-11-13).
-- Bulk research lists (for example the Hospitality Management list) have no adviser or abstract; staff fill them in later.
-- No data changes. To go back, set NOT NULL again only after no empty rows remain.
-- Safe to run more than once. The runner (npm run db:supabase) wraps this file in one transaction.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.research_records
  ALTER COLUMN adviser_name DROP NOT NULL,
  ALTER COLUMN abstract_text DROP NOT NULL;
ALTER TABLE public.research_inventory
  ALTER COLUMN adviser DROP NOT NULL;
