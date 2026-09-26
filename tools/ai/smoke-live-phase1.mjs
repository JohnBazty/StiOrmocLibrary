/** Small live write/read check. Creates and removes one unassigned test category. */
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'

dotenv.config({ path: new URL('../../apps/api/.env', import.meta.url), quiet: true })
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) throw new Error('Local Supabase and signing credentials are required')
const url = new URL(process.env.DATABASE_URL)
url.port = '6543'
process.env.DATABASE_URL = url.toString()

const { db } = await import('../../apps/api/src/config/db.js')
const { env } = await import('../../apps/api/src/config/env.js')
if (env.db.driver !== 'postgres') throw new Error('Refusing to test a non-Postgres database')
const base = (process.argv[2] ?? 'https://sti-ormoc-smart-library.vercel.app').replace(/\/$/, '')
const name = `Phase 1 live smoke ${Date.now()}-${Math.floor(Math.random() * 100000)}`
let token
let created = false

async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(`${method} ${path} failed (${response.status}, ${payload.code ?? 'UNKNOWN'})`)
  }
  return payload.data
}

try {
  const [admins] = await db.execute(
    "SELECT account_id,school_id FROM accounts WHERE role='Admin' AND account_status='Active' AND user_id IS NOT NULL ORDER BY account_id LIMIT 1",
  )
  const [shelves] = await db.execute('SELECT label FROM floor_plan_shelves ORDER BY id LIMIT 1')
  if (!admins.length || !shelves.length) throw new Error('A linked Admin and managed shelf are required')
  const accountId = Number(admins[0].account_id)
  token = jwt.sign(
    { accountId, userId: accountId, schoolId: String(admins[0].school_id), role: 'Admin' },
    env.jwt.secret,
    { algorithm: 'HS256', issuer: env.jwt.issuer, audience: env.jwt.audience,
      subject: String(accountId), expiresIn: '5m' },
  )
  const clearance = await request('/api/v1/admin/clearance?limit=1')
  if (!Array.isArray(clearance.pendingLostReports)) throw new Error('Live Admin clearance lacks the pending lost-report queue')
  const createdCategory = await request('/api/categories', 'POST', {
    categoryName: name, shelfLocation: String(shelves[0].label), shelfColumn: 1, shelfRow: 1,
  })
  created = true
  const categories = await request('/api/categories')
  if (!categories.some((item) => item.categoryId === Number(createdCategory.categoryId) && item.categoryName === name)) {
    throw new Error('Created category is absent from the live directory')
  }
  process.stdout.write('Live Admin clearance queue and Category create/read passed. Cleaning up the test category.\n')
} finally {
  if (token) {
    try {
      const categories = await request('/api/categories')
      const testCategories = categories.filter((item) => item.categoryName === name)
      for (const category of testCategories) await request(`/api/categories/${category.categoryId}`, 'DELETE')
      if (created && testCategories.length !== 1) throw new Error('The test category could not be located for cleanup')
      if (created) process.stdout.write('Live test category removed.\n')
    } catch (error) {
      process.stderr.write(`Cleanup needs attention: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    }
  }
  await db.end()
}
