import assert from 'node:assert/strict'
import test from 'node:test'
import { settleVerifiedPayment } from '../modules/payments/payments.settlement.ts'
import * as paymentAssuranceIntegration from '../modules/payments/payment-assurance.integration.ts'
import { createPaperSizesService } from '../modules/printing/paper-sizes.service.ts'
import { createPrintingDeferredService } from '../modules/printing/printing-deferred.service.ts'
import { createUrgentCases } from '../modules/fines/urgent-cases.ts'

test('HIGH-02: settleVerifiedPayment records balance_before/balance_after and sets Partially Paid for partial printing payment', async () => {
  const executed: Array<{ sql: string; params: unknown[] }> = []
  const connection = {
    execute: async (sql: string, params: unknown[] = []) => {
      executed.push({ sql, params })
      if (sql.includes('FROM print_requests pr')) {
        return [[{
          request_id: 12,
          user_id: 7,
          full_name: 'Student A',
          school_id: '02000123456',
          file_name: 'thesis.pdf',
          page_count: 10,
          number_of_copies: 1,
          total_sheets: 10,
          print_type: 'Colored',
          paper_size: 'A4',
        }]]
      }
      return [{ affectedRows: 1, rows: [] }]
    },
  }

  await settleVerifiedPayment(
    connection as never,
    {
      payment_id: 'pay-1',
      account_id: 70,
      user_id: 7,
      environment: 'test',
      print_request_id: 12,
      fine_id: null,
      lost_book_report_id: null,
      fee_rule_id: 1,
      channel_code: 'GCASH',
      principal_centavos: '4000',
      fee_centavos: '140',
      total_centavos: '4140',
      balance_before_centavos: '10000',
      state: 'Succeeded',
      request_key: 'rk-1',
      expires_at: new Date(),
      created_at: new Date(),
    } as never,
    new Date('2026-11-20T03:00:00.000Z'),
  )

  const receiptInsert = executed.find(q => q.sql.includes('INSERT INTO print_payment_receipts'))
  assert.ok(receiptInsert, 'Expected print_payment_receipts INSERT')
  assert.match(receiptInsert.sql, /balance_before/i)
  assert.match(receiptInsert.sql, /balance_after/i)
  assert.ok(receiptInsert.params.includes('100.00'), 'Expected balance_before 100.00')
  assert.ok(receiptInsert.params.includes('60.00'), 'Expected balance_after 60.00')

  const requestUpdate = executed.find(q => q.sql.includes('UPDATE print_requests'))
  assert.ok(requestUpdate, 'Expected print_requests UPDATE')
  assert.ok(
    requestUpdate.params.includes('Partially Paid'),
    `Expected Partially Paid in UPDATE print_requests params: ${JSON.stringify(requestUpdate.params)}`,
  )
})

test('HIGH-18: databaseAssuranceAttempt resolves online_payment_attempts from database when localPaymentPreview is disabled', async () => {
  const fn = (paymentAssuranceIntegration as Record<string, unknown>).databaseAssuranceAttempt as
    | ((pool: unknown, actor: { accountId?: number }, id: string, staff: boolean) => Promise<Record<string, unknown>>)
    | undefined
  assert.equal(typeof fn, 'function', 'Expected databaseAssuranceAttempt to be exported')

  const pool = {
    execute: async (sql: string, params: unknown[]) => {
      assert.match(sql, /FROM online_payment_attempts/i)
      if (params[1] === 70) {
        return [[{
          payment_id: '00000000-0000-4000-8000-000000000099',
          account_id: 70,
          user_id: 7,
          print_request_id: 15,
          fine_id: null,
          lost_book_report_id: null,
          state: 'Succeeded',
          channel_code: 'GCASH',
          principal_centavos: '5000',
          fee_centavos: '150',
          total_centavos: '5150',
          provider_payment_id: 'py_123',
          provider_session_id: 'ps_123',
          created_at: new Date('2026-11-20T01:00:00.000Z'),
          updated_at: new Date('2026-11-20T01:02:00.000Z'),
        }]]
      }
      return [[]]
    },
  }

  const attempt = await fn!(pool, { accountId: 70 }, '00000000-0000-4000-8000-000000000099', false)
  assert.equal(attempt.kind, 'Printing')
  assert.equal(attempt.targetId, 15)
  assert.equal(attempt.totalCentavos, 5150)
  assert.equal(attempt.providerPaymentId, 'py_123')
})

test('MED-07: printingDeferredService.approve emits borrower notification', async () => {
  const queries: string[] = []
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string) => {
      queries.push(sql)
      if (sql.includes('SELECT a.role,a.account_status')) return [[{ role: 'Librarian', account_status: 'Active', user_status: 'Active' }]]
      if (sql.includes('SELECT a.account_id,a.user_id,a.role FROM accounts')) return [[{ account_id: 1, user_id: 1, role: 'Librarian' }]]
      if (sql.includes('SELECT * FROM print_requests WHERE request_id=? FOR UPDATE')) {
        return [[{
          request_id: 22,
          user_id: 7,
          file_name: 'report.pdf',
          job_status: 'Pending',
          pricing_review_state: 'Ready',
          row_version: 1,
          calculated_cost: 45,
          pricing_snapshot: null,
        }]]
      }
      if (sql.includes('SELECT * FROM print_deferred_approvals')) return [[]]
      if (sql.includes('paid FROM print_requests')) return [[{ paid: 0 }]]
      return [{ affectedRows: 1, rows: [{ version: 1 }] }]
    },
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }
  const service = createPrintingDeferredService({ getConnection: async () => connection, execute: connection.execute } as never)
  await service.approve(
    { accountId: 1, schoolId: 'LIB-1', role: 'Librarian' },
    22,
    { reason: 'Approved pay later at counter', agreed_payment_date: '2026-11-25', version: 1, request_key: '11111111-2222-4333-8444-555555555555' },
  )
  assert.ok(
    queries.some(q => q.includes('INSERT INTO notifications')),
    'Expected INSERT INTO notifications on Pay Later approval',
  )
})

test('MED-08: paperSizesService.addStock updates price_per_page on conflict when settings are provided', async () => {
  const queries: string[] = []
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string) => {
      queries.push(sql)
      if (sql.includes('SELECT a.role,a.account_status')) return [[{ role: 'Librarian', account_status: 'Active', user_status: 'Active' }]]
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 1 }]]
      if (sql.includes('FROM bond_paper_stocks WHERE paper_stock_id=? AND deleted_at IS NULL FOR UPDATE')) {
        return [[{ paper_stock_id: 1, paper_size_dimension: 'A4', sheets_per_ream: 500, is_active: true, configuration_version: 1 }]]
      }
      if (sql.includes('FROM bond_paper_stocks p')) {
        return [[{
          paper_stock_id: 1,
          paper_size_dimension: 'A4',
          current_sheets_available: 500,
          sheets_per_ream: 500,
          low_stock_threshold_reams: 2,
          is_active: true,
          configuration_version: 1,
          monochrome_price: 2,
          colored_price: 5,
        }]]
      }
      if (sql.includes('FROM paper_stock_movements')) return [[]]
      if (sql.includes('FROM paper_brand_stocks')) return [[{ paper_brand_stock_id: 10, brand: 'Hard Copy' }]]
      return [{ affectedRows: 1, insertId: 1, rows: [{ paper_brand_stock_id: 10 }] }]
    },
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }
  const service = createPaperSizesService({ getConnection: async () => connection, execute: connection.execute } as never)
  await service.addStock(
    { accountId: 1 },
    1,
    {
      quantity: 2,
      unit_cost: '250.00',
      brand: 'Hard Copy',
      client_request_id: '11111111-2222-4333-8444-555555555555',
      settings: { sheets_per_ream: 500, low_stock_threshold_reams: 2, is_active: true, monochrome_price: '3.00', colored_price: '6.00', configuration_version: 1 },
    },
  )
  const pricingUpsert = queries.find(q => q.includes('INSERT INTO print_pricing_rules'))
  assert.ok(pricingUpsert, 'Expected print_pricing_rules upsert')
  assert.match(pricingUpsert, /price_per_page\s*=\s*EXCLUDED\.price_per_page/i)
})

test('LOW-02: createUrgentCases.notify sends email to every active Librarian recipient, not only the first', async () => {
  const emailedTo: string[] = []
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string) => {
      if (sql.includes('INSERT INTO urgent_case_notices')) return [{ affectedRows: 1 }]
      if (sql.includes('SELECT source_key FROM urgent_case_notices')) return [[{ source_key: 'Fine:1' }]]
      return [{ affectedRows: 1 }]
    },
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }
  const pool = {
    getConnection: async () => connection,
    execute: async (sql: string) => {
      if (sql.includes('FROM urgent_case_settings')) {
        return [[{ version: 1, amount: 50, overdue_days: null, unpaid_days: null, email_enabled: true }]]
      }
      if (sql.includes('WITH charges AS')) {
        return [[{
          key: 'Fine:1',
          user_id: 9,
          kind: 'Infraction',
          assessed_at: new Date('2026-11-01T00:00:00.000Z'),
          due_at: null,
          balance: 100,
          full_name: 'Student',
          school_id: '02000111222',
          last_notified_at: null,
        }]]
      }
      if (sql.includes("WHERE a.role='Librarian'")) {
        return [[
          { account_id: 1, user_id: 1, email: 'lib1@ormoc.sti.edu.ph' },
          { account_id: 2, user_id: 2, email: 'lib2@ormoc.sti.edu.ph' },
        ]]
      }
      return [[]]
    },
  }
  const urgent = createUrgentCases(pool as never, async (to: string) => {
    emailedTo.push(to)
  })
  await urgent.notify(new Date('2026-11-20T00:00:00.000Z'))
  assert.deepEqual(emailedTo, ['lib1@ormoc.sti.edu.ph', 'lib2@ormoc.sti.edu.ph'])
})
