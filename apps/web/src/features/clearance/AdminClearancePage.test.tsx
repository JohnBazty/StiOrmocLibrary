import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminClearancePage } from './AdminClearancePage'
import { MemoryRouter } from 'react-router-dom'
import type { ClearanceRecord } from './types'

const api = vi.hoisted(() => ({
  terms: vi.fn().mockResolvedValue([]), schedule: vi.fn(), saveSchedule: vi.fn(), list: vi.fn(), detail: vi.fn(), override: vi.fn(), revoke: vi.fn(),
  decideLost: vi.fn(), settleLost: vi.fn(), resolveLost: vi.fn(),
}))
vi.mock('./clearance-api', () => ({ clearanceApi: api }))

const blocked: ClearanceRecord = {
  student: { userId: 7, schoolId: '02000871654', name: 'Buentheo Nathaniel Noval', program: 'BS Information Technology', section: null, accountStatus: 'Active' },
  status: 'Not Cleared', computedStatus: 'Not Cleared', reason: 'PHP 28.00 unpaid overdue fines', checkedAt: '2026-09-03T01:00:00.000Z',
  summary: { activeLoans: 0, unpaidOverdueFines: 28, unpaidReplacementCharges: 0, totalOutstanding: 28, blockCount: 1 },
  loans: [], fines: [], lostBooks: [], activeOverride: null, overrideHistory: [],
}

function listWith(item: ClearanceRecord) {
  return {
    summary: { totalStudents: 1, cleared: item.status === 'Cleared' ? 1 : 0, pending: item.status === 'Not Cleared' ? 1 : 0, activeOverrides: item.activeOverride ? 1 : 0 },
    pendingLostReports: [],
    items: [item], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  }
}

describe('AdminClearancePage simplified exceptions', () => {
  it('uses one reason field and automatically grants a cleared exception', async () => {
    const overridden: ClearanceRecord = {
      ...blocked,
      status: 'Cleared',
      activeOverride: { overrideId: 4, status: 'Cleared', reason: 'Approved while payment is being verified.', appliedAt: '2026-09-03T02:00:00.000Z', expiresAt: null, appliedBy: 'Head Librarian' },
      overrideHistory: [],
    }
    api.list.mockResolvedValue(listWith(blocked))
    api.detail.mockResolvedValue(blocked)
    api.override.mockResolvedValue({ clearance: overridden })
    render(<MemoryRouter><AdminClearancePage /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('button', { name: 'Clear student as an exception' })).toBeTruthy()
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Clear student as an exception' }))
    fireEvent.change(screen.getByLabelText('Reason for exception'), { target: { value: 'Approved while payment is being verified.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm exception' }))

    await waitFor(() => expect(api.override).toHaveBeenCalledWith(7, {
      status: 'Cleared', reason: 'Approved while payment is being verified.', expiresAt: null,
    }))
  })

  it('does not offer an override when the computed standing is already cleared', async () => {
    const cleared: ClearanceRecord = { ...blocked, status: 'Cleared', computedStatus: 'Cleared', reason: 'No library obligations', summary: { ...blocked.summary, unpaidOverdueFines: 0, totalOutstanding: 0, blockCount: 0 } }
    api.list.mockResolvedValue(listWith(cleared))
    api.detail.mockResolvedValue(cleared)
    render(<MemoryRouter><AdminClearancePage /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByText('No exception is needed because the student is already cleared by the system.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear student as an exception' })).toBeNull()
  })

  it('shows student lost reports in a review queue and opens the borrower record', async () => {
    api.list.mockResolvedValue({
      ...listWith(blocked),
      pendingLostReports: [{ lostBookReportId: 12, userId: 7, schoolId: blocked.student.schoolId,
        borrowerName: blocked.student.name, role: 'Student', title: 'Emma', reportedAt: '2026-09-26T01:00:00.000Z' }],
    })
    api.detail.mockResolvedValue({ ...blocked, lostBooks: [{ lostBookReportId: 12, transactionId: 20,
      titleId: 5, title: 'Emma', status: 'Pending', quotationId: null, quotedAmount: null, replacementCharge: 0,
      paymentStatus: 'Unpaid', reportedAt: '2026-09-26T01:00:00.000Z', verifiedAt: null }] })
    render(<MemoryRouter initialEntries={['/librarian/clearance']}><AdminClearancePage /></MemoryRouter>)

    expect(await screen.findByText('Lost-book reports awaiting review (1)')).toBeTruthy()
    expect(screen.getByText('Emma')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }))
    await waitFor(() => expect(api.detail).toHaveBeenCalledWith(7))
    expect(await screen.findByText('Lost-book reports')).toBeTruthy()
    expect(screen.getByText('Awaiting quotation')).toBeTruthy()
  })

  it('confirms a lost book at the book price and offers payment for a book-price charge', async () => {
    const lost = { lostBookReportId: 12, transactionId: 20, titleId: 5, title: 'Emma', quotationId: 8, quotedAmount: 700, titlePrice: 450,
      reportedAt: '2026-09-26T01:00:00.000Z', verifiedAt: null, resolutionReason: null }
    api.list.mockResolvedValue(listWith(blocked))
    api.detail.mockResolvedValueOnce({ ...blocked, lostBooks: [{ ...lost, status: 'Pending', chargeResolution: 'Awaiting Review', replacementCharge: 0, paymentStatus: 'Unpaid' }] })
      .mockResolvedValue({ ...blocked, lostBooks: [{ ...lost, status: 'Confirmed', chargeResolution: 'Book Price', replacementCharge: 450, paymentStatus: 'Unpaid' }] })
    api.decideLost.mockResolvedValue({})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MemoryRouter initialEntries={['/librarian/clearance']}><AdminClearancePage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect((await screen.findByText(/Book price: .*450\.00/)).textContent).not.toContain('700')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm loss' }))
    expect(confirm.mock.calls[0][0]).toMatch(/book price of .*450\.00/)
    await waitFor(() => expect(api.decideLost).toHaveBeenCalledWith(12, 'Confirmed', 450))
    fireEvent.click(await screen.findByRole('button', { name: 'Record replacement payment' }))
    await waitFor(() => expect(api.settleLost).toHaveBeenCalledWith(12))
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Book found undamaged in the return bin.')
    fireEvent.click(screen.getByRole('button', { name: 'Waive charge' }))
    await waitFor(() => expect(api.resolveLost).toHaveBeenCalledWith(12, 'Waive', 'Book found undamaged in the return bin.'))
    confirm.mockRestore(); prompt.mockRestore()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
