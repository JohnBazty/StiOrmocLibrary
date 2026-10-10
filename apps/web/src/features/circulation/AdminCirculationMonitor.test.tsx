import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminCirculationMonitor } from './AdminCirculationMonitor'

const api = vi.hoisted(() => ({
  monitor: vi.fn(),
  preflightCheckout: vi.fn(),
  fulfillClaim: vi.fn(),
  confirmCheckout: vi.fn(),
  returnBook: vi.fn(),
  calculatePenalty: vi.fn(),
  cancelRequest: vi.fn(),
}))
vi.mock('./circulation-api', () => ({ circulationApi: api }))

const monitor = {
  summary: { pendingClaims: 0, activeLoans: 1, overdueLoans: 0, returnedToday: 0, dueToday: 1 },
  items: [{
    transactionId: 4, userName: 'A Student', schoolId: 'STI-4', role: 'Student', title: 'Database Systems',
    accessionNumber: 'ACC-4', barcode: 'BOOK-4', requestedAt: '2026-08-23T08:55:00', borrowDate: '2026-08-23T09:00:00',
    dueDate: '2026-08-24T08:59:00', returnDate: null, status: 'Borrowed',
  }],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
}

describe('AdminCirculationMonitor', () => {
  it('runs ready preflight then walk-in checkout without the warning dialog', async () => {
    api.monitor.mockResolvedValue(monitor)
    api.preflightCheckout.mockResolvedValue({
      decision: 'ready',
      expiresAt: '2026-10-09T11:02:00.000Z',
      borrower: { userId: 5, schoolId: 'STI-5', name: 'Student', role: 'Student' },
      copy: { physicalCopyId: 5, barcode: 'BOOK-5', accessionNumber: 'ACC-5', title: 'Networks', condition: 'Good', availability: 'Available' },
      dueAt: '2026-10-10T08:59:00.000Z',
      blockers: [],
      warnings: [],
      alerts: [{ code: 'CONDITION_FAIR', message: 'Copy condition is Fair.' }],
      preflightToken: 'token-ready',
    })
    api.confirmCheckout.mockResolvedValue({ transactionId: 5 })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Database Systems')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Scan barcode then press Enter'), { target: { value: 'BOOK-5' } })
    fireEvent.change(screen.getByPlaceholderText(/presented school ID/i), { target: { value: 'STI-5' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm checkout/i }))
    await waitFor(() => expect(api.preflightCheckout).toHaveBeenCalledWith('BOOK-5', 'STI-5', 'walk_in'))
    await waitFor(() => expect(api.confirmCheckout).toHaveBeenCalledWith({
      barcode: 'BOOK-5', schoolId: 'STI-5', preflightToken: 'token-ready', overrideReason: null,
    }))
    expect(api.fulfillClaim).not.toHaveBeenCalled()
    expect(await screen.findByText('School ID and barcode verified. Walk-in checkout is now an active loan.')).toBeTruthy()
    expect(screen.getByText('Copy condition is Fair.')).toBeTruthy()
  })

  it('displays blockers and does not call checkout', async () => {
    api.monitor.mockResolvedValue(monitor)
    api.preflightCheckout.mockResolvedValue({
      decision: 'blocked',
      expiresAt: null,
      borrower: { userId: 5, schoolId: 'STI-5', name: 'Student', role: 'Student' },
      copy: { physicalCopyId: 5, barcode: 'BOOK-5', accessionNumber: 'ACC-5', title: 'Networks', condition: 'Lost', availability: 'Unavailable' },
      dueAt: '2026-10-10T08:59:00.000Z',
      blockers: [{ code: 'COPY_LOST', message: 'This physical copy is marked Lost and cannot be checked out.' }],
      warnings: [],
      alerts: [],
      preflightToken: null,
    })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Database Systems')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Scan barcode then press Enter'), { target: { value: 'BOOK-5' } })
    fireEvent.change(screen.getByPlaceholderText(/presented school ID/i), { target: { value: 'STI-5' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm checkout/i }))
    expect(await screen.findByText(/Checkout is blocked/i)).toBeTruthy()
    expect(screen.getByText(/marked Lost/i)).toBeTruthy()
    expect(api.fulfillClaim).not.toHaveBeenCalled()
    expect(api.confirmCheckout).not.toHaveBeenCalled()
  })

  it('requires a warning reason and sends token plus reason on confirm', async () => {
    api.monitor.mockResolvedValue(monitor)
    api.preflightCheckout.mockResolvedValue({
      decision: 'confirmation_required',
      expiresAt: '2026-10-09T11:02:00.000Z',
      borrower: { userId: 5, schoolId: 'STI-5', name: 'Student', role: 'Student' },
      copy: { physicalCopyId: 5, barcode: 'BOOK-5', accessionNumber: 'ACC-5', title: 'Networks', condition: 'Damaged', availability: 'Available' },
      dueAt: '2026-10-10T08:59:00.000Z',
      blockers: [],
      warnings: [{ code: 'COPY_DAMAGED', message: 'This copy is marked Damaged. Confirm that it is safe to lend.' }],
      alerts: [],
      preflightToken: 'token-warn',
    })
    api.confirmCheckout.mockResolvedValue({ transactionId: 5 })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Database Systems')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Scan barcode then press Enter'), { target: { value: 'BOOK-5' } })
    fireEvent.change(screen.getByPlaceholderText(/presented school ID/i), { target: { value: 'STI-5' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm checkout/i }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(api.confirmCheckout).not.toHaveBeenCalled()
    const confirmButton = screen.getByRole('button', { name: 'Confirm with reason' })
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText(/safe to lend/i), {
      target: { value: 'Cover worn but pages and binding are usable.' },
    })
    fireEvent.click(confirmButton)
    await waitFor(() => expect(api.confirmCheckout).toHaveBeenCalledWith({
      barcode: 'BOOK-5',
      schoolId: 'STI-5',
      preflightToken: 'token-warn',
      overrideReason: 'Cover worn but pages and binding are usable.',
    }))
  })

  it('cancelling a warning does not check out the book', async () => {
    api.monitor.mockResolvedValue(monitor)
    api.preflightCheckout.mockResolvedValue({
      decision: 'confirmation_required',
      expiresAt: '2026-10-09T11:02:00.000Z',
      borrower: { userId: 5, schoolId: 'STI-5', name: 'Student', role: 'Student' },
      copy: { physicalCopyId: 5, barcode: 'BOOK-5', accessionNumber: 'ACC-5', title: 'Networks', condition: 'Damaged', availability: 'Available' },
      dueAt: '2026-10-10T08:59:00.000Z',
      blockers: [],
      warnings: [{ code: 'COPY_DAMAGED', message: 'This copy is marked Damaged. Confirm that it is safe to lend.' }],
      alerts: [],
      preflightToken: 'token-warn',
    })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Database Systems')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Scan barcode then press Enter'), { target: { value: 'BOOK-5' } })
    fireEvent.change(screen.getByPlaceholderText(/presented school ID/i), { target: { value: 'STI-5' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm checkout/i }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel checkout' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.confirmCheckout).not.toHaveBeenCalled()
    expect(api.fulfillClaim).not.toHaveBeenCalled()
  })

  it('uses claim flow when a matching pending row exists', async () => {
    api.monitor.mockResolvedValue({
      ...monitor,
      summary: { ...monitor.summary, pendingClaims: 1, activeLoans: 0 },
      items: [{ ...monitor.items[0], transactionId: 9, title: 'Computer Networks', borrowDate: null, dueDate: null, status: 'Pending', barcode: 'BOOK-4', schoolId: 'STI-4' }],
    })
    api.preflightCheckout.mockResolvedValue({
      decision: 'ready',
      expiresAt: '2026-10-09T11:02:00.000Z',
      borrower: { userId: 4, schoolId: 'STI-4', name: 'A Student', role: 'Student' },
      copy: { physicalCopyId: 4, barcode: 'BOOK-4', accessionNumber: 'ACC-4', title: 'Computer Networks', condition: 'Good', availability: 'Available' },
      dueAt: '2026-10-10T08:59:00.000Z',
      blockers: [], warnings: [], alerts: [], preflightToken: 'token-claim',
    })
    api.fulfillClaim.mockResolvedValue({ transactionId: 9 })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Computer Networks')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Verify borrower' }))
    fireEvent.click(screen.getByRole('button', { name: /confirm checkout/i }))
    await waitFor(() => expect(api.preflightCheckout).toHaveBeenCalledWith('BOOK-4', 'STI-4', 'claim'))
    await waitFor(() => expect(api.fulfillClaim).toHaveBeenCalledWith({
      barcode: 'BOOK-4', schoolId: 'STI-4', preflightToken: 'token-claim', overrideReason: null,
    }))
    expect(api.confirmCheckout).not.toHaveBeenCalled()
  })

  it('renders online cart requests in a dedicated pending-claim ledger', async () => {
    api.monitor.mockResolvedValue({ ...monitor, summary: { ...monitor.summary, pendingClaims: 1, activeLoans: 0 }, items: [{ ...monitor.items[0], transactionId: 9, title: 'Computer Networks', borrowDate: null, dueDate: null, status: 'Pending' }] })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Computer Networks')).toBeTruthy()
    expect(screen.getAllByText('Pending claim').length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByRole('button', { name: 'Verify borrower' }))
    expect((screen.getByPlaceholderText('Scan barcode then press Enter') as HTMLInputElement).value).toBe('BOOK-4')
    expect((screen.getByPlaceholderText(/presented school ID/i) as HTMLInputElement).value).toBe('STI-4')
    expect(screen.getByText('Borrower School ID and book barcode loaded. Confirm checkout after verifying the presented ID and book.')).toBeTruthy()
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

  it('ignores repeated submit while preflight is in flight', async () => {
    let resolvePreflight: ((value: unknown) => void) = () => undefined
    api.monitor.mockResolvedValue(monitor)
    api.preflightCheckout.mockImplementation(() => new Promise((resolve) => { resolvePreflight = resolve }))
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Database Systems')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Scan barcode then press Enter'), { target: { value: 'BOOK-5' } })
    fireEvent.change(screen.getByPlaceholderText(/presented school ID/i), { target: { value: 'STI-5' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm checkout/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirming/i }))
    expect(api.preflightCheckout).toHaveBeenCalledTimes(1)
    resolvePreflight({
      decision: 'ready', expiresAt: null, borrower: null, copy: null, dueAt: '2026-10-10T08:59:00.000Z',
      blockers: [], warnings: [], alerts: [], preflightToken: 'token',
    })
    await waitFor(() => expect(api.confirmCheckout).toHaveBeenCalledTimes(1))
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
