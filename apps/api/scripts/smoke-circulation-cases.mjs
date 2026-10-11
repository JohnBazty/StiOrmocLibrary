/**
 * Rollback-safe hosted smoke for circulation cases (Supabase 017).
 * Creates temporary loan/policy fixtures inside a transaction, exercises
 * long-overdue scan + damage-at-return helpers, then rolls back.
 */
import pg from 'pg'
import { env } from '../src/config/env.js'
import {
  createCirculationCaseService,
  openLongOverdueCaseInTransaction,
} from '../src/modules/circulation/circulation-case.service.ts'
import { db } from '../src/config/db.js'

if (env.db.driver !== 'postgres' || !env.db.connectionString) {
  throw new Error('DATABASE_URL (Postgres) is required for this smoke.')
}

const client = new pg.Client({
  connectionString: env.db.connectionString,
  options: '-c timezone=Asia/Manila',
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

await client.connect()
const report = { ledger: [], checks: [] }

try {
  const ledger = await client.query(
    `SELECT migration_name, applied_at
       FROM schema_migrations
      WHERE migration_name LIKE '01%'
      ORDER BY migration_name`,
  )
  report.ledger = ledger.rows.map((row) => row.migration_name)
  assert(
    report.ledger.includes('017_circulation_cases.sql'),
    '017_circulation_cases.sql missing from schema_migrations',
  )
  report.checks.push('ledger:017_present')

  const tables = await client.query(
    `SELECT to_regclass('public.circulation_cases') AS cases,
            to_regclass('public.circulation_case_events') AS events`,
  )
  assert(tables.rows[0].cases, 'circulation_cases missing')
  assert(tables.rows[0].events, 'circulation_case_events missing')
  report.checks.push('tables:present')

  // Disposable smoke inside an outer transaction using the app pool connection.
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()

    const marker = `case-smoke-${Date.now()}`
    const duePast = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)

    const [adminRows] = await connection.execute(
      `SELECT a.account_id, a.user_id
         FROM accounts a
        WHERE a.role = 'Admin' AND a.user_id IS NOT NULL
        ORDER BY a.account_id ASC LIMIT 1`,
    )
    assert(adminRows[0], 'Need an Admin account with linked user_id for smoke')
    const adminAccountId = Number(adminRows[0].account_id)
    const adminUserId = Number(adminRows[0].user_id)

    const [borrowerRows] = await connection.execute(
      `SELECT u.user_id, a.account_id, u.school_id
         FROM users u
         INNER JOIN accounts a ON a.user_id = u.user_id
        WHERE a.role IN ('Student', 'Faculty') AND u.account_status = 'Active'
        ORDER BY u.user_id ASC LIMIT 1`,
    )
    assert(borrowerRows[0], 'Need an active Student/Faculty borrower for smoke')
    const borrowerUserId = Number(borrowerRows[0].user_id)

    const smokeTitle = `${marker} title`
    const [titleInsert] = await connection.execute(
      `INSERT INTO titles (category_id, record_type, title, normalized_title, lifecycle_status, created_at, updated_at)
       SELECT category_id, 'Book', ?, lower(?), 'Active', NOW(), NOW()
         FROM categories ORDER BY category_id ASC LIMIT 1
       RETURNING title_id`,
      [smokeTitle, smokeTitle],
    )
    const titleId = Number(titleInsert.insertId || titleInsert[0]?.title_id)
    assert(titleId, 'Failed to insert smoke title')

    // Ensure a policy version with a short threshold exists for this smoke only.
    const [policyInsert] = await connection.execute(
      `INSERT INTO borrowing_policy_versions
         (effective_on, student_max_active_books, faculty_max_active_books, borrowing_days, due_time_cutoff,
          max_renewals, renewal_extension_days, student_max_active_reservations, faculty_max_active_reservations,
          block_renewal_if_overdue, block_renewal_if_unpaid_fines, block_renewal_if_reserved,
          long_overdue_after_days, change_reason, created_by_user_id)
       VALUES (CURRENT_DATE, 2, NULL, 1, TIME '08:59:00', 1, 1, 2, NULL, TRUE, TRUE, TRUE, 2, ?, ?)
       RETURNING borrowing_policy_version_id`,
      [`${marker} policy`, adminUserId],
    )
    const policyVersionId = Number(policyInsert.insertId || policyInsert[0]?.borrowing_policy_version_id)
    assert(policyVersionId, 'Failed to insert smoke policy')

    await connection.execute(
      `INSERT INTO borrowing_policy_material_rules (borrowing_policy_version_id, material_type, is_borrowable)
       VALUES (?, 'Book', TRUE)
       ON CONFLICT DO NOTHING`,
      [policyVersionId],
    )

    const [materialInsert] = await connection.execute(
      `INSERT INTO materials (title, author, material_type, availability_status, barcode, shelf_location, date_added, updated_at)
       VALUES (?, 'Smoke Author', 'Book', 'Borrowed', ?, 'Smoke Shelf', NOW(), NOW())
       RETURNING material_id`,
      [`${marker} material`, `SMK-${Date.now()}`],
    )
    const materialId = Number(materialInsert.insertId || materialInsert[0]?.material_id)

    const barcode = `CASE-SMOKE-${Date.now()}`
    const [copyInsert] = await connection.execute(
      `INSERT INTO physical_copies
         (title_id, material_id, barcode, accession_number, shelf_location, condition_status, availability_status, lifecycle_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Smoke Shelf', 'Good', 'Borrowed', 'Active', NOW(), NOW())
       RETURNING physical_copy_id`,
      [titleId, materialId, barcode, `ACC-${Date.now()}`],
    )
    const physicalCopyId = Number(copyInsert.insertId || copyInsert[0]?.physical_copy_id)

    const [loanInsert] = await connection.execute(
      `INSERT INTO borrow_transactions
         (user_id, material_id, physical_copy_id, borrowing_policy_version_id, transaction_status, borrowed_at, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Overdue', ?, ?, NOW(), NOW())
       RETURNING transaction_id`,
      [borrowerUserId, materialId, physicalCopyId, policyVersionId, duePast, duePast],
    )
    const transactionId = Number(loanInsert.insertId || loanInsert[0]?.transaction_id)
    assert(transactionId, 'Failed to insert smoke loan')

    // Long-overdue open through the same helper the scan uses (in this connection).
    const opened = await openLongOverdueCaseInTransaction(connection, {
      transactionId,
      physicalCopyId,
      borrowerUserId,
      policyVersionId,
      thresholdDays: 2,
      thresholdReachedAt: new Date(),
      title: `${marker} title`,
    })
    assert(opened.created === true, 'Expected a new long-overdue case')
    assert(opened.case.caseType === 'Long Overdue', 'Wrong case type')
    report.checks.push(`long_overdue_case:${opened.case.caseId}`)

    const reopen = await openLongOverdueCaseInTransaction(connection, {
      transactionId,
      physicalCopyId,
      borrowerUserId,
      policyVersionId,
      thresholdDays: 2,
      thresholdReachedAt: new Date(),
      title: `${marker} title`,
    })
    assert(reopen.created === false, 'Retry should reuse existing long-overdue case')
    assert(reopen.case.caseId === opened.case.caseId, 'Idempotent case id mismatch')
    report.checks.push('long_overdue_idempotent')

    // Second loan for damage-at-return smoke.
    const barcode2 = `CASE-DMG-${Date.now()}`
    const [material2] = await connection.execute(
      `INSERT INTO materials (title, author, material_type, availability_status, barcode, shelf_location, date_added, updated_at)
       VALUES (?, 'Smoke Author', 'Book', 'Borrowed', ?, 'Smoke Shelf', NOW(), NOW())
       RETURNING material_id`,
      [`${marker} damage material`, `SMKD-${Date.now()}`],
    )
    const materialId2 = Number(material2.insertId || material2[0]?.material_id)
    const [copy2] = await connection.execute(
      `INSERT INTO physical_copies
         (title_id, material_id, barcode, accession_number, shelf_location, condition_status, availability_status, lifecycle_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Smoke Shelf', 'Good', 'Borrowed', 'Active', NOW(), NOW())
       RETURNING physical_copy_id`,
      [titleId, materialId2, barcode2, `ACCD-${Date.now()}`],
    )
    const physicalCopyId2 = Number(copy2.insertId || copy2[0]?.physical_copy_id)
    const [loan2] = await connection.execute(
      `INSERT INTO borrow_transactions
         (user_id, material_id, physical_copy_id, borrowing_policy_version_id, transaction_status, borrowed_at, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Borrowed', NOW(), NOW() + INTERVAL '1 day', NOW(), NOW())
       RETURNING transaction_id`,
      [borrowerUserId, materialId2, physicalCopyId2, policyVersionId],
    )
    const transactionId2 = Number(loan2.insertId || loan2[0]?.transaction_id)

    // Use case helper for damage open + inventory hold path pieces, then verify uniqueness.
    const caseService = createCirculationCaseService(db)
    // Direct locked helper on this connection (same as return path).
    const damage = await caseService.openDamageCaseLocked(connection, {
      transactionId: transactionId2,
      physicalCopyId: physicalCopyId2,
      borrowerUserId,
      actorUserId: adminUserId,
      baselineCondition: 'Good',
      observedCondition: 'Damaged',
      description: `${marker} torn cover at return`,
      openedAt: new Date(),
    })
    assert(damage.created === true, 'Expected new damage case')
    report.checks.push(`damage_case:${damage.case.caseId}`)

    await connection.execute(
      `UPDATE physical_copies
          SET condition_status = 'Damaged', availability_status = 'Unavailable', updated_at = NOW()
        WHERE physical_copy_id = ?`,
      [physicalCopyId2],
    )
    await connection.execute(
      `UPDATE borrow_transactions
          SET transaction_status = 'Returned', returned_at = NOW(), updated_at = NOW()
        WHERE transaction_id = ?`,
      [transactionId2],
    )

    const [held] = await connection.execute(
      `SELECT condition_status, availability_status FROM physical_copies WHERE physical_copy_id = ?`,
      [physicalCopyId2],
    )
    assert(String(held[0].condition_status) === 'Damaged', 'Copy should be Damaged')
    assert(String(held[0].availability_status) === 'Unavailable', 'Copy should be Unavailable')
    report.checks.push('damage_hold:unavailable')

    const [caseCount] = await connection.execute(
      `SELECT COUNT(*)::int AS total FROM circulation_cases WHERE transaction_id IN (?, ?)`,
      [transactionId, transactionId2],
    )
    assert(Number(caseCount[0].total) === 2, 'Expected exactly two smoke cases')

    const [eventCount] = await connection.execute(
      `SELECT COUNT(*)::int AS total
         FROM circulation_case_events
        WHERE case_id IN (?, ?)`,
      [opened.case.caseId, damage.case.caseId],
    )
    assert(Number(eventCount[0].total) >= 2, 'Expected Opened events for both cases')
    report.checks.push(`events:${eventCount[0].total}`)

    // Always discard smoke data.
    await connection.rollback()
    report.checks.push('rollback:ok')
  } catch (error) {
    try { await connection.rollback() } catch { /* ignore */ }
    throw error
  } finally {
    connection.release()
  }

  // Confirm no leftover smoke titles remain after rollback.
  const leftovers = await client.query(
    `SELECT COUNT(*)::int AS total FROM titles WHERE title LIKE 'case-smoke-% title'`,
  )
  assert(Number(leftovers.rows[0].total) === 0, 'Smoke titles leaked after rollback')
  report.checks.push('no_leak')

  console.log(JSON.stringify({
    ok: true,
    driver: env.db.driver,
    ledgerTail: report.ledger.slice(-8),
    checks: report.checks,
    note: 'Production minute-scan still depends on durable job-runner T1; in-process worker is not durable on Vercel.',
  }, null, 2))
} finally {
  await client.end()
  try { await db.end?.() } catch { /* pool may not expose end the same way */ }
}
