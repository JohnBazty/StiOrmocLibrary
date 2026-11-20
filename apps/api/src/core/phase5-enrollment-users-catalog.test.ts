import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { PGlite } from '@electric-sql/pglite'
import { HttpError } from './http-error.ts'
import { checkSchemaReadiness } from './schema-readiness.ts'
import { createOwnershipTransfer } from '../modules/users/ownership-transfer.service.ts'
import { ownershipDigest, ownershipToken } from '../modules/users/ownership-transfer.policy.ts'
import { UsersRepository } from '../modules/users/users.repository.ts'
import { createEnrollmentService } from '../modules/enrollment/enrollment.service.ts'
import { parseEnrollmentFile } from '../modules/enrollment/enrollment-parser.ts'
import { queryResearchOverview } from '../modules/catalog/research-catalog.repository.ts'
import { createInvoiceService } from '../modules/invoices/invoice.service.ts'

test('HIGH-04: migration 077_enrollment_roster_source_kind.sql adds source_kind column and check constraint, and schema-readiness checks source_kind and auth_version', async () => {
  const sql = readFileSync(new URL('../../../../database/supabase/077_enrollment_roster_source_kind.sql', import.meta.url), 'utf8')
  const pg = new PGlite()
  try {
    await pg.exec(`
      CREATE TABLE public.enrollment_roster_imports (
        roster_id BIGSERIAL PRIMARY KEY,
        semester_id BIGINT NOT NULL,
        source_date DATE NOT NULL,
        complete BOOLEAN NOT NULL DEFAULT FALSE,
        file_hash CHAR(64) NOT NULL,
        file_name VARCHAR(180) NOT NULL,
        student_count INTEGER NOT NULL DEFAULT 0,
        uploaded_by BIGINT NULL,
        roster_role VARCHAR(16) NOT NULL DEFAULT 'Student'
      );
    `)
    await pg.exec(sql)
    await pg.exec(sql) // Idempotent second run
    await pg.exec(`
      INSERT INTO public.enrollment_roster_imports (semester_id, source_date, complete, file_hash, file_name, source_kind)
      VALUES (1, '2026-11-20', true, '${'a'.repeat(64)}', 'roster.csv', 'LateEnrollmentForm');
    `)
    await assert.rejects(
      pg.exec(`
        INSERT INTO public.enrollment_roster_imports (semester_id, source_date, complete, file_hash, file_name, source_kind)
        VALUES (1, '2026-11-20', true, '${'b'.repeat(64)}', 'roster.csv', 'InvalidKind');
      `),
    )
  } finally {
    await pg.close()
  }

  const prev = process.env.ENROLLMENT_ROSTER_ENABLED
  process.env.ENROLLMENT_ROSTER_ENABLED = 'true'
  try {
    const readiness = await checkSchemaReadiness({
      execute: async () => [[
        { TABLE_NAME: 'enrollment_roster_imports', COLUMN_NAME: 'roster_id' },
        { TABLE_NAME: 'accounts', COLUMN_NAME: 'account_id' },
        { TABLE_NAME: 'users', COLUMN_NAME: 'user_id' },
      ]],
    } as never)
    assert.ok(readiness.missingColumns.includes('enrollment_roster_imports.source_kind'))
    assert.ok(readiness.missingColumns.includes('accounts.auth_version'))
    assert.ok(readiness.missingColumns.includes('users.auth_version'))
  } finally {
    process.env.ENROLLMENT_ROSTER_ENABLED = prev
  }
})

test('HIGH-13: ownershipTransfer.setupPreview remains valid when owner or recipient auth_version advances from routine sign-in', async () => {
  const invitationId = '11111111-2222-4333-8444-555555555555'
  const token = ownershipToken(invitationId, 3)
  const tokenHash = ownershipDigest(invitationId, token)
  const now = new Date('2026-11-20T02:00:00.000Z')

  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT * FROM library_ownership')) {
        return [[{ singleton: true, owner_account_id: 1, row_version: 5 }]]
      }
      if (sql.includes('SELECT * FROM ownership_transfer_invitations')) {
        return [[{
          invitation_id: invitationId,
          status: 'Pending',
          expires_at: new Date('2026-11-21T02:00:00.000Z'),
          token_hash: tokenHash,
          owner_account_id: 1,
          owner_auth_version: 3,
          ownership_version: 5,
          recipient_email: 'newowner@ormoc.sti.edu.ph',
          target_account_id: 2,
          target_auth_version: 4,
          target_role: 'Staff',
        }]]
      }
      if (sql.includes('SELECT a.account_id FROM users u')) {
        return [[{ account_id: 2 }]]
      }
      if (sql.includes('FROM accounts a JOIN users u')) {
        if (Number(params[0]) === 1) {
          // Owner logged in/out since sending invite: auth_version is now 6 (was 3)
          return [[{ account_id: 1, user_id: 1, role: 'Librarian', account_status: 'Active', user_status: 'Active', auth_version: 6, email: 'owner@ormoc.sti.edu.ph' }]]
        }
        // Recipient logged in/out since invite: auth_version is now 8 (was 4)
        return [[{ account_id: 2, user_id: 2, role: 'Staff', account_status: 'Active', user_status: 'Active', auth_version: 8, email: 'newowner@ormoc.sti.edu.ph', full_name: 'New Owner' }]]
      }
      return [[]]
    },
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }

  const service = createOwnershipTransfer({ getConnection: async () => connection } as never, undefined, () => now)
  const preview = await service.setupPreview({ invitation_id: invitationId, setup_token: token })
  assert.equal(preview.email, 'newowner@ormoc.sti.edu.ph')
  assert.equal(preview.name, 'New Owner')
})

test('HIGH-14: UsersRepository.changeStatus blocks reactivating a Student not in the active semester roster when enrollment is active', async () => {
  const prev = process.env.ENROLLMENT_ROSTER_ENABLED
  process.env.ENROLLMENT_ROSTER_ENABLED = 'true'
  try {
    const connection = {
      beginTransaction: async () => undefined,
      execute: async (sql: string) => {
        if (sql.includes('SELECT a.role,a.account_status')) {
          return [[{ role: 'Librarian', account_status: 'Active', user_status: 'Active' }]]
        }
        if (sql.includes('FROM accounts WHERE account_id=? FOR UPDATE')) {
          return [[{ account_id: 9, user_id: 19, school_id: '02000999888', role: 'Student', account_status: 'Deactivated' }]]
        }
        if (sql.includes('SELECT started FROM enrollment_lifecycle')) {
          return [[{ started: true }]]
        }
        if (sql.includes('FROM enrollment_semesters')) {
          return [[{ semester_id: 3, academic_year: '2026-2027', term_name: '1st Semester' }]]
        }
        if (sql.includes('FROM (SELECT DISTINCT ON (r.school_id)')) {
          return [[]] // Not in active roster
        }
        return [{ affectedRows: 1 }]
      },
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => undefined,
    }
    const repo = new UsersRepository({ getConnection: async () => connection } as never)
    await assert.rejects(
      repo.changeStatus(9, 1, { status: 'Active', reason: 'Reactivate student manually' }),
      (err: unknown) => err instanceof HttpError && err.status === 422 && err.code === 'USER_NOT_IN_ACTIVE_ROSTER',
    )
  } finally {
    process.env.ENROLLMENT_ROSTER_ENABLED = prev
  }
})

test('HIGH-15: facultyEnrollmentService.qrRoster filters by Faculty role and start() requires a complete Student roster', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('SELECT a.role,a.account_status')) {
        return [[{ role: 'Librarian', account_status: 'Active', user_status: 'Active' }]]
      }
      if (sql.includes('SELECT started FROM enrollment_lifecycle')) {
        return [[{ started: false }]]
      }
      if (sql.includes('SELECT * FROM enrollment_semesters WHERE semester_id=?')) {
        return [[{
          semester_id: 5,
          academic_year: '2026-2027',
          term_name: '1st Semester',
          started_at: null,
          ended_at: null,
          manual_end_at: new Date('2027-03-01T00:00:00.000Z'),
          scheduled_end_at: new Date('2027-03-01T00:00:00.000Z'),
        }]]
      }
      if (sql.includes('FROM enrollment_semesters WHERE started_at IS NOT NULL')) {
        return [[]]
      }
      if (sql.includes('FROM enrollment_roster_imports WHERE semester_id=?') && sql.includes('complete')) {
        // Faculty roster is complete, but Student roster is NOT complete
        if (params.includes('Faculty') && !sql.includes("roster_role='Student'")) return [[{ ok: 1 }]]
        return [[]]
      }
      return [[]]
    },
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }
  const facultyService = createEnrollmentService({ getConnection: async () => connection } as never, () => true, 'Faculty')
  await facultyService.qrRoster(1, 5, 1, '', '')
  const qrQuery = queries.find(q => q.sql.includes('LEFT JOIN accounts a ON a.school_id=r.school_id'))
  assert.ok(qrQuery, 'Expected qrRoster query')
  assert.ok(
    !qrQuery.sql.includes("a.role='Student'"),
    `Expected Faculty qrRoster not to hardcode a.role='Student': ${qrQuery.sql}`,
  )

  await assert.rejects(
    facultyService.start(1, 5),
    (err: unknown) => err instanceof HttpError && err.status === 422,
    'Starting semester from Faculty view without a complete Student roster must be rejected',
  )
})

test('MED-12 & MED-19 & LOW: research-catalog handles Postgres 42703/42P01, enrollment-parser accepts hyperlinked email cells, and invoice configure validates serial range when unapproved', async () => {
  // MED-12: Postgres 42703 falls back to legacy query instead of throwing 500
  let callCount = 0
  const dbStub = {
    execute: async () => {
      callCount++
      if (callCount === 1) {
        const err = new Error('column rr.department_or_program does not exist') as Error & { code: string }
        err.code = '42703'
        throw err
      }
      return [[]]
    },
  }
  const detail = await queryResearchOverview(dbStub as never, 10)
  assert.equal(detail, null)
  assert.equal(callCount, 2)

  // MED-19: ExcelJS hyperlinked email cell
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Roster')
  ws.addRow(['Student ID', 'Full Name', 'Program', 'Year Level', 'Institutional Email', 'Status'])
  const row = ws.addRow(['02000123456', 'Juan Dela Cruz', 'BSIT', '1st Year', { text: 'juan.delacruz@ormoc.sti.edu.ph', hyperlink: 'mailto:juan.delacruz@ormoc.sti.edu.ph' }, 'Enrolled'])
  assert.ok(row)
  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  const parsed = await parseEnrollmentFile(
    { buffer, originalname: 'roster.xlsx' },
    { academicYear: '2026-2027', termName: '1st Semester', listedEnrolled: true, role: 'Student' },
  )
  assert.equal(parsed.errors, 0)
  assert.equal(parsed.rows[0]?.data.email, 'juan.delacruz@ormoc.sti.edu.ph')

  // LOW: invoice configure rejects NaN/negative serials even when approved=false
  const invoiceService = createInvoiceService({ getConnection: async () => ({}) } as never, false)
  await assert.rejects(
    invoiceService.configure({
      issuerName: 'STI',
      issuerAddress: 'Ormoc',
      issuerTin: '123',
      authorityReference: 'ATP-1',
      serialPrefix: 'INV',
      serialStart: -5,
      serialEnd: -10,
      approved: false,
      printClassification: 'Exempt',
      fineClassification: 'Exempt',
    }),
    (err: unknown) => err instanceof HttpError && err.status === 422,
  )
})
