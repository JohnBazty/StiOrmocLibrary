-- 012_performance_advisor_fixes.sql
-- Clears Supabase Performance Advisor items that are safe to fix now:
--   1) Unindexed foreign keys on public.* (add covering indexes)
--   2) no_primary_key noise from leftover mysql_cutover_backup_* schema (drop backup)
--
-- Intentionally NOT dropping "unused_index" findings: this database is young;
-- those indexes support real app queries and will show usage as traffic grows.

-- ---------------------------------------------------------------------------
-- 1) Covering indexes for public foreign keys that lack a matching index
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  idx_name text;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      t.relname AS table_name,
      c.conname AS fkey_name,
      string_agg(quote_ident(a.attname), ', ' ORDER BY x.ord) AS col_list,
      string_agg(a.attname, '_' ORDER BY x.ord) AS col_slug
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum AND NOT a.attisdropped
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
          FROM pg_index i
         WHERE i.indrelid = c.conrelid
           AND i.indisvalid
           AND (SELECT array_agg(i.indkey[k] ORDER BY k)
                  FROM generate_subscripts(i.indkey, 1) AS k
                 WHERE k <= array_length(c.conkey, 1)
                    AND i.indkey[k] <> 0
               ) = c.conkey
      )
    GROUP BY n.nspname, t.relname, c.conname, c.conrelid, c.conkey
    ORDER BY t.relname, c.conname
  LOOP
    idx_name := left('idx_fk_' || r.table_name || '_' || r.col_slug, 63);
    BEGIN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
        idx_name,
        r.schema_name,
        r.table_name,
        r.col_list
      );
      RAISE NOTICE 'Created % on %.%(%)', idx_name, r.schema_name, r.table_name, r.col_list;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped % on %.%: %', r.fkey_name, r.schema_name, r.table_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Drop leftover MySQL cutover backup schema (not used by the live app)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  backup_schema text;
BEGIN
  FOR backup_schema IN
    SELECT nspname
      FROM pg_namespace
     WHERE nspname LIKE 'mysql_cutover_backup_%'
  LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', backup_schema);
    RAISE NOTICE 'Dropped backup schema %', backup_schema;
  END LOOP;
END $$;
