import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminFinesPage } from './AdminFinesPage'

const api = vi.hoisted(() => ({
  adminList: vi.fn(), adminTerms: vi.fn(), downloadReport: vi.fn(), issueInfraction: vi.fn(),
  pay: vi.fn(), adjust: vi.fn(), reverse: vi.fn(), downloadReceipt: vi.fn(),
}))
vi.mock('./fines-api', () => ({ finesApi: api }))

const fineList = {
  range: { from: '2000-01-01', to: '2026-09-02', label: 'All fine records', termId: null },
  summary: { assessed: 28, outstanding: 28, collected: 0, waived: 0, accountsWithBalance: 1 },
  items: [{
    id: 'F-2', fineId: 2, lostBookReportId: null, userId: 7, schoolId: '02000871654',
    userName: 'Buentheo Nathaniel Noval', type: 'Overdue', title: '1984',
    reason: '14 hourly unit(s) at PHP 2.00', assessed: 28, paid: 0, adjusted: 0,
    balance: 28, status: 'Unpaid', occurredAt: '2026-08-25T13:56:25.000Z',
    updatedAt: '2026-08-25T13:56:25.000Z', paymentAllowed: true,
  }],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
}

describe('AdminFinesPage', () => {
  it('loads all records by default so older unpaid balances remain payable', async () => {
    api.adminList.mockResolvedValue(fineList)
    api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPage />)

    await waitFor(() => expect(api.adminList).toHaveBeenCalledWith(expect.objectContaining({ period: 'all' })))
    expect(await screen.findByText('Buentheo Nathaniel Noval')).toBeTruthy()
    expect(screen.getByText('All fine records · 1 records')).toBeTruthy()
    expect(screen.queryByText('An unexpected server error occurred.')).toBeNull()
  })

  it('treats reduction as a partial cash payment and generates a receipt', async () => {
    api.adminList.mockResolvedValue(fineList)
    api.adminTerms.mockResolvedValue([])
    api.pay.mockResolvedValue({
      receiptId: 12, receiptNumber: 'OR-20260903-000012', requestKey: 'cash-reduction-12',
      student: { userId: 7, schoolId: '02000871654', name: 'Buentheo Nathaniel Noval' },
      amountReceived: 14, paymentMethod: 'Cash', receivedBy: 'Library Admin', receivedAt: '2026-09-03T08:00:00.000Z', status: 'Issued',
      reversedBy: null, reversedAt: null, reversalReason: null, notes: null,
      allocations: [{ fineId: 2, lostBookReportId: null, type: 'Overdue', title: '1984', assessed: 28, paid: 14, balanceBefore: 28, balanceAfter: 14 }],
    })
    render(<AdminFinesPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Adjust' }))
    fireEvent.change(screen.getByLabelText('Cash amount paid'), { target: { value: '14' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment and generate receipt' }))

    await waitFor(() => expect(api.pay).toHaveBeenCalledWith(expect.objectContaining({ allocations: [{ fineId: 2, amount: 14 }] })))
    expect(api.adjust).not.toHaveBeenCalled()
    expect(await screen.findByText('Digital receipt OR-20260903-000012')).toBeTruthy()
    expect(screen.getByText(/Remaining.*₱14\.00/)).toBeTruthy()
  })

  it('records a waiver without creating a cash receipt', async () => {
    api.adminList.mockResolvedValue(fineList)
    api.adminTerms.mockResolvedValue([])
    api.adjust.mockResolvedValue({})
    render(<AdminFinesPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Adjust' }))
    fireEvent.change(screen.getByLabelText('Adjustment type'), { target: { value: 'Waiver' } })
    fireEvent.change(screen.getByLabelText('Mandatory audit reason'), { target: { value: 'Approved by the head librarian.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record waiver' }))

    await waitFor(() => expect(api.adjust).toHaveBeenCalledWith(2, { type: 'Waiver', reason: 'Approved by the head librarian.' }))
    expect(api.pay).not.toHaveBeenCalled()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
