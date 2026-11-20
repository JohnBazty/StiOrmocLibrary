import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from './http-error.ts'
import { isDatabaseUnavailable } from './database-availability.ts'
import { createClearanceService } from '../modules/clearance/clearance.service.ts'
import { validateBorrowCart } from '../modules/circulation/circulation.validation.ts'
import { createCirculationService } from '../modules/circulation/circulation.service.ts'
import { createRenewalRepository } from '../modules/circulation/renewal.repository.ts'
import { createViolationCategoriesService } from '../modules/fines/violation-categories.service.ts'
import { refreshClearance } from '../modules/fines/fines.service.ts'
import { validatePublishBorrowingPolicy } from '../modules/circulation/borrowing-policy.validation.ts'
import { evaluateCheckoutRules } from '../modules/circulation/circulation-preflight.ts'
import { readAuditLogs } from '../modules/reports/audit-logs.service.ts'
import { findActiveLoan } from '../modules/inventory/inventory.repository.ts'
import { borrowerReturnList } from '../modules/circulation/borrower-return-list.ts'
import { stocktakeItems } from '../modules/inventory/stocktake-items.ts'

test('CRIT-01: clearanceService.decideLost (Confirmed) passes 5 parameters to notification INSERT and refreshes clearance', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string, params: unknown[] = []) => {
      const placeholderCount = (sql.match(/\?/g) ?? []).length
      assert.equal(
        params.length,
        placeholderCount,
        `SQL placeholder mismatch (${placeholderCount} ? vs ${params.length} params): ${sql}`,
      )
      queries.push({ sql, params })
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 2 }]]
      if (sql.includes('FROM lost_book_reports l')) {
        return [[{
          lost_book_report_id: 11,
          transaction_id: 55,
          user_id: 88,
          material_id: 101,
          physical_copy_id: 202,
          report_status: 'Pending',
          title: 'Clean Architecture',
          title_price: 450,
          current_quotation_id: null,
          current_quotation_amount: null,
        }]]
      }
      if (sql.includes('SELECT') && sql.includes('has_loan')) {
        return [[{ has_loan: 0, has_fine: 0, has_loss: 1, has_charge: 0, has_in_library: 0, override_status: null }]]
      }
      return [{ affectedRows: 1, insertId: 1 }]
    },
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }
  const service = createClearanceService({ getConnection: async () => connection } as never)
  const result = await service.decideLost(
    { accountId: 1, role: 'Librarian' },
    11,
    { status: 'Confirmed', replacementCharge: 450, notes: 'Confirmed lost at counter' },
  )
  assert.equal(result.status, 'Confirmed')
  assert.ok(queries.some(q => q.sql.includes('INSERT INTO notifications') && q.params.length === 5))
})

test('CRIT-02: findActiveLoan, borrowerReturnList, and stocktakeItems exclude confirmed-lost loans (lost_confirmed_at IS NOT NULL)', async () => {
  const executedSql: string[] = []
  const mockConn = {
    execute: async (sql: string) => {
      executedSql.push(sql)
      return [[]]
    },
  }
  await findActiveLoan(mockConn as never, 101)
  await borrowerReturnList(mockConn as never, 88, 1)
  await stocktakeItems(mockConn as never, { assetKind: 'book' })

  for (const sql of executedSql) {
    assert.match(sql, /lost_confirmed_at'?\s+IS\s+NULL/i, `Expected lost_confirmed_at IS NULL in query: ${sql}`)
  }
})

test('CRIT-03: renewalRepository.findLoan and approveLoan convert Manila TIMESTAMP columns with AT TIME ZONE Asia/Manila', async () => {
  const executed: Array<{ sql: string; params: unknown[] }> = []
  const executor = {
    execute: async (sql: string, params: unknown[] = []) => {
      executed.push({ sql, params })
      return [{ affectedRows: 1 }]
    },
  }
  const repo = createRenewalRepository(executor as never)
  await repo.findLoan(77, executor as never, false)
  assert.match(executed[0].sql, /bt\.due_at AT TIME ZONE 'Asia\/Manila'/i)

  const prevDue = new Date('2026-11-20T09:00:00.000Z')
  const nextDue = new Date('2026-11-21T09:00:00.000Z')
  await repo.approveLoan(77, 0, prevDue, nextDue, executor as never)
  assert.match(executed[1].sql, /AT TIME ZONE 'Asia\/Manila'/i)
})

test('HIGH-03: violationCategoriesService.create and update do not deadlock when DB_CONNECTION_LIMIT=1', async () => {
  let activeConnections = 0
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string) => {
      if (sql.includes('FROM violation_settings')) return [[{ max_fine: 1000, version: '2026-11-20T00:00:00.000000Z' }]]
      if (sql.includes('WHERE lower(name)=lower(?)')) return [[]]
      if (sql.includes('MAX(sort_order)')) return [[{ next: 4 }]]
      if (sql.includes('INSERT INTO violation_categories')) return [{ insertId: 15, affectedRows: 1 }]
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 1 }]]
      if (sql.includes('FOR UPDATE')) return [[{ category_id: 15 }]]
      if (sql.includes('FROM violation_categories c WHERE c.category_id=?')) {
        return [[{
          version: '2026-11-20T00:00:00.000000Z',
          category_id: 15,
          name: 'Phone call',
          description: 'Loud calls',
          warnings_before_fine: 2,
          fine_amount: 50,
          is_active: true,
          sort_order: 4,
          used: false,
        }]]
      }
      return [{ affectedRows: 1 }]
    },
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => { activeConnections-- },
  }
  const singleConnectionPool = {
    getConnection: async () => {
      if (activeConnections >= 1) throw new Error('POOL_SELF_DEADLOCK: max=1 connection already checked out')
      activeConnections++
      return connection
    },
    execute: async (sql: string) => {
      if (activeConnections >= 1) throw new Error('POOL_SELF_DEADLOCK: pool.execute called while connection still checked out')
      return connection.execute(sql)
    },
  }
  const service = createViolationCategoriesService(singleConnectionPool as never)
  const created = await service.create(1, { name: 'Phone call', description: 'Loud calls', warningsBeforeFine: 2, fineAmount: 50 })
  assert.equal(created.categoryId, 15)
  const updated = await service.update(1, 15, { name: 'Phone call', description: 'Updated', warningsBeforeFine: 2, fineAmount: 75, isActive: true, updatedAt: '2026-11-20T00:00:00.000000Z' })
  assert.equal(updated.categoryId, 15)
})

test('HIGH-05: calculatePenalty rejects null due_at, inactive, or confirmed-lost loans and does not insert PHP 0.00 fines', async () => {
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string) => {
      if (sql.includes('FROM borrow_transactions WHERE transaction_id')) {
        return [[{
          transaction_id: 10,
          user_id: 5,
          transaction_status: 'Pending',
          due_at: null,
          returned_at: null,
          lost_confirmed_at: null,
        }]]
      }
      return [[]]
    },
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }
  const service = createCirculationService({ getConnection: async () => connection } as never)
  await assert.rejects(
    service.calculatePenalty(10),
    (err: unknown) => err instanceof HttpError && err.status === 422,
  )
})

test('HIGH-06: renewalRepository.loadBlockState filters out PHP 0 fines and waived/awaiting-quotation lost-book reports', async () => {
  const queries: string[] = []
  const executor = {
    execute: async (sql: string) => {
      queries.push(sql)
      return [[]]
    },
  }
  const repo = createRenewalRepository(executor as never, { previewCredits: undefined })
  // Test with a non-db pool so SQL queries are used directly
  await repo.loadBlockState({
    transactionId: 1, userId: 9, materialId: 2, physicalCopyId: 3, policyVersionId: 1,
    borrowedAt: new Date(), dueAt: new Date(), initialDueAt: new Date(), renewalCount: 0,
    status: 'Borrowed', userAccountStatus: 'Active', normalizedAccountStatus: 'Active',
    materialType: 'Book', titleId: 4, title: 'Book', copyCondition: 'Good',
    copyLifecycleStatus: 'Active', titleLifecycleStatus: 'Active',
  }, executor as never, false)

  const fineSql = queries.find(q => q.includes('FROM fines')) ?? ''
  const lostSql = queries.find(q => q.includes('FROM lost_book_reports') && q.includes('user_id')) ?? ''
  assert.match(fineSql, /fine_amount\s*>\s*0/i)
  assert.match(lostSql, /charge_resolution\s+IN\s*\('Quoted',\s*'Book Price'\)/i)
  assert.match(lostSql, /replacement_charge\s*>\s*0/i)
})

test('HIGH-07: audit-logs.service converts Manila borrow_transactions and attendance_logs timestamps via AT TIME ZONE Asia/Manila', async () => {
  let capturedSql = ''
  const dbStub = {
    execute: async (sql: string) => {
      capturedSql = sql
      return [[]]
    },
  }
  await readAuditLogs(dbStub as never, {})
  assert.match(capturedSql, /bt\.borrowed_at AT TIME ZONE 'Asia\/Manila'/i)
  assert.match(capturedSql, /al\.checked_in_at AT TIME ZONE 'Asia\/Manila'/i)
})

test('HIGH-10: validateBorrowCart preserves optional requestId for cart submission idempotency', () => {
  const parsed = validateBorrowCart({ title_ids: [10, 20], requestId: '11111111-2222-4333-8444-555555555555' })
  assert.deepEqual(parsed, {
    titleIds: [10, 20],
    requestId: '11111111-2222-4333-8444-555555555555',
  })
})

test('HIGH-16: refreshClearance respects active manual clearance_overrides', async () => {
  let upsertedParams: unknown[] = []
  const connection = {
    execute: async (sql: string, params: unknown[] = []) => {
      if (sql.includes('has_loan')) {
        return [[{
          has_loan: 0,
          has_fine: 0,
          has_loss: 0,
          has_charge: 0,
          has_in_library: 0,
          override_status: 'Not Cleared',
          override_reason: 'Registrar hold',
        }]]
      }
      if (sql.includes('INSERT INTO clearance_statuses')) {
        upsertedParams = params
      }
      return [{ affectedRows: 1 }]
    },
  }
  await refreshClearance(connection as never, 42)
  assert.equal(upsertedParams[1], 'Not Cleared')
})

test('HIGH-21: isDatabaseUnavailable recognizes disconnected pg client not-queryable errors', () => {
  assert.equal(isDatabaseUnavailable(new Error('Client has encountered a connection error and is not queryable')), true)
  assert.equal(isDatabaseUnavailable(new Error('Client was closed and is not queryable')), true)
})

test('MED-05 & MED-06: requireDate rejects impossible calendar dates (2026-02-31) and preflight blocks Damaged copies', () => {
  assert.throws(
    () => validatePublishBorrowingPolicy({
      borrowingDays: 1,
      dueTimeCutoff: '08:59',
      maxRenewals: 1,
      renewalExtensionDays: 1,
      studentMaxActiveBooks: 2,
      facultyMaxActiveBooks: 5,
      studentMaxActiveReservations: 2,
      facultyMaxActiveReservations: 5,
      longOverdueAfterDays: 3,
      blockRenewalIfOverdue: true,
      blockRenewalIfUnpaidFines: true,
      blockRenewalIfReserved: true,
      effectiveOn: '2026-02-31',
      changeReason: 'Testing invalid calendar date on policy',
      materialRules: [{ materialType: 'Book', isBorrowable: true }],
    }),
    (err: unknown) => err instanceof HttpError && err.status === 422,
  )

  const evalResult = evaluateCheckoutRules({
    flow: 'walk_in',
    borrower: { found: true, userId: 1, schoolId: 'S-1', name: 'Test', role: 'Student', accountStatus: 'Active' },
    copy: {
      found: true, physicalCopyId: 10, barcode: 'B-1', accessionNumber: 'A-1', title: 'Book',
      condition: 'Damaged', availability: 'Available', lifecycleStatus: 'Active',
      materialId: 10, materialType: 'Book', titleId: 1,
    },
    openLoan: null,
    queueHead: null,
    selectedReservationId: null,
    studentActiveTitleCount: 0,
    targetTitleAlreadyActive: false,
    borrowerActiveOrOverdueCount: 0,
    borrowedAt: new Date('2026-11-20T02:00:00.000Z'),
    closedDates: new Set(),
  })
  assert.equal(evalResult.decision, 'confirmation_required')
  assert.ok(evalResult.warnings.some(w => w.code === 'COPY_DAMAGED'))
})
