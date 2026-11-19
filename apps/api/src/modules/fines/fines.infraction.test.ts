import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { createFinesService } from './fines.service.ts'
import { validateInfraction } from './fines.validation.ts'

const librarian = { accountId: 1, role: 'Librarian' }
const body = (category: string, amount: number, accessionNumber?: string) => ({
  schoolId: 'STI-0001', category, amount, incidentAt: '2026-11-19T10:00:00+08:00',
  details: 'Water damage on the cover and pages.', ...(accessionNumber ? { accessionNumber } : {}),
})

function finesPool(role: string, price: number | null, seen: { fines: number; notes: string[] }) {
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql: string, values: unknown[] = []) {
      if (sql.includes('FROM accounts')) return [[{ user_id: 2 }]]
      if (sql.includes('FROM users WHERE school_id')) return [[{ user_id: 9, full_name: 'Borrower', user_role: role }]]
      if (sql.includes('FROM physical_copies')) return [values[0] === 'ACC-404' ? [] : [{ physical_copy_id: 20, price }]]
      if (sql.includes('INSERT INTO fines')) { seen.fines += 1; seen.notes.push(String(values.at(-1))); return [{ insertId: 77, affectedRows: 1 }] }
      if (sql.trimStart().startsWith('SELECT')) return [[{}]]
      return [{ affectedRows: 1, insertId: 1 }]
    },
  }
  return { getConnection: async () => connection, execute: connection.execute.bind(connection) } as unknown as Pool
}
const code = (expected: string) => (error: unknown) => error instanceof HttpError && error.code === expected

test('a damaged-book fine needs an accession number', () => {
  assert.throws(() => validateInfraction(body('Damaged book', 200)), code('FINE_ACCESSION_REQUIRED'))
  assert.equal(validateInfraction(body('Damaged book', 200, 'ACC-20')).accessionNumber, 'ACC-20')
  assert.equal(validateInfraction(body('Noise violation', 50)).accessionNumber, null)
})

test('faculty cannot be given a fine other than a damaged book', async () => {
  const seen = { fines: 0, notes: [] as string[] }
  await assert.rejects(createFinesService(finesPool('Faculty', 350, seen)).issueInfraction(librarian, body('Noise violation', 50)), code('FINE_FACULTY_DAMAGE_ONLY'))
  assert.equal(seen.fines, 0)
})

test('faculty damaged-book fine up to the copy price is accepted and names the copy', async () => {
  const seen = { fines: 0, notes: [] as string[] }
  await createFinesService(finesPool('Faculty', 350, seen)).issueInfraction(librarian, body('Damaged book', 200, 'ACC-20'))
  assert.equal(seen.fines, 1)
  assert.match(seen.notes[0], /ACC-20/)
})

test('a damaged-book fine above the copy price is refused', async () => {
  const seen = { fines: 0, notes: [] as string[] }
  await assert.rejects(createFinesService(finesPool('Faculty', 350, seen)).issueInfraction(librarian, body('Damaged book', 400, 'ACC-20')), code('FINE_DAMAGE_OVER_PRICE'))
  assert.equal(seen.fines, 0)
})

test('a damaged-book fine for an unknown accession number is refused', async () => {
  const seen = { fines: 0, notes: [] as string[] }
  await assert.rejects(createFinesService(finesPool('Student', 350, seen)).issueInfraction(librarian, body('Damaged book', 100, 'ACC-404')), code('FINE_COPY_NOT_FOUND'))
})

test('a copy without a recorded price accepts the entered amount', async () => {
  const seen = { fines: 0, notes: [] as string[] }
  await createFinesService(finesPool('Faculty', null, seen)).issueInfraction(librarian, body('Damaged book', 900, 'ACC-20'))
  assert.equal(seen.fines, 1)
})

test('students keep every fine category', async () => {
  const seen = { fines: 0, notes: [] as string[] }
  await createFinesService(finesPool('Student', 350, seen)).issueInfraction(librarian, body('Noise violation', 50))
  assert.equal(seen.fines, 1)
})
