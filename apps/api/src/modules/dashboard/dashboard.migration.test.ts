import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('dashboard migration adds only configurable library profile settings',async()=>{
  const sql=await readFile(new URL('../../../../../database/migrations/20260904_033_dashboard_library_profile.sql',import.meta.url),'utf8')
  assert.match(sql,/library_profile_settings/)
  assert.match(sql,/seat_capacity/)
  assert.match(sql,/map_asset_path/)
  assert.match(sql,/INSERT IGNORE/)
  assert.doesNotMatch(sql,/DROP (TABLE|COLUMN)/i)
})
