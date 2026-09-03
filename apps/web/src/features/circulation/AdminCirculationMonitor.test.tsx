import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminCirculationMonitor } from './AdminCirculationMonitor'

const api = vi.hoisted(() => ({ monitor: vi.fn(), fulfillClaim: vi.fn(), returnBook: vi.fn(), calculatePenalty: vi.fn(), cancelRequest: vi.fn() }))
vi.mock('./circulation-api', () => ({ circulationApi: api }))

const monitor = { summary: { pendingClaims: 0, activeLoans: 1, overdueLoans: 0, returnedToday: 0, dueToday: 1 }, items: [{ transactionId: 4, userName: 'A Student', schoolId: 'STI-4', role: 'Student', title: 'Database Systems', accessionNumber: 'ACC-4', barcode: 'BOOK-4', requestedAt: '2026-08-23T08:55:00', borrowDate: '2026-08-23T09:00:00', dueDate: '2026-08-24T08:59:00', returnDate: null, status: 'Borrowed' }], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } }

describe('AdminCirculationMonitor', () => {
  it('submits scanner checkout and refreshes the shared monitor', async () => {
    api.monitor.mockResolvedValue(monitor); api.fulfillClaim.mockResolvedValue({ transactionId: 5 })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Database Systems')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Scan barcode then press Enter'), { target: { value: 'BOOK-5' } })
    fireEvent.change(screen.getByPlaceholderText(/presented school ID/i), { target: { value: 'STI-5' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm checkout/i }))
    await waitFor(() => expect(api.fulfillClaim).toHaveBeenCalledWith('BOOK-5', 'STI-5'))
    expect(await screen.findByText('School ID and barcode verified. The claim is now an active loan.')).toBeTruthy()
  })

  it('renders online cart requests in a dedicated pending-claim ledger', async () => {
    api.monitor.mockResolvedValue({ ...monitor, summary: { ...monitor.summary, pendingClaims: 1, activeLoans: 0 }, items: [{ ...monitor.items[0], transactionId: 9, title: 'Computer Networks', borrowDate: null, dueDate: null, status: 'Pending' }] })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Computer Networks')).toBeTruthy()
    expect(screen.getAllByText('Pending claim').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: 'Verify borrower' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(screen.getByText('Online carts pending counter claim')).toBeTruthy()
  })

  it('cancels a pending claim and removes it from the admin lane without a page reload', async () => {
    api.monitor.mockResolvedValue({ ...monitor, summary: { ...monitor.summary, pendingClaims: 1, activeLoans: 0 }, items: [{ ...monitor.items[0], transactionId: 9, title: 'Computer Networks', borrowDate: null, dueDate: null, status: 'Pending' }] })
    api.cancelRequest.mockResolvedValue({ transactionId: 9, status: 'Cancelled', copyAvailability: 'Available' })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Computer Networks')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    await waitFor(() => expect(api.cancelRequest).toHaveBeenCalledWith(9, ''))
    expect(await screen.findByText('Computer Networks pending claim was cancelled and released.')).toBeTruthy()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
