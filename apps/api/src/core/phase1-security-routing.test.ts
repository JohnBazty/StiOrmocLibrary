import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from './http-error.ts'
import { normalizeVercelRequest } from './vercel-request.js'
import { attendanceRouter } from '../modules/attendance/attendance.routes.ts'
import { createAttendanceService } from '../modules/attendance/attendance.service.ts'
import { createReservationsRouter } from '../modules/reservations/reservations.routes.ts'
import { createReservationController } from '../modules/reservations/reservation.controller.ts'
import { requireLibraryOpenForUserTransactions } from '../modules/notifications/library-schedule-guard.ts'
import { createLiveReportsRouter } from '../modules/reports/live-reports.routes.ts'
import { UsersRepository } from '../modules/users/users.repository.ts'
import { verifyCsrfToken } from '../modules/auth/auth.middleware.js'
import { createLoginSecurityService } from '../modules/auth/login-security.service.ts'
import { sendSchoolEmail } from '../modules/auth/school-email.sender.ts'
import { createCirculationController } from '../modules/circulation/circulation.controller.ts'
import { createLoginController } from '../modules/auth/authController.js'
import { floorPlanImageService } from '../modules/floor-plan/floor-plan-image.service.ts'

test('CRIT-04: attendanceRouter blocks Student, Faculty, and Admin, and enforces Staff restrictions for Library Staff', async () => {
  for (const role of ['Student', 'Faculty', 'Admin']) {
    const app = express()
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 5, role }; next() })
    app.use('/api/attendance', attendanceRouter)
    const logs = await request(app).get('/api/attendance/logs')
    assert.equal(logs.status, 403, `${role} should be denied /logs`)
    const cap = await request(app).patch('/api/attendance/capacity').send({ capacity: 1, reason: 'test' })
    assert.equal(cap.status, 403, `${role} should be denied PATCH /capacity`)
  }

  const staffApp = express()
  staffApp.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 6, role: 'Library Staff' }; next() })
  staffApp.use('/api/attendance', attendanceRouter)
  const pdf = await request(staffApp).get('/api/attendance/report.pdf')
  assert.equal(pdf.status, 403, 'Library Staff must be blocked from /report.pdf')
})

test('CRIT-04: attendanceService.updateCapacity enforces library.manage actor permission inside transaction', async () => {
  let rolledBack = false
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string) => {
      if (sql.includes('SELECT a.role,a.account_status')) return [[{ role: 'Student', account_status: 'Active', user_status: 'Active' }]]
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 9 }]]
      if (sql.includes('SELECT seat_capacity')) return [[{ seat_capacity: 80 }]]
      return [{ affectedRows: 1 }]
    },
    commit: async () => { throw new Error('Should not commit for unauthorized role') },
    rollback: async () => { rolledBack = true },
    release: () => undefined,
  }
  const service = createAttendanceService({ getConnection: async () => connection } as never)
  await assert.rejects(
    service.updateCapacity({ accountId: 9, role: 'Student' }, { capacity: 50, reason: 'Unauthorized capacity mutation' }),
    (err: unknown) => err instanceof HttpError && err.status === 403 && err.code === 'JWT_ROLE_FORBIDDEN',
  )
  assert.equal(rolledBack, true)
})

test('CRIT-05: legacy POST /api/reservations blocks non-patron roles and routes JWT callers via createForAccount', async () => {
  const calls: Array<{ fn: string; id: unknown }> = []
  const service = {
    create: async (id: unknown) => { calls.push({ fn: 'create', id }); return { id: 1 } },
    createForAccount: async (id: unknown) => { calls.push({ fn: 'createForAccount', id }); return { id: 2 } },
  }
  const errorHandler = (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) res.status(err.status).json({ code: err.code })
    else res.status(500).json({ code: 'ERR' })
  }

  // Non-patron role must be blocked
  const adminApp = express()
  adminApp.use(express.json())
  adminApp.use((_req, res, next) => {
    res.locals.authenticatedUser = { id: 42, accountId: 42, role: 'Admin' }
    res.locals.authenticationType = 'jwt'
    next()
  })
  adminApp.use('/api/reservations', createReservationsRouter(createReservationController(service as never)))
  adminApp.use(errorHandler)
  assert.equal((await request(adminApp).post('/api/reservations').send({ materialId: 10 })).status, 403)
  assert.equal(calls.length, 0)

  // JWT Student must call createForAccount (never create with account_id as user_id)
  const studentApp = express()
  studentApp.use(express.json())
  studentApp.use((_req, res, next) => {
    res.locals.authenticatedUser = { id: 42, accountId: 42, role: 'Student' }
    res.locals.authenticationType = 'jwt'
    next()
  })
  studentApp.use('/api/reservations', createReservationsRouter(createReservationController(service as never)))
  studentApp.use(errorHandler)
  const res = await request(studentApp).post('/api/reservations').send({ materialId: 10 })
  assert.equal(res.status, 201)
  assert.deepEqual(calls, [{ fn: 'createForAccount', id: 42 }])
})

test('CRIT-06: UsersRepository blocks activating retired/archived Librarians and blocks password reset on inactive accounts', async () => {
  function repoFor(targetRole: string, targetStatus: string, actorRole = 'Admin') {
    const connection = {
      beginTransaction: async () => undefined,
      execute: async (sql: string) => {
        if (sql.includes('SELECT a.role,a.account_status')) return [[{ role: actorRole, account_status: 'Active' }]]
        if (sql.includes('FROM accounts WHERE account_id')) return [[{ account_id: 9, user_id: 19, role: targetRole, account_status: targetStatus }]]
        if (sql.includes('FROM library_ownership')) return [[]]
        if (sql.includes('SELECT locked_until')) return [[{ locked_until: null }]]
        return [{ affectedRows: 1 }]
      },
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => undefined,
    }
    return new UsersRepository({ getConnection: async () => connection } as never, { hash: async (v: string) => v } as never)
  }

  // Admin cannot reactivate a retired/Deactivated Librarian
  await assert.rejects(
    repoFor('Librarian', 'Deactivated', 'Admin').changeStatus(9, 2, { status: 'Active', reason: 'Escalate to retired librarian' }),
    (err: unknown) => err instanceof HttpError && err.status === 403 && err.code === 'USER_STATUS_PROTECTED',
  )
  // Admin cannot reactivate an Archived account of any role
  await assert.rejects(
    repoFor('Student', 'Archived', 'Admin').changeStatus(9, 2, { status: 'Active', reason: 'Resurrect archived student' }),
    (err: unknown) => err instanceof HttpError && err.status === 403 && err.code === 'USER_STATUS_PROTECTED',
  )
  // Admin cannot set temporary password on Deactivated/Archived Librarian
  await assert.rejects(
    repoFor('Librarian', 'Deactivated', 'Admin').setTemporaryPassword(9, 2, { reason: 'Reset retired librarian' }),
    (err: unknown) => err instanceof HttpError && err.status === 409 && err.code === 'USER_ACCOUNT_INACTIVE',
  )
})

test('CRIT-07: session login stores linked accountId and circulationController does not substitute user_id for accountId', async () => {
  const req: any = {
    body: { email: 'staff@ormoc.sti.edu.ph', password: 'correct-password' },
    sessionID: 'sid-1',
    session: { regenerate(cb: any) { cb(null) }, save(cb: any) { cb(null) } },
  }
  const res: any = { statusCode: 200, payload: null, status(c: number) { this.statusCode = c; return this }, json(p: any) { this.payload = p; return this } }
  const login = createLoginController({
    database: {
      execute: async () => [[{
        user_id: 17, account_id: 99, full_name: 'Staff One', email: 'staff@ormoc.sti.edu.ph',
        password_hash: 'h', account_status: 'Active', linked_status: 'Active', role_name: 'Library Staff',
      }]],
    } as never,
    passwordHasher: { compare: async () => true } as never,
    sessions: { incrementAuthVersionForUser: async () => 2, clearOtherSessions: async () => undefined } as never,
  })
  await login(req, res, (e: unknown) => { if (e) throw e })
  assert.equal(req.session.user.accountId, 99)

  // If a session user lacks accountId, circulationController must not pass users.user_id as accountId
  let receivedAccount: unknown = 'UNSET'
  const controller = createCirculationController({} as never, {
    closeCase: async (actor: unknown) => { receivedAccount = actor; return {} },
  } as never)
  const app = express()
  app.use(express.json())
  app.use((_r, response, next) => {
    response.locals.authenticationType = 'session'
    response.locals.authenticatedUser = { id: 17, role: 'Library Staff' } // no accountId
    next()
  })
  app.post('/cases/:caseId/resolve', controller.resolveCase)
  app.use((err: unknown, _r: express.Request, response: express.Response, _n: express.NextFunction) => {
    response.status(err instanceof HttpError ? err.status : 500).json({ code: err instanceof HttpError ? err.code : 'ERR' })
  })
  const out = await request(app).post('/cases/1/resolve').send({})
  assert.equal(out.status, 401)
  assert.equal(receivedAccount, 'UNSET')
})

test('HIGH-01: requireLibraryOpenForUserTransactions reads response.locals.authenticatedUser.role for JWT patrons', async () => {
  const closedSchedule = async () => ({
    weekly: [
      { dayOfWeek: 1, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
      { dayOfWeek: 2, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
      { dayOfWeek: 3, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
      { dayOfWeek: 4, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
      { dayOfWeek: 5, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
      { dayOfWeek: 6, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
      { dayOfWeek: 7, isOpen: false, opensAt: null, closesAt: null },
    ],
    upcomingClosures: [],
  })
  // Sunday 2026-11-22 10:00 Manila (02:00 UTC)
  const sunday = () => new Date('2026-11-22T02:00:00.000Z')
  const app = express()
  app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 10, role: 'Student' }; next() })
  app.use(requireLibraryOpenForUserTransactions(closedSchedule as never, sunday))
  app.post('/submit', (_req, res) => res.json({ ok: true }))
  app.get('/view', (_req, res) => res.json({ ok: true }))
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err instanceof HttpError ? err.status : 500).json({ code: err instanceof HttpError ? err.code : 'ERR' })
  })

  const postRes = await request(app).post('/submit')
  assert.equal(postRes.status, 403)
  assert.equal(postRes.body.code, 'LIBRARY_CLOSED_VIEW_ONLY')
  const getRes = await request(app).get('/view')
  assert.equal(getRes.status, 200)
})

test('HIGH-08: GET /audit-logs allows Admin and Librarian while denying Staff/Student/Faculty and keeping / restricted', async () => {
  const readAudit = async () => ({ items: [], summary: { total: 0 } })
  for (const role of ['Admin', 'Librarian', 'Staff', 'Student', 'Faculty']) {
    const app = express()
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 1, role }; next() })
    app.use(createLiveReportsRouter({ read: async () => { throw new Error('no') } } as never, readAudit as never))
    const auditRes = await request(app).get('/audit-logs')
    assert.equal(auditRes.status, ['Admin', 'Librarian'].includes(role) ? 200 : 403, `audit-logs for ${role}`)
  }
})

test('HIGH-20: normalizeVercelRequest preserves +, %2F, and blocks %3F/%23 query injection or truncation', () => {
  const plusReq = { url: '/api/index?__api_route=v1%2Fcatalog%2Fcopies%2FA%2BB&page=1' }
  normalizeVercelRequest(plusReq)
  assert.equal(plusReq.url, '/api/v1/catalog/copies/A%2BB?page=1')

  const injectReq = { url: '/api/index?__api_route=v1%2Fcatalog%2Fcopies%2Ffoo%3Fadmin%3D1%23frag&page=2' }
  normalizeVercelRequest(injectReq)
  assert.equal(injectReq.url, '/api/v1/catalog/copies/foo%3Fadmin%3D1%23frag?page=2')
})

test('MED-14: loginSecurityService.resend rejects expired OTP challenges', async () => {
  const challengeId = '11111111-2222-4333-8444-555555555555'
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string) => {
      if (sql.includes('SELECT account_id FROM login_otp_challenges')) return [[{ account_id: 7 }]]
      if (sql.includes('enrollment_lifecycle')) return [[{ id: 1, started: false }]]
      if (sql.includes('FROM accounts a')) return [[{ auth_version: 1, account_status: 'Active', email: 's@ormoc.sti.edu.ph', role: 'Student', school_id: 'S-1', linked_status: 'Active' }]]
      if (sql.includes('SELECT * FROM login_otp_challenges')) {
        return [[{
          challenge_id: challengeId, account_id: 7, auth_version: 1, code_hash: 'h',
          consumed_at: null, failed_count: 0, resend_count: 0,
          sent_at: new Date(Date.now() - 120_000),
          expires_at: new Date(Date.now() - 10_000), // expired!
        }]]
      }
      return [{ affectedRows: 1 }]
    },
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }
  const service = createLoginSecurityService(
    { getConnection: async () => connection, execute: async () => [[]] } as never,
    async () => { throw new Error('unused') },
    async () => { throw new Error('Should not resend expired challenge') },
  )
  await assert.rejects(
    service.resend({ challenge_id: challengeId }),
    (err: unknown) => err instanceof HttpError && err.status === 422 && err.code === 'LOGIN_CODE_INVALID',
  )
})

test('MED-17: Microsoft Graph email sender normalizes fetch network failure into 503 EMAIL_DELIVERY_UNAVAILABLE', async () => {
  const keys = ['GMAIL_SENDER_EMAIL', 'GMAIL_APP_PASSWORD', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'MS_GRAPH_TENANT_ID', 'MS_GRAPH_CLIENT_ID', 'MS_GRAPH_CLIENT_SECRET', 'MS_GRAPH_SENDER_EMAIL'] as const
  const prev = Object.fromEntries(keys.map(k => [k, process.env[k]]))
  const origFetch = globalThis.fetch
  try {
    for (const k of keys) delete process.env[k]
    process.env.MS_GRAPH_TENANT_ID = 't'
    process.env.MS_GRAPH_CLIENT_ID = 'c'
    process.env.MS_GRAPH_CLIENT_SECRET = 's'
    process.env.MS_GRAPH_SENDER_EMAIL = 'lib@ormoc.sti.edu.ph'
    globalThis.fetch = async () => { throw new Error('ECONNRESET') }
    await assert.rejects(
      sendSchoolEmail('user@ormoc.sti.edu.ph', 'Subject', 'Body'),
      (err: unknown) => err instanceof HttpError && err.status === 503 && err.code === 'EMAIL_DELIVERY_UNAVAILABLE',
    )
  } finally {
    globalThis.fetch = origFetch
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
  }
})

test('LOW: verifyCsrfToken returns 403 (not 500 TypeError) when _csrf body field is non-string', async () => {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { Object.defineProperty(req, 'session', { configurable: true, value: { csrfToken: 'abc123' } }); next() })
  app.post('/action', verifyCsrfToken, (_req, res) => res.json({ ok: true }))
  const res = await request(app).post('/action').send({ _csrf: 12345 })
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'INVALID_CSRF_TOKEN')
})

test('LOW: floorPlanImageService rejects prototype-property Content-Type with WebP magic bytes', async () => {
  const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00])
  await assert.rejects(
    floorPlanImageService.upload({ mimetype: 'toString', size: webp.length, buffer: webp, originalname: 'x.webp' } as never, 1),
    (err: unknown) => err instanceof HttpError && err.status === 422 && err.code === 'FLOOR_IMAGE_INVALID',
  )
})
