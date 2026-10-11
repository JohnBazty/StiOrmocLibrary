import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import { env } from '../src/config/env.js'
import { db } from '../src/config/db.js'
import { createRenewalService } from '../src/modules/circulation/renewal.service.ts'

if (env.db.driver !== 'postgres') {
  console.error('smoke:renewal requires env.db.driver === "postgres" (set DATABASE_URL).')
  process.exit(1)
}

const suffix = randomBytes(6).toString('hex')
const schoolId = `RNW${suffix.toUpperCase()}`
const email = `${schoolId.toLowerCase()}@example.invalid`
const barcode = `RNW-BC-${suffix}`
const accession = `RNW-ACC-${suffix}`
const passwordHash = await bcrypt.hash(`Smoke-${suffix}!`, 10)

/** @type {number | null} */
let userId = null
/** @type {number | null} */
let accountId = null
/** @type {number | null} */
let titleId = null
/** @type {number | null} */
let materialId = null
/** @type {number | null} */
let physicalCopyId = null
/** @type {number | null} */
let transactionId = null

function expect(condition, label) {
  if (!condition) throw new Error(`Failed: ${label}`)
  console.log(`PASS ${label}`)
}

function manilaTomorrowDue() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const read = (type) => Number(parts.find((part) => part.type === type)?.value)
  const base = new Date(Date.UTC(read('year'), read('month') - 1, read('day')))
  base.setUTCDate(base.getUTCDate() + 1)
  const year = base.getUTCFullYear()
  const month = String(base.getUTCMonth() + 1).padStart(2, '0')
  const day = String(base.getUTCDate()).padStart(2, '0')
  return new Date(`${year}-${month}-${day}T08:59:00+08:00`)
}

async function cleanup() {
  if (!userId && !accountId && !transactionId && !physicalCopyId && !materialId && !titleId) return
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    if (transactionId) {
      await connection.execute('DELETE FROM loan_renewal_requests WHERE transaction_id = ?', [transactionId])
      await connection.execute(
        "DELETE FROM notifications WHERE source_type = 'Borrow Transaction' AND source_id = ?",
        [transactionId],
      )
      await connection.execute('DELETE FROM borrow_transactions WHERE transaction_id = ?', [transactionId])
    }
    if (userId) {
      await connection.execute('DELETE FROM notifications WHERE user_id = ?', [userId])
    }
    if (physicalCopyId) {
      await connection.execute('DELETE FROM physical_copies WHERE physical_copy_id = ?', [physicalCopyId])
    }
    if (materialId) {
      await connection.execute('DELETE FROM materials WHERE material_id = ?', [materialId])
    }
    if (titleId) {
      await connection.execute('DELETE FROM authors WHERE title_id = ?', [titleId])
      await connection.execute('DELETE FROM titles WHERE title_id = ?', [titleId])
    }
    if (accountId) {
      await connection.execute('DELETE FROM student_profiles WHERE account_id = ?', [accountId])
      await connection.execute('UPDATE accounts SET user_id = NULL WHERE account_id = ?', [accountId])
      await connection.execute('DELETE FROM accounts WHERE account_id = ?', [accountId])
    }
    if (userId) {
      await connection.execute('DELETE FROM users WHERE user_id = ?', [userId])
    }
    await connection.commit()
    console.log('Disposable renewal fixtures removed')
  } catch (error) {
    await connection.rollback()
    console.error('Disposable renewal cleanup failed', {
      userId,
      accountId,
      titleId,
      materialId,
      physicalCopyId,
      transactionId,
    })
    throw error
  } finally {
    connection.release()
  }
}

try {
  const [roleRows] = await db.execute("SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1", [])
  expect(Array.isArray(roleRows) && roleRows[0]?.role_id, 'Student role exists')

  const [categoryRows] = await db.execute(
    'SELECT category_id FROM categories ORDER BY category_id ASC LIMIT 1',
    [],
  )
  expect(Array.isArray(categoryRows) && categoryRows[0]?.category_id, 'category exists')

  const [policyRows] = await db.execute(
    `SELECT borrowing_policy_version_id, max_renewals
       FROM borrowing_policy_versions
      WHERE effective_on <= CURRENT_DATE
      ORDER BY effective_on DESC, borrowing_policy_version_id DESC
      LIMIT 1`,
    [],
  )
  expect(Array.isArray(policyRows) && policyRows[0]?.borrowing_policy_version_id, 'active borrowing policy exists')
  const policyVersionId = Number(policyRows[0].borrowing_policy_version_id)
  const maxRenewals = Number(policyRows[0].max_renewals)
  expect(maxRenewals === 1, `active policy max_renewals is 1 (got ${maxRenewals})`)

  const [userInsert] = await db.execute(
    `INSERT INTO users
       (role_id, user_role, institutional_id, school_id, full_name, email, password_hash,
        educational_level, course_or_strand, account_status)
     VALUES (?, 'Student', ?, ?, 'Renewal Smoke Student', ?, ?, 'College', 'BS Information Technology', 'Active')`,
    [roleRows[0].role_id, schoolId, schoolId, email, passwordHash],
  )
  userId = Number(userInsert.insertId)
  expect(userId > 0, 'disposable student user created')

  const [accountInsert] = await db.execute(
    `INSERT INTO accounts
       (user_id, school_id, contact_number, password_hash, role, account_status)
     VALUES (?, ?, '09123456789', ?, 'Student', 'Active')`,
    [userId, schoolId, passwordHash],
  )
  accountId = Number(accountInsert.insertId)
  expect(accountId > 0, 'disposable student account created')

  await db.execute(
    `INSERT INTO student_profiles
       (account_id, first_name, last_name, program_strand, year_grade_level)
     VALUES (?, 'Renewal', 'Smoke Student', 'BS Information Technology', '4th Year')`,
    [accountId],
  )

  const titleText = `Renewal Smoke Title ${suffix}`
  const [titleInsert] = await db.execute(
    `INSERT INTO titles
       (category_id, record_type, title, normalized_title, isbn, publication_year,
        publisher, call_number, search_text, lifecycle_status, created_at)
     VALUES (?, 'Book', ?, ?, NULL, 2026, 'Smoke Press', ?, ?, 'Active', NOW())`,
    [
      categoryRows[0].category_id,
      titleText,
      titleText.toLocaleLowerCase('en-US'),
      `RNW ${suffix}`,
      titleText.toLocaleLowerCase('en-US'),
    ],
  )
  titleId = Number(titleInsert.insertId)
  expect(titleId > 0, 'disposable title created')

  const [materialInsert] = await db.execute(
    `INSERT INTO materials
       (category_id, barcode, title, author, isbn, publication_year, shelf_location,
        material_type, availability_status, date_added)
     VALUES (?, ?, ?, 'Smoke Author', NULL, 2026, 'Smoke Shelf', 'Book', 'Borrowed', NOW())`,
    [categoryRows[0].category_id, barcode, titleText],
  )
  materialId = Number(materialInsert.insertId)
  expect(materialId > 0, 'disposable material created')

  const [copyInsert] = await db.execute(
    `INSERT INTO physical_copies
       (title_id, material_id, barcode, accession_number, shelf_location,
        condition_status, availability_status, lifecycle_status, created_at)
     VALUES (?, ?, ?, ?, 'Smoke Shelf', 'Good', 'Borrowed', 'Active', NOW())`,
    [titleId, materialId, barcode, accession],
  )
  physicalCopyId = Number(copyInsert.insertId)
  expect(physicalCopyId > 0, 'disposable physical copy created')

  const dueAt = manilaTomorrowDue()
  const borrowedAt = new Date(dueAt.getTime() - 24 * 60 * 60 * 1000)
  const [loanInsert] = await db.execute(
    `INSERT INTO borrow_transactions
       (user_id, material_id, physical_copy_id, borrowing_policy_version_id, processed_by_user_id,
        borrowed_at, due_at, initial_due_at, renewal_count, transaction_status, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 0, 'Borrowed', NOW())`,
    [userId, materialId, physicalCopyId, policyVersionId, borrowedAt, dueAt, dueAt],
  )
  transactionId = Number(loanInsert.insertId)
  expect(transactionId > 0, 'disposable borrowed loan created')

  const renewalService = createRenewalService(db)
  const actor = { accountId, role: 'Student' }

  const approved = await renewalService.submit(transactionId, actor, {
    requestKey: `smoke-renewal-approve-${suffix}`,
  })
  expect(approved.status === 'Approved', 'first renewal is Approved')
  expect(approved.decisionCode === 'RENEWAL_APPROVED', 'first renewal decision code is RENEWAL_APPROVED')
  expect(approved.renewalNumber === 1, 'first renewal number is 1')
  expect(approved.newDueAt != null, 'first renewal sets a new due date')

  const [loanRows] = await db.execute(
    'SELECT renewal_count, due_at, initial_due_at FROM borrow_transactions WHERE transaction_id = ? LIMIT 1',
    [transactionId],
  )
  expect(Number(loanRows[0]?.renewal_count) === 1, 'loan renewal_count is 1 after approval')
  expect(new Date(loanRows[0].due_at).getTime() > dueAt.getTime(), 'loan due_at moved forward')
  expect(
    new Date(loanRows[0].initial_due_at).getTime() === dueAt.getTime(),
    'initial_due_at preserved after approval',
  )

  const [decisionRows] = await db.execute(
    `SELECT status, decision_code FROM loan_renewal_requests
      WHERE transaction_id = ? AND status = 'Approved' ORDER BY renewal_request_id DESC LIMIT 1`,
    [transactionId],
  )
  expect(decisionRows[0]?.decision_code === 'RENEWAL_APPROVED', 'approved renewal row persisted')

  const [notificationRows] = await db.execute(
    `SELECT dedupe_key FROM notifications
      WHERE user_id = ? AND dedupe_key LIKE ? LIMIT 1`,
    [userId, `loan:${transactionId}:renewal:1:approved:%`],
  )
  expect(notificationRows[0]?.dedupe_key, 'approval notification uses renewal sequence key')

  const rejected = await renewalService.submit(transactionId, actor, {
    requestKey: `smoke-renewal-reject-${suffix}`,
  })
  expect(rejected.status === 'Rejected', 'second renewal is Rejected')
  expect(
    rejected.decisionCode === 'RENEWAL_LIMIT_REACHED',
    'second renewal decision code is RENEWAL_LIMIT_REACHED',
  )
  expect(
    Array.isArray(rejected.blockers)
      && rejected.blockers.some((item) => item.code === 'RENEWAL_LIMIT_REACHED'),
    'second renewal blockers include RENEWAL_LIMIT_REACHED',
  )

  const [afterReject] = await db.execute(
    'SELECT renewal_count FROM borrow_transactions WHERE transaction_id = ? LIMIT 1',
    [transactionId],
  )
  expect(Number(afterReject[0]?.renewal_count) === 1, 'loan renewal_count stays 1 after rejection')

  const [rejectedRows] = await db.execute(
    `SELECT status, decision_code FROM loan_renewal_requests
      WHERE transaction_id = ? AND status = 'Rejected' ORDER BY renewal_request_id DESC LIMIT 1`,
    [transactionId],
  )
  expect(rejectedRows[0]?.decision_code === 'RENEWAL_LIMIT_REACHED', 'rejected renewal row persisted')

  console.log('Renewal management smoke acceptance passed')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  try {
    await cleanup()
  } catch (cleanupError) {
    console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError)
    process.exitCode = 1
  }
  await db.end()
}
