import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { after, before } from 'node:test'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../config/db.js'
import { signSessionToken } from '../modules/auth/login-security.service.ts'

// S3: the phone sends only "Authorization: Bearer ...". No Cookie, Origin, Sec-Fetch-Site or CSRF header.
// The route enumeration and the ALLOWED table are copied from the unmerged branch chore/api-v1-guard-matrix (api-v1-route-guards.test.ts).

type Role = 'Admin' | 'Librarian' | 'Staff' | 'Faculty' | 'Student'
const ALL: Role[] = ['Admin', 'Librarian', 'Staff', 'Faculty', 'Student']
const SELF = ['Student', 'Faculty'] as const
const DESK = ['Librarian', 'Staff'] as const
const LIBRARIAN = ['Librarian'] as const
const ACCOUNTS = ['Librarian', 'Admin'] as const
const PHONE_ROLES = ['Student', 'Faculty'] as const

/** Who may get past the guards of every /api/v1 mount in app.js (same table as the guard-matrix branch). */
const ALLOWED: Record<string, readonly Role[]> = {
  '/api/v1/admin/enrollment': ACCOUNTS,
  '/api/v1/admin/borrowing-policies': LIBRARIAN,
  '/api/v1/admin/maintenance': LIBRARIAN,
  '/api/v1/admin/collection-review': LIBRARIAN,
  '/api/v1/profile/avatar': ALL,
  '/api/v1/profile': ALL,
  '/api/v1/admin/account-dashboard': ACCOUNTS,
  '/api/v1/admin/jobs': LIBRARIAN,
  '/api/v1/catalog': ['Student', 'Faculty', 'Librarian'],
  '/api/v1/floor-plan': ['Student', 'Faculty', 'Librarian'],
  '/api/v1/admin/books': LIBRARIAN,
  '/api/v1/admin/research': LIBRARIAN,
  '/api/v1/admin/catalog': LIBRARIAN,
  '/api/v1/admin/invoices': LIBRARIAN,
  '/api/v1/invoices': SELF,
  '/api/v1/reservations': SELF,
  '/api/v1/borrowing': SELF,
  '/api/v1/admin/circulation-desk': DESK,
  '/api/v1/borrow': SELF,
  '/api/v1/circulation': ['Student', 'Faculty', 'Librarian', 'Staff'],
  '/api/v1/admin/reservations': DESK,
  '/api/v1/admin/attendance': DESK,
  '/api/v1/attendance': ['Student', 'Faculty', 'Librarian'],
  '/api/v1/admin/users': ACCOUNTS,
  '/api/v1/admin/notifications': ACCOUNTS,
  '/api/v1/printing': SELF,
  '/api/v1/clearance': SELF,
  '/api/v1/fines': SELF,
  '/api/v1/notifications': ['Student', 'Faculty', 'Librarian', 'Staff'],
  '/api/v1/dashboard': SELF,
  '/api/v1/workspace/tasks': DESK,
  '/api/v1/admin/reports': LIBRARIAN,
  '/api/v1/admin/printing': DESK,
  '/api/v1/admin/clearance': ['Admin', 'Librarian'],
  '/api/v1/admin/fines': LIBRARIAN,
  '/api/v1/admin/announcements': DESK,
  '/api/v1/admin/dashboard': LIBRARIAN,
  '/api/v1/admin': DESK,
}
// Sign-in routes are public; '/api/v1' root routes are listed in EXTRA_PROBES.
const NOT_IN_TABLE = new Set(['/api/v1/auth', '/api/v1'])
// Phone-reachable routes that are not under a table prefix (jwtAuthRouter /me and /activity, jwtProtectedRouter role dashboards).
const EXTRA_PROBES = [
  { roles: PHONE_ROLES, method: 'get', path: '/api/v1/auth/me' },
  { roles: PHONE_ROLES, method: 'post', path: '/api/v1/auth/activity' },
  { roles: ['Student'], method: 'get', path: '/api/v1/student/dashboard' },
  { roles: ['Faculty'], method: 'get', path: '/api/v1/faculty/dashboard' },
] as const

// What each guard may answer when a route stops accepting a bare Bearer token.
const GUARD_CODES = ['JWT_REQUIRED', 'JWT_INVALID', 'INVALID_CSRF_TOKEN', 'AUTHENTICATION_REQUIRED', 'DEVICE_ORIGIN', 'SESSION_UPGRADE_REQUIRED', 'ACCOUNT_ACCESS_REVOKED', 'SESSION_EXPIRED']
const SESSION_ID = '00000000-0000-4000-8000-000000000001'

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const mountedPrefixes = new Set([...appSource.matchAll(/app\.(?:use|get|post|put|patch|delete)\(\s*['"`](\/api\/v1[^'"`]*)['"`]/g)].map(m => m[1]))

type Layer = { handle: { stack?: Layer[] }; route?: { path: string | string[]; methods: Record<string, boolean> }; path?: string; match(path: string): boolean }
type Probe = { roles: readonly Role[]; method: string; path: string }

/** Every concrete route under each /api/v1 mount in the table, read from Express's router stack. */
function routesUnderMounts(app: ReturnType<typeof createApp>) {
  const stack = (app as unknown as { router: { stack: Layer[] } }).router.stack
  const prefixes = Object.keys(ALLOWED)
  const concrete = (path: string) => path.replace(/:\w+/g, '1').replace(/\*\w+/g, 'x').replace(/[{}]/g, '')
  const probes: Probe[] = EXTRA_PROBES.map(p => ({ ...p }))
  for (const layer of stack) {
    if (layer.route) {
      const path = String(layer.route.path)
      if (path in ALLOWED) for (const method of Object.keys(layer.route.methods)) probes.push({ roles: ALLOWED[path], method, path })
      continue
    }
    if (!layer.handle.stack) continue
    const prefix = prefixes.find(p => layer.match(`${p}/probe`) && layer.path === p)
    if (!prefix) continue
    for (const inner of layer.handle.stack) {
      if (!inner.route) continue
      for (const routePath of ([] as string[]).concat(inner.route.path)) {
        for (const method of Object.keys(inner.route.methods)) probes.push({ roles: ALLOWED[prefix], method, path: concrete(`${prefix}${routePath === '/' ? '' : routePath}`) })
      }
    }
  }
  return probes
}

const send = (app: ReturnType<typeof createApp>, { method, path }: Probe) => (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path)
const tokenFor = (role: Role) => signSessionToken({ accountId: 1, schoolId: 'TEST0001', role, authVersion: 1, sessionId: SESSION_ID })

const realExecute = db.execute
const realGetConnection = db.getConnection
before(() => {
  // The guard's account and session queries answer "active"; every other query is empty, and no test opens a real connection.
  db.execute = (async (sql: string) => {
    if (/FROM accounts a LEFT JOIN users u/.test(sql)) return [[{ account_status: 'Active', auth_version: 1, school_id: 'TEST0001', role: currentRole, user_status: 'Active' }], []]
    if (/FROM library_login_sessions/.test(sql)) return [[{ ok: 1 }], []]
    return [[], []]
  }) as unknown as typeof db.execute
  db.getConnection = (async () => { throw new Error('no database in this test') }) as typeof db.getConnection
})
after(() => { db.execute = realExecute; db.getConnection = realGetConnection })
let currentRole: Role = 'Student'

test('every /api/v1 mount in app.js is in the table, so new mounts get probed', () => {
  const missing = [...mountedPrefixes].filter(prefix => !(prefix in ALLOWED) && !NOT_IN_TABLE.has(prefix))
  assert.deepEqual(missing, [], 'add new /api/v1 mounts to ALLOWED with the roles that may use them')
  const stale = Object.keys(ALLOWED).filter(prefix => !mountedPrefixes.has(prefix))
  assert.deepEqual(stale, [], 'remove prefixes that app.js no longer mounts')
})

test('no /api/v1 mount line in app.js adds verifyCsrfToken or sameOrigin', () => {
  const mountLines = appSource.split('\n').filter(line => line.includes("app.use('/api/v1"))
  assert.ok(mountLines.length > 20, `expected the /api/v1 mount lines, found ${mountLines.length}`)
  assert.deepEqual(mountLines.filter(line => /verifyCsrfToken|sameOrigin/.test(line)), [])
})

test('Student and Faculty reach every allowed /api/v1 route with only a Bearer token', async () => {
  const app = createApp()
  const probes = routesUnderMounts(app)
  const failures: string[] = []
  let checked = 0
  const realError = console.error
  console.error = () => {} // handlers hit the stubbed database and log their expected 500s
  try {
    for (const role of PHONE_ROLES) {
      currentRole = role
      const token = tokenFor(role)
      for (const probe of probes) {
        if (!probe.roles.includes(role)) continue
        checked++
        const response = await send(app, probe).set('Authorization', `Bearer ${token}`)
        const body = response.body as { code?: string; message?: string }
        const label = `${role} ${probe.method.toUpperCase()} ${probe.path} -> ${response.status}`
        if (GUARD_CODES.includes(body?.code ?? '')) failures.push(`${label} ${body.code}`)
        else if (response.status === 404 && body?.message === 'Route not found.') failures.push(`${label} catch-all 404`)
      }
    }
  } finally { console.error = realError }
  assert.ok(checked > 20, `expected more than 20 routes, checked ${checked}`)
  assert.deepEqual(failures, [])
})

test('control: the same request without the Bearer header answers JWT_REQUIRED', async () => {
  const app = createApp()
  const probe = routesUnderMounts(app).find(p => p.roles.includes('Student') && p.path.startsWith('/api/v1/dashboard'))
  assert.ok(probe, 'no /api/v1/dashboard route found')
  const response = await send(app, probe)
  assert.equal(response.status, 401)
  assert.equal(response.body.code, 'JWT_REQUIRED')
})
