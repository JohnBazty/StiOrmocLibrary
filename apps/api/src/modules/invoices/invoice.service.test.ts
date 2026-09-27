import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { createInvoiceService } from './invoice.service.ts'

test('invoice issuance remains disabled until the finance-approved release flag is set', async () => {
  const service = createInvoiceService({} as Pool, false)
  await assert.rejects(service.issue('Printing', 9, 1), (error: unknown) => error instanceof HttpError && error.code === 'INVOICE_ISSUANCE_DISABLED')
})

test('invoice issuance is blocked until finance setup is approved', async () => {
  const state = { rollback: 0, release: 0 }
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() { state.rollback++ }, release() { state.release++ },
    async execute(sql: string) { if (sql.includes('FROM invoice_setup')) return [[{ approved: false }]]; throw new Error('No invoice should be inserted') },
  }
  const service = createInvoiceService({ getConnection: async () => connection } as unknown as Pool, true)
  await assert.rejects(service.issue('Printing', 9, 1), (error: unknown) => error instanceof HttpError && error.code === 'INVOICE_NOT_APPROVED')
  assert.deepEqual(state, { rollback: 1, release: 1 })
})

test('retrying an issued payment returns its original invoice and does not advance the serial', async () => {
  const state = { commits: 0, inserts: 0 }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits++ }, async rollback() {}, release() {},
    async execute(sql: string) {
      if (sql.includes('FROM invoice_setup')) return [[{ approved: true, print_classification: 'Invoiceable', next_serial: 10, serial_end: 100 }]]
      if (sql.includes('FROM customer_invoices')) return [[{ invoice_id: 4, invoice_number: 'INV-9', status: 'Issued' }]]
      if (sql.includes('INSERT') || sql.includes('UPDATE')) state.inserts++
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const service = createInvoiceService({ getConnection: async () => connection } as unknown as Pool, true)
  const result = await service.issue('Printing', 9, 1)
  assert.equal(result.invoice_number, 'INV-9')
  assert.deepEqual(state, { commits: 1, inserts: 0 })
})

test('only an issued payment can receive a new invoice', async () => {
  const state = { rollback: 0, inserts: 0 }
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() { state.rollback++ }, release() {},
    async execute(sql: string) {
      if (sql.includes('FROM invoice_setup')) return [[{ approved: true, print_classification: 'Invoiceable', next_serial: 10, serial_end: 100 }]]
      if (sql.includes('FROM customer_invoices')) return [[]]
      if (sql.includes('FROM print_payment_receipts')) return [[{ status: 'Reversed' }]]
      if (sql.includes('INSERT')) state.inserts++
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const service = createInvoiceService({ getConnection: async () => connection } as unknown as Pool, true)
  await assert.rejects(service.issue('Printing', 9, 1), (error: unknown) => error instanceof HttpError && error.code === 'INVOICE_PAYMENT_INVALID')
  assert.deepEqual(state, { rollback: 1, inserts: 0 })
})
