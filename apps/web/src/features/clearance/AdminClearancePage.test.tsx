import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminClearancePage } from './AdminClearancePage'
import { MemoryRouter } from 'react-router-dom'
import type { ClearanceRecord } from './types'

const api = vi.hoisted(() => ({
  terms: vi.fn().mockResolvedValue([]), schedule: vi.fn(), saveSchedule: vi.fn(), list: vi.fn(), detail: vi.fn(), override: vi.fn(), revoke: vi.fn(),
  decideLost: vi.fn(), settleLost: vi.fn(), resolveLost: vi.fn(), replaceLost: vi.fn(),
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
  it('starts with student lookup and shows schedules only on their tab', async () => {
    api.list.mockResolvedValue(listWith(blocked))
    render(<MemoryRouter initialEntries={['/librarian/clearance']}><AdminClearancePage /></MemoryRouter>)
    await screen.findByRole('heading',{name:'Clearance master list'})
    expect(screen.queryByRole('heading',{name:'Clearance schedules'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'Schedules'}))
    expect(await screen.findByRole('heading',{name:'Clearance schedules'})).toBeTruthy()
    expect(screen.queryByRole('heading',{name:'Clearance master list'})).toBeNull()
  })

  it('refreshes an open clearance review after payment without closing the review', async () => {
    api.list.mockResolvedValue(listWith(blocked))
    api.detail.mockResolvedValue(blocked)
    render(<MemoryRouter initialEntries={['/admin/clearance']}><AdminClearancePage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    await screen.findByText('Clearance review')
    const paid: ClearanceRecord = { ...blocked, status: 'Cleared', computedStatus: 'Cleared', reason: 'No outstanding requirements.', summary: { ...blocked.summary, unpaidOverdueFines: 0, totalOutstanding: 0, blockCount: 0 } }
    api.list.mockResolvedValue(listWith(paid))
    api.detail.mockResolvedValue(paid)
    window.dispatchEvent(new Event('library-payments-updated'))
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(2))
    await screen.findAllByText('No outstanding requirements.')
    expect(screen.getByText('Clearance review')).toBeTruthy()
  })

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

    fireEvent.click(screen.getByRole('button',{name:'Lost-book reports'}))
    expect(await screen.findByText('Lost-book reports awaiting review (1)')).toBeTruthy()
    expect(screen.getByText('Emma')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }))
    await waitFor(() => expect(api.detail).toHaveBeenCalledWith(7))
    expect(await screen.findByRole('heading',{name:'Lost-book reports',level:3})).toBeTruthy()
    expect(screen.getByText('Awaiting quotation')).toBeTruthy()
  })

  it('confirms a loss as Replace copy, then puts the replacement copy back with Replace copy', async () => {
    const lost = { lostBookReportId: 12, transactionId: 20, titleId: 5, title: 'Emma', quotationId: null, quotedAmount: null, titlePrice: 450,
      reportedAt: '2026-09-26T01:00:00.000Z', verifiedAt: null, resolutionReason: null }
    api.list.mockResolvedValue(listWith(blocked))
    api.detail.mockResolvedValueOnce({ ...blocked, lostBooks: [{ ...lost, status: 'Pending', chargeResolution: 'Awaiting Review', replacementCharge: 0, paymentStatus: 'Unpaid' }] })
      .mockResolvedValue({ ...blocked, lostBooks: [{ ...lost, status: 'Confirmed', chargeResolution: 'Awaiting Replacement', replacementCharge: 0, paymentStatus: 'Unpaid' }] })
    api.decideLost.mockResolvedValue({}); api.replaceLost.mockResolvedValue({})
    render(<MemoryRouter initialEntries={['/librarian/clearance']}><AdminClearancePage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm loss' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirm lost book' })
    fireEvent.click(within(dialog).getByRole('radio', { name: /Replace copy/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm loss, wait for replacement' }))
    await waitFor(() => expect(api.decideLost).toHaveBeenCalledWith(12, 'Confirmed', { resolution: 'Replace', bookPrice: null }))
    expect(await screen.findByText('Waiting for replacement copy')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Replace copy' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
    await waitFor(() => expect(api.replaceLost).toHaveBeenCalledWith(12))
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
    const dialog = await screen.findByRole('dialog', { name: 'Confirm lost book' })
    expect((within(dialog).getByLabelText('Book price (PHP)') as HTMLInputElement).value).toBe('450.00')
    fireEvent.change(within(dialog).getByLabelText('Book price (PHP)'), { target: { value: '520' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm loss and charge PHP 520.00' }))
    await waitFor(() => expect(api.decideLost).toHaveBeenCalledWith(12, 'Confirmed', { resolution: 'Pay', bookPrice: 520 }))
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Record replacement payment' }))
    await waitFor(() => expect(api.settleLost).toHaveBeenCalledWith(12))
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Book found undamaged in the return bin.')
    fireEvent.click(screen.getByRole('button', { name: 'Waive charge' }))
    await waitFor(() => expect(api.resolveLost).toHaveBeenCalledWith(12, 'Waive', 'Book found undamaged in the return bin.'))
    confirm.mockRestore(); prompt.mockRestore()
  })

  it('renders itemized blocking fines inside the review dialog and surfaces override errors in-modal', async () => {
    const withFine: ClearanceRecord = {
      ...blocked,
      fines: [{ fineId: 9, transactionId: 4, title: 'Clean Code', basis: 'Overdue return', overdueUnits: 14, rate: 2, amount: 28, appliedAt: '2026-09-01T01:00:00Z', notes: null }],
    }
    api.list.mockResolvedValue(listWith(withFine))
    api.detail.mockResolvedValue(withFine)
    api.override.mockRejectedValue(new Error('Override authorization failed.'))
    render(<MemoryRouter initialEntries={['/librarian/clearance']}><AdminClearancePage /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Clean Code')).toBeTruthy()
    expect(screen.getByText(/Overdue return/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear student as an exception' }))
    fireEvent.change(screen.getByLabelText('Reason for exception'), { target: { value: 'Temporary registrar approval' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm exception' }))
    expect(await screen.findAllByText('Override authorization failed.')).not.toHaveLength(0)
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
