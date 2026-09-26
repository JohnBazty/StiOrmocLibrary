/** Read-only smoke audit for the deployed JWT API. Never prints tokens or account details. */
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'

dotenv.config({ path: new URL('../../apps/api/.env', import.meta.url), quiet: true })
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) throw new Error('Local API credentials are unavailable')
const url = new URL(process.env.DATABASE_URL)
url.port = '6543'
process.env.DATABASE_URL = url.toString()
const { db } = await import('../../apps/api/src/config/db.js')
const { env } = await import('../../apps/api/src/config/env.js')
const base = (process.argv[2] ?? 'https://sti-ormoc-smart-library.vercel.app').replace(/\/$/, '')

const student = [
  '/api/v1/auth/me', '/api/v1/dashboard', '/api/v1/catalog/categories',
  '/api/v1/catalog/books', '/api/v1/catalog/research', '/api/v1/floor-plan/image',
  '/api/v1/reservations', '/api/v1/borrowing/history',
  '/api/v1/attendance/pass', '/api/v1/notifications', '/api/v1/notifications/schedule',
  '/api/v1/printing/service-status', '/api/v1/printing/printers/availability',
  '/api/v1/printing/pricing', '/api/v1/printing/requests', '/api/v1/printing/receipts',
  '/api/v1/clearance/me', '/api/v1/fines/me', '/api/v1/fines/terms', '/api/v1/fines/receipts',
]
const staff = [
  '/api/v1/auth/me', '/api/v1/admin/dashboard', '/api/v1/admin/dashboard/summary.pdf',
  '/api/v1/admin/borrowing/monitor', '/api/v1/admin/notifications',
  '/api/v1/admin/reservations', '/api/v1/admin/attendance/academic-terms',
  '/api/v1/admin/attendance/summary', '/api/v1/admin/attendance/analytics',
  '/api/v1/admin/attendance/logs', '/api/v1/admin/attendance/capacity',
  '/api/v1/admin/attendance/report.pdf',
  '/api/v1/admin/users/summary', '/api/v1/admin/users/programs', '/api/v1/admin/users/active',
  '/api/v1/admin/printing/summary', '/api/v1/admin/printing/service-status',
  '/api/v1/admin/printing/queue', '/api/v1/admin/printing/supplies',
  '/api/v1/admin/printing/supplies/movements', '/api/v1/admin/printing/finance/summary',
  '/api/v1/admin/printing/finance/entries', '/api/v1/admin/printing/revenue/summary',
  '/api/v1/admin/printing/revenue/entries', '/api/v1/admin/printing/expenses/summary',
  '/api/v1/admin/printing/restocks', '/api/v1/admin/printing/stock-usage',
  '/api/v1/admin/printing/report.pdf', '/api/v1/admin/printing/finance/report.pdf',
  '/api/v1/admin/printing/reports/revenue.pdf',
  '/api/v1/admin/printing/reports/stock-expenses.pdf',
  '/api/v1/admin/printing/supplies/report.pdf',
  '/api/v1/admin/clearance', '/api/v1/admin/clearance/export.csv',
  '/api/v1/admin/fines', '/api/v1/admin/fines/terms', '/api/v1/admin/fines/report.pdf',
  '/api/v1/admin/inventory/thesis', '/api/v1/admin/inventory/thesis/summary',
  '/api/v1/admin/reports/thesis/csv', '/api/v1/admin/reports/thesis/pdf',
  '/api/categories', '/api/categories/shelves', '/api/catalog/search', '/api/catalog/admin/copies',
  '/api/catalog/research-inventory', '/api/reports/catalog/inventory.csv',
  '/api/reports/catalog/inventory.pdf',
  '/api/v1/floor-plan/image', '/api/v1/catalog/books', '/api/v1/catalog/research',
]
const admin = [
  ...staff, '/api/v1/admin/announcements', '/api/v1/admin/catalog/archive',
  '/api/v1/admin/catalog/archive/deleted-snapshots',
]
const routes = [
  ['Public', '/api/health'], ['Public', '/login'], ['Public', '/register'],
  ...student.map(path => ['Student', path]),
  ...student.map(path => ['Faculty', path]),
  ...staff.map(path => ['Librarian', path]),
  ...admin.map(path => ['Admin', path]),
]

try {
  const tokens = {}
  const skippedRoles = []
  for (const role of ['Student', 'Faculty', 'Librarian', 'Admin']) {
    const [rows] = await db.execute(
      "SELECT account_id, school_id FROM accounts WHERE role = ? AND account_status = 'Active' AND user_id IS NOT NULL ORDER BY account_id LIMIT 1",
      [role],
    )
    if (!rows.length) { skippedRoles.push(role); continue }
    const accountId = Number(rows[0].account_id)
    tokens[role] = jwt.sign(
      { accountId, userId: accountId, schoolId: String(rows[0].school_id), role },
      env.jwt.secret,
      { algorithm: 'HS256', issuer: env.jwt.issuer, audience: env.jwt.audience,
        subject: String(accountId), expiresIn: '5m' },
    )
  }
  const [covers] = await db.execute(
    "SELECT cover_image_path FROM titles WHERE cover_image_path IS NOT NULL AND cover_image_path <> ''",
    [],
  )
  for (const row of covers) {
    const path = String(row.cover_image_path)
    if (path.startsWith('/') || path.startsWith('https://')) routes.push(['Public', path])
  }
  const [bookCopies] = await db.execute(
    'SELECT pc.physical_copy_id, pc.barcode, pc.title_id FROM physical_copies pc ORDER BY pc.physical_copy_id LIMIT 1', [],
  )
  if (bookCopies.length) {
    const copy = bookCopies[0]
    routes.push(['Student', `/api/v1/catalog/books/${copy.title_id}`])
    routes.push(['Student', `/api/v1/catalog/copies/${encodeURIComponent(copy.barcode)}`])
    routes.push(['Student', `/api/v1/floor-plan/location?titleId=${copy.title_id}&copyId=${copy.physical_copy_id}`])
    routes.push(['Admin', `/api/v1/admin/books/assets/${copy.physical_copy_id}`])
    routes.push(['Admin', `/api/v1/admin/books/assets/${copy.physical_copy_id}/barcode.png`])
    routes.push(['Admin', `/api/v1/admin/books/assets/${copy.physical_copy_id}/qr.png`])
  }
  const [research] = await db.execute(
    'SELECT research_inventory_id, title_id FROM research_inventory ORDER BY research_inventory_id LIMIT 1', [],
  )
  if (research.length) {
    routes.push(['Student', `/api/v1/catalog/research/${research[0].title_id}`])
    routes.push(['Admin', `/api/v1/admin/research/assets/${research[0].research_inventory_id}`])
  }
  let next = 0
  const results = []
  async function run() {
    while (next < routes.length) {
      const [role, path] = routes[next++]
      if (role !== 'Public' && !tokens[role]) continue
      try {
        const endpoint = path.startsWith('https://') ? path : base + path
        const response = await fetch(endpoint, {
          headers: role === 'Public' ? {} : { Authorization: `Bearer ${tokens[role]}` },
          signal: AbortSignal.timeout(20000), redirect: 'manual',
        })
        const contentType = response.headers.get('content-type') ?? ''
        const body = !response.ok && contentType.includes('application/json')
          ? await response.json().catch(() => ({})) : {}
        const expectedType = /\.pdf$|\/pdf$/.test(path) ? 'application/pdf'
          : /\.csv$|\/csv$/.test(path) ? 'text/csv'
            : /\.png$/.test(path) ? 'image/png'
              : /\.(jpg|jpeg|webp)$/.test(path) ? 'image/' : null
        const typeOk = !expectedType || contentType.includes(expectedType)
        results.push({ role, path, status: response.status, typeOk,
          code: body.code ?? null, message: body.message ?? null })
      } catch (error) {
        results.push({ role, path, status: 0, code: error.name, message: error.message })
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => run()))
  const failures = results.filter(result => result.status !== 200 || result.typeOk === false)
  console.log(JSON.stringify({ base, skippedRoles, checked: results.length, passed: results.length - failures.length,
    failed: failures.length, failures }, null, 2))
  if (failures.length) process.exitCode = 1
} finally {
  await db.end()
}
