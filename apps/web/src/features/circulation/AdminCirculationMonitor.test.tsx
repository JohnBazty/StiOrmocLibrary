import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminCirculationMonitor } from './AdminCirculationMonitor'

const api = vi.hoisted(() => ({ monitor: vi.fn(), fulfillClaim: vi.fn(), returnBook: vi.fn(), calculatePenalty: vi.fn(), cancelRequest: vi.fn() }))
vi.mock('./circulation-api', () => ({ circulationApi: api }))
vi.mock('./CirculationDesk',()=>({CirculationDesk:({returnBarcode}:any)=><div>Scan desk {returnBarcode?.value}</div>}))

const monitor = { summary: { pendingClaims: 0, activeLoans: 1, overdueLoans: 0, returnedToday: 0, dueToday: 1 }, items: [{ transactionId: 4, userName: 'A Student', schoolId: 'STI-4', role: 'Student', title: 'Database Systems', accessionNumber: 'ACC-4', barcode: 'BOOK-4', requestedAt: '2026-08-23T08:55:00', borrowDate: '2026-08-23T09:00:00', dueDate: '2026-08-24T08:59:00', returnDate: null, status: 'Borrowed' }], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } }

describe('AdminCirculationMonitor', () => {
  it('routes a return to the scanned preview without immediately writing',async()=>{api.monitor.mockResolvedValue(monitor);render(<AdminCirculationMonitor />);expect(await screen.findByText('Database Systems')).toBeTruthy();fireEvent.click(screen.getByText('Process return'));expect(screen.getByText('Scan desk BOOK-4')).toBeTruthy();expect(api.returnBook).not.toHaveBeenCalled()})

  it('renders online cart requests in a dedicated pending-claim ledger', async () => {
    api.monitor.mockResolvedValue({ ...monitor, summary: { ...monitor.summary, pendingClaims: 1, activeLoans: 0 }, items: [{ ...monitor.items[0], transactionId: 9, title: 'Computer Networks', borrowDate: null, dueDate: null, status: 'Pending' }] })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Computer Networks')).toBeTruthy()
    expect(screen.getAllByText('Pending claim').length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByRole('button', { name: 'Verify borrower' }))
    expect(screen.getByText('Scan the claimant’s user QR and this copy barcode in the circulation desk above before checkout.')).toBeTruthy()
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
