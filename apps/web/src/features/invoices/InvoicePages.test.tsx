import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AdminInvoicesPage } from './AdminInvoicesPage'
import { MyInvoicesPage } from './MyInvoicesPage'

const api = vi.hoisted(() => ({ setup: vi.fn(), list: vi.fn(), mine: vi.fn() }))
vi.mock('./invoice-api', () => ({
  invoiceApi: api,
  invoiceSchemaPending: (error: unknown) => error instanceof Error && error.message === 'migration missing',
  downloadInvoice: vi.fn(),
}))

beforeEach(() => {
  api.setup.mockReset(); api.list.mockReset(); api.mine.mockReset()
  api.setup.mockRejectedValue(new Error('migration missing'))
  api.list.mockRejectedValue(new Error('migration missing'))
  api.mine.mockRejectedValue(new Error('migration missing'))
})
afterEach(cleanup)

it('does not show the manual issuing form or an empty ledger when invoice tables are missing', async () => {
  render(<AdminInvoicesPage />)
  expect(await screen.findByText('Invoices are not ready yet')).toBeTruthy()
  expect(screen.queryByText('Payment record ID')).toBeNull()
  expect(screen.queryByText('No invoices issued yet.')).toBeNull()
})

it('does not present missing student invoice tables as an empty invoice history', async () => {
  render(<MyInvoicesPage />)
  expect(await screen.findByText('Invoices are not ready yet')).toBeTruthy()
  expect(screen.queryByText('No invoice has been issued for your payments.')).toBeNull()
})
