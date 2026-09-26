/** Exercises deployed Category mutations with empty test categories, then cleans audit rows. */
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import { randomBytes } from 'node:crypto'

dotenv.config({ path: new URL('../../apps/api/.env', import.meta.url), quiet: true })
const { env } = await import('../../apps/api/src/config/env.js')
if (env.db.driver !== 'postgres') throw new Error('Supabase Postgres required')
const url = new URL(env.db.connectionString)
url.port = '6543'
const db = new pg.Client({ connectionString: url.toString() })
const base = (process.argv[2] ?? 'https://sti-ormoc-smart-library.vercel.app').replace(/\/$/, '')
const suffix = randomBytes(5).toString('hex').toUpperCase()
const nameA = `Phase 1 category ${suffix} A`
const nameB = `Phase 1 category ${suffix} B`
let idA = null
let idB = null
let accountId = null
let token = null
let eventStart = 0
let connected = false

async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, { method,
    headers: { accept: 'application/json', authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) throw new Error(`${method} ${path}: HTTP ${response.status}, ${payload.code ?? 'UNKNOWN'}`)
  return payload.data
}

try {
  await db.connect()
  connected = true
  const { rows } = await db.query("SELECT account_id,school_id FROM accounts WHERE role='Admin' AND account_status='Active' AND user_id IS NOT NULL ORDER BY account_id LIMIT 1")
  if (!rows[0]) throw new Error('No linked active Admin')
  accountId = Number(rows[0].account_id)
  token = jwt.sign({ accountId, userId: accountId, schoolId: rows[0].school_id, role: 'Admin' }, env.jwt.secret,
    { algorithm: 'HS256', issuer: env.jwt.issuer, audience: env.jwt.audience,
      subject: String(accountId), expiresIn: '10m' })
  const shelf = await db.query('SELECT label FROM floor_plan_shelves ORDER BY id LIMIT 1')
  if (!shelf.rows[0]) throw new Error('No managed shelf')
  const shelfLocation = String(shelf.rows[0].label)
  eventStart = Number((await db.query('SELECT COALESCE(MAX(id),0) AS id FROM floor_plan_events')).rows[0].id)
  const a = await api('/api/categories', 'POST', { categoryName: nameA, shelfLocation, shelfColumn: 1, shelfRow: 1 })
  idA = Number(a.categoryId)
  const b = await api('/api/categories', 'POST', { categoryName: nameB, shelfLocation, shelfColumn: 1, shelfRow: 1 })
  idB = Number(b.categoryId)
  await api(`/api/categories/${idA}`, 'PUT', { categoryName: `${nameA} updated`, shelfLocation, shelfColumn: 1, shelfRow: 1 })
  const listed = await api('/api/categories')
  if (!listed.some((item) => Number(item.categoryId) === idA && item.categoryName === `${nameA} updated`)) throw new Error('Edited category absent from live directory')
  const reassigned = await api('/api/categories/reassign', 'POST', { oldCategoryId: idA, targetCategoryId: idB })
  if (!reassigned.deletedOldCategory) throw new Error('Live reassignment did not remove old category')
  await api(`/api/categories/${idB}`, 'DELETE')
  console.log('Live Category Add, Edit, Reassign, and Delete passed.')
} catch (error) {
  console.error(`Live Category acceptance failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  if (connected) {
    try {
      const existing = await db.query('SELECT category_id,category_name FROM categories WHERE category_name IN ($1,$2,$3)', [nameA, `${nameA} updated`, nameB])
      idA ??= existing.rows.find((item) => item.category_name === nameA || item.category_name === `${nameA} updated`)?.category_id ?? null
      idB ??= existing.rows.find((item) => item.category_name === nameB)?.category_id ?? null
      await db.query('BEGIN')
      if (idA) await db.query('DELETE FROM categories WHERE category_id=$1', [idA])
      if (idB) await db.query('DELETE FROM categories WHERE category_id=$1', [idB])
      await db.query(`DELETE FROM floor_plan_events WHERE id>$1 AND account_id=$2
        AND (details LIKE $3 OR details LIKE $4 OR details LIKE $5)`,
        [eventStart, accountId, `%${suffix}%`, `%"oldCategoryId":${idA}%`, `%"targetCategoryId":${idB}%`])
      await db.query('COMMIT')
      const remain = await db.query('SELECT COUNT(*) AS count FROM categories WHERE category_name LIKE $1', [`%${suffix}%`])
      if (Number(remain.rows[0].count) !== 0) throw new Error('Temporary categories remain')
      const events = await db.query(`SELECT COUNT(*) AS count FROM floor_plan_events WHERE id>$1 AND account_id=$2
        AND (details LIKE $3 OR details LIKE $4 OR details LIKE $5)`,
        [eventStart, accountId, `%${suffix}%`, `%"oldCategoryId":${idA}%`, `%"targetCategoryId":${idB}%`])
      if (Number(events.rows[0].count) !== 0) throw new Error('Temporary category audit events remain')
      console.log('Temporary categories and their test audit events removed.')
    } catch (error) {
      await db.query('ROLLBACK')
      console.error(`Category cleanup needs attention: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    }
    await db.end()
  }
}
