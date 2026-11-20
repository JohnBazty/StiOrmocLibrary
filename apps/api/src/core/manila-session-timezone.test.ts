import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Vercel reaches Supabase through the transaction pooler, which drops the
// `-c timezone=Asia/Manila` startup option. Database-filled times (NOW(),
// CURRENT_TIMESTAMP defaults) were then written as UTC clock time and read
// back as Manila time: a 10:26 AM borrow notice showed 2:26 AM.
test('078 sets Asia/Manila as the app role default, so pooled sessions write Manila wall time', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(await readFile(new URL('../../../../database/supabase/078_app_role_manila_timezone.sql', import.meta.url), 'utf8'))
    const { rows } = await pg.query<{ setting: string }>(`SELECT unnest(setconfig) AS setting FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole WHERE r.rolname = current_user AND s.setdatabase = 0`)
    assert.ok(rows.some(row => row.setting.toLowerCase() === 'timezone=asia/manila'), JSON.stringify(rows))
    const { rows: now } = await pg.query<{ tz: string }>("SELECT current_setting('TimeZone') AS tz")
    assert.equal(now[0].tz, 'Asia/Manila')
  } finally { await pg.close() }
})
