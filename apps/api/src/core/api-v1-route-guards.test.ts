import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../config/db.js'
import { env } from '../config/env.js'

type Role = 'Admin' | 'Librarian' | 'Staff' | 'Faculty' | 'Student'
const ROLES: Role[] = ['Admin', 'Librarian', 'Staff', 'Faculty', 'Student']
const ALL = ROLES
const SELF = ['Student', 'Faculty'] as const
const DESK = ['Librarian', 'Staff'] as const
const LIBRARIAN = ['Librarian'] as const
const ACCOUNTS = ['Librarian', 'Admin'] as const

/**
 * Who may get past the guards of every /api/v1 mount in app.js.
 * Several routers share a prefix, so a guard can come from the mount line or from inside the router;
 * this table pins the combined result so a reordered or unguarded mount fails here.
 */
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
// A prefix mounted more than once: roles for the second, third... router, in app.js order.
// Unlisted later mounts use the same roles as the first.
const LATER_MOUNTS: Record<string, readonly (readonly Role[])[]> = {
  '/api/v1/admin': [LIBRARIAN], // thesis inventory: library.manage, stricter than the desk mount before it
}
// Public sign-in routes, and the root mounts whose routes each carry their own guard.
const NOT_IN_TABLE = new Set(['/api/v1/auth', '/api/v1'])

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const mountedPrefixes = new Set([...appSource.matchAll(/app\.(?:use|get|post|put|patch|delete)\(\s*['"`](\/api\/v1[^'"`]*)['"`]/g)].map(m => m[1]))

function tokenFor(role: Role) {
  return jwt.sign({ accountId: 7, userId: 7, schoolId: `TEST-${role}`, role, authVersion: 1, sessionId: 'guard-test-session' }, env.jwt.secret, {
    algorithm: 'HS256', issuer: env.jwt.issuer, audience: env.jwt.audience, subject: '7', expiresIn: '5m',
  })
}

/** The active-account check passes for the token's role; nothing else returns rows. */
function stubDatabase(role: Role) {
  return (async (sql: string) => {
    if (/FROM accounts a LEFT JOIN users u/.test(sql)) return [[{ account_status: 'Active', auth_version: 1, school_id: `TEST-${role}`, role, user_status: 'Active' }], []]
    if (/FROM library_login_sessions/.test(sql)) return [[{ ok: 1 }], []]
    return [[], []]
  }) as unknown as typeof db.execute
}

test('every /api/v1 mount in app.js has an entry in the guard table', () => {
  const missing = [...mountedPrefixes].filter(prefix => !(prefix in ALLOWED) && !NOT_IN_TABLE.has(prefix))
  assert.deepEqual(missing, [], 'add new /api/v1 mounts to ALLOWED with the roles that may use them')
  const stale = Object.keys(ALLOWED).filter(prefix => !mountedPrefixes.has(prefix))
  assert.deepEqual(stale, [], 'remove prefixes that app.js no longer mounts')
})

type Layer = { handle: { stack?: Layer[] }; route?: { path: string | string[]; methods: Record<string, boolean> }; path?: string; match(path: string): boolean }
type Probe = { allowed: readonly Role[]; method: string; path: string }

/** Every concrete route under each /api/v1 mount, read from Express's router stack, with the roles its mount allows. */
function routesUnderMounts(app: ReturnType<typeof createApp>) {
  const stack = (app as unknown as { router: { stack: Layer[] } }).router.stack
  const prefixes = Object.keys(ALLOWED)
  const concrete = (path: string) => path.replace(/:\w+/g, '1').replace(/\*\w+/g, 'x').replace(/[{}]/g, '')
  const probes: Probe[] = []
  const nestedRouters: string[] = []
  const mountsSeen: Record<string, number> = {}
  for (const layer of stack) {
    if (layer.route) {
      const path = String(layer.route.path)
      if (path in ALLOWED) for (const method of Object.keys(layer.route.methods)) probes.push({ allowed: ALLOWED[path], method, path })
      continue
    }
    if (!layer.handle.stack) continue
    const prefix = prefixes.find(p => layer.match(`${p}/guard-probe`) && layer.path === p)
    if (!prefix) continue
    const mount = mountsSeen[prefix] = (mountsSeen[prefix] ?? -1) + 1
    const allowed = mount === 0 ? ALLOWED[prefix] : LATER_MOUNTS[prefix]?.[mount - 1] ?? ALLOWED[prefix]
    for (const inner of layer.handle.stack) {
      if (!inner.route) {
        if (inner.handle.stack) nestedRouters.push(prefix)
        continue
      }
      for (const routePath of ([] as string[]).concat(inner.route.path)) {
        for (const method of Object.keys(inner.route.methods)) probes.push({ allowed, method, path: concrete(`${prefix}${routePath === '/' ? '' : routePath}`) })
      }
    }
  }
  return { probes, nestedRouters }
}

test('roles outside each /api/v1 mount get 403 on every route before any handler runs', async () => {
  const app = createApp()
  const { probes, nestedRouters } = routesUnderMounts(app)
  assert.deepEqual(nestedRouters, [], 'a router nested inside a mounted router is not probed; extend routesUnderMounts')
  assert.ok(probes.length > 150, `expected the full route list, found ${probes.length}`)
  const execute = db.execute
  const failures: string[] = []
  try {
    for (const role of ROLES) {
      db.execute = stubDatabase(role)
      const token = tokenFor(role)
      for (const { allowed, method, path } of probes) {
        if (allowed.includes(role)) continue
        const response = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path).set('Authorization', `Bearer ${token}`)
        if (response.status !== 403) failures.push(`${role} ${method.toUpperCase()} ${path} -> ${response.status}`)
      }
    }
  } finally { db.execute = execute }
  assert.deepEqual(failures, [])
})
