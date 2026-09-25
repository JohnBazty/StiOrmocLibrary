# AI / developer helper scripts

Small Python tools for documentation status, migration numbering, and MySQL→Postgres conversion.

| Script | Purpose |
| --- | --- |
| `mysql_to_pg.py` | Best-effort MySQL DDL → Postgres for `database/supabase/` drafts |

Run from repo root:

```powershell
python tools/ai/mysql_to_pg.py database/mysql56-schema.sql -o database/supabase/001_from_baseline.sql
```

Do not commit secrets. Prefer reviewing generated SQL before applying to Supabase.
