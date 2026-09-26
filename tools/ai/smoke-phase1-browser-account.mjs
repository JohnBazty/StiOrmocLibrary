/** Disposable Student login for manual browser acceptance. Always run --cleanup after use. */
import dotenv from 'dotenv'
import pg from 'pg'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile, unlink, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

dotenv.config({ path: new URL('../../apps/api/.env', import.meta.url), quiet: true })
if (!process.env.DATABASE_URL) throw new Error('Supabase DATABASE_URL required')
const dbUrl = new URL(process.env.DATABASE_URL)
dbUrl.port = '6543'
const db = new pg.Client({ connectionString: dbUrl.toString() })
const statePath = join(tmpdir(), 'sti-phase1-browser-account.json')
const base = 'https://sti-ormoc-smart-library.vercel.app'

await db.connect()
try {
  if (process.argv.includes('--create')) {
    try { await access(statePath); throw new Error('An earlier test account still needs cleanup') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    const schoolId = `PHASE1-UI-${randomBytes(5).toString('hex').toUpperCase()}`
    const password = randomBytes(20).toString('base64url')
    const result = await fetch(`${base}/api/v1/auth/register`, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, first_name: 'Phase', last_name: 'One Browser Test',
        contact_number: '09000000000', program_strand: 'BS Information Technology',
        year_grade_level: '4th Year', password, confirm_password: password }) })
    const payload = await result.json().catch(() => ({}))
    if (result.status !== 201 || !payload.success) throw new Error(`Registration failed: ${result.status} ${payload.code ?? ''}`)
    await writeFile(statePath, JSON.stringify({ schoolId, password }), { mode: 0o600 })
    console.log(JSON.stringify({ schoolId, password, note: 'Temporary login; run --cleanup after browser checks' }))
  } else if (process.argv.includes('--cleanup')) {
    const { schoolId } = JSON.parse(await readFile(statePath, 'utf8'))
    await db.query('BEGIN')
    try {
      const accounts = (await db.query('SELECT account_id,user_id FROM accounts WHERE school_id=$1', [schoolId])).rows
      for (const account of accounts) {
        await db.query('DELETE FROM notifications WHERE user_id=$1', [account.user_id])
        await db.query('DELETE FROM clearance_statuses WHERE user_id=$1', [account.user_id])
        await db.query('DELETE FROM attendance_qr_credentials WHERE user_id=$1', [account.user_id])
        await db.query('DELETE FROM student_profiles WHERE account_id=$1', [account.account_id])
        await db.query('UPDATE accounts SET user_id=NULL WHERE account_id=$1', [account.account_id])
        await db.query('DELETE FROM accounts WHERE account_id=$1', [account.account_id])
        await db.query('DELETE FROM users WHERE user_id=$1', [account.user_id])
      }
      await db.query('COMMIT')
      const remaining = await db.query(`SELECT (SELECT COUNT(*) FROM accounts WHERE school_id=$1) AS accounts,
        (SELECT COUNT(*) FROM users WHERE school_id=$1) AS users`, [schoolId])
      if (Number(remaining.rows[0].accounts) || Number(remaining.rows[0].users)) throw new Error('Temporary browser account remains')
      await unlink(statePath)
      console.log('Temporary browser-test account removed.')
    } catch (error) { await db.query('ROLLBACK'); throw error }
  } else throw new Error('Specify --create or --cleanup')
} finally { await db.end() }
