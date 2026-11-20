import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminFinesPage } from './AdminFinesPage'

const api = vi.hoisted(() => ({
  adminList: vi.fn(), adminTerms: vi.fn(), downloadReport: vi.fn(), filterOptions: vi.fn(), urgentCaseCount: vi.fn(),
  pay: vi.fn(), adjust: vi.fn(), reverse: vi.fn(), receipt: vi.fn(), downloadReceipt: vi.fn(),
}))
vi.mock('./fines-api', () => ({ finesApi: api }))
vi.mock('./ViolationsRecords', () => ({ ViolationsRecords: (props: { incidentId?: number | null }) => <p>Violations tab body {props.incidentId ?? 'none'}</p> }))
vi.mock('./UrgentCases', () => ({ UrgentCases: () => <p>Urgent tab body</p> }))
vi.mock('../payments/ServiceChargesPanel', () => ({ ServiceChargesPanel: () => <p>Service tab body</p> }))

function Where() { const location = useLocation(); const type = useNavigationType(); return <><p data-testid="where">{location.search}</p><p data-testid="nav">{type}</p></> }
const options = { types: [{ value: 'Overdue', label: 'Overdue' }, { value: 'Lost Book', label: 'Lost book' }, { value: 'Damage Replacement', label: 'Damage replacement' }], violations: [{ type: 'Infraction', category: null, label: 'All violations' }, { type: 'Infraction', category: 'Noise', label: 'Noise' }, { type: 'Infraction', category: 'Old rule', label: 'Old rule (retired)' }] }
function AdminFinesPageUnderTest({ at = '/librarian/fines' }: { at?: string }) { return <MemoryRouter initialEntries={[at]}><AdminFinesPage /><Where /></MemoryRouter> }
beforeEach(() => { api.filterOptions.mockResolvedValue(options); api.urgentCaseCount.mockResolvedValue(0) })

const fineList = {
  range: { from: '2000-01-01', to: '2026-09-02', label: 'All fine records', termId: null },
  summary: { assessed: 28, outstanding: 28, collected: 0, waived: 0, accountsWithBalance: 1 },
  items: [{
    id: 'F-2', fineId: 2, lostBookReportId: null, userId: 7, schoolId: '02000871654',
    userName: 'Buentheo Nathaniel Noval', type: 'Overdue', typeLabel: 'Overdue', category: null, incidentId: null, title: '1984',
    reason: '14 hourly unit(s) at PHP 2.00', assessed: 28, paid: 0, adjusted: 0,
    balance: 28, status: 'Unpaid', occurredAt: '2026-08-25T13:56:25.000Z',
    updatedAt: '2026-08-25T13:56:25.000Z', paymentAllowed: true, receipts: [],
  }],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
}

describe('AdminFinesPage', () => {
  it('loads all records by default so older unpaid balances remain payable', async () => {
    api.adminList.mockResolvedValue(fineList)
    api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest />)

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
      verificationCode: '8A35C0C777F102AB',
      student: { userId: 7, schoolId: '02000871654', name: 'Buentheo Nathaniel Noval' },
      amountReceived: 14, paymentMethod: 'Cash', receivedBy: 'Library Admin', receivedAt: '2026-09-03T08:00:00.000Z', status: 'Issued',
      reversedBy: null, reversedAt: null, reversalReason: null, notes: null,
      allocations: [{ fineId: 2, lostBookReportId: null, type: 'Overdue', title: '1984', assessed: 28, paid: 14, balanceBefore: 28, balanceAfter: 14 }],
    })
    render(<AdminFinesPageUnderTest />)

    fireEvent.click(await screen.findByRole('button', { name: 'Adjust' }))
    fireEvent.change(screen.getByLabelText('Cash amount paid'), { target: { value: '14' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))

    await waitFor(() => expect(api.pay).toHaveBeenCalledWith(expect.objectContaining({ allocations: [{ fineId: 2, amount: 14 }] })))
    expect(api.adjust).not.toHaveBeenCalled()
    expect(await screen.findByText('Payment record OR-20260903-000012')).toBeTruthy()
    expect(screen.getByText(/Remaining.*₱14\.00/)).toBeTruthy()
  })

  it('refreshes verified payment status on focus and removes settled actions without losing a draft', async () => {
    api.adminList.mockResolvedValue(fineList)
    api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cash payment' }))
    const amount = screen.getByLabelText('Amount received') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '12' } })
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(api.adminList).toHaveBeenCalledTimes(2))
    expect(amount.value).toBe('12')
    api.adminList.mockResolvedValue({ ...fineList, items: [{ ...fineList.items[0], balance: 0, paid: 28, status: 'Paid', paymentAllowed: false }] })
    window.dispatchEvent(new Event('library-payments-updated'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cash payment' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Record cash payment' })).toBeNull()
  })

  it('records a waiver without creating a cash receipt', async () => {
    api.adminList.mockResolvedValue(fineList)
    api.adminTerms.mockResolvedValue([])
    api.adjust.mockResolvedValue({})
    render(<AdminFinesPageUnderTest />)

    fireEvent.click(await screen.findByRole('button', { name: 'Adjust' }))
    fireEvent.change(screen.getByLabelText('Adjustment type'), { target: { value: 'Waiver' } })
    fireEvent.change(screen.getByLabelText('Mandatory audit reason'), { target: { value: 'Approved by the head librarian.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record waiver' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))

    await waitFor(() => expect(api.adjust).toHaveBeenCalledWith(2, { type: 'Waiver', reason: 'Approved by the head librarian.' }))
    expect(api.pay).not.toHaveBeenCalled()
  })

  it('keeps the audit reason editable and shows adjustment errors inside the form', async () => {
    api.adminList.mockResolvedValue(fineList)
    api.adminTerms.mockResolvedValue([])
    api.adjust.mockRejectedValue(new Error('The adjustment could not be saved.'))
    render(<AdminFinesPageUnderTest />)

    fireEvent.click(await screen.findByRole('button', { name: 'Adjust' }))
    fireEvent.change(screen.getByLabelText('Adjustment type'), { target: { value: 'Waiver' } })
    const reason = screen.getByLabelText('Mandatory audit reason') as HTMLTextAreaElement
    fireEvent.change(reason, { target: { value: 'Approved by the head librarian.' } })
    expect(reason.value).toBe('Approved by the head librarian.')
    fireEvent.click(screen.getByRole('button', { name: 'Record waiver' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
    expect(await screen.findByText('The adjustment could not be saved.')).toBeTruthy()
    expect(reason.value).toBe('Approved by the head librarian.')
  })

  it('shows cash-payment errors in the form and reuses the same payment key on retry', async () => {
    api.adminList.mockResolvedValue(fineList)
    api.adminTerms.mockResolvedValue([])
    api.pay.mockRejectedValueOnce(new Error('Payment response was interrupted.')).mockResolvedValueOnce({
      receiptId: 12, receiptNumber: 'OR-20260903-000012', requestKey: 'retry-key',
      verificationCode: '8A35C0C777F102AB',
      student: { userId: 7, schoolId: '02000871654', name: 'Buentheo Nathaniel Noval' },
      amountReceived: 28, paymentMethod: 'Cash', receivedBy: 'Library Admin', receivedAt: '2026-09-03T08:00:00.000Z', status: 'Issued',
      reversedBy: null, reversedAt: null, reversalReason: null, notes: null, allocations: [],
    })
    render(<AdminFinesPageUnderTest />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cash payment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record cash payment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
    expect(await screen.findByText('Payment response was interrupted.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Record cash payment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
    await waitFor(() => expect(api.pay).toHaveBeenCalledTimes(2))
    expect(api.pay.mock.calls[0][0].requestKey).toBe(api.pay.mock.calls[1][0].requestKey)
  })

  it('shows receipt verification data, searches it, and opens the full receipt', async () => {
    const reference = { receiptId: 8, receiptNumber: 'OR-20260904-000008', verificationCode: '428FC7C836DCC645', status: 'Issued' }
    const listWithReceipt = { ...fineList, items: [{ ...fineList.items[0], paid: 28, balance: 0, status: 'Paid', paymentAllowed: false, receipts: [reference] }] }
    const detail = {
      receiptId: 8, receiptNumber: reference.receiptNumber, verificationCode: reference.verificationCode, requestKey: 'cash-8',
      student: { userId: 7, schoolId: '02000871654', name: 'Buentheo Nathaniel Noval' }, amountReceived: 28,
      paymentMethod: 'Cash', receivedBy: 'Library Admin', receivedAt: '2026-09-04T14:37:00.000Z', status: 'Issued',
      reversedBy: null, reversedAt: null, reversalReason: null, notes: null,
      allocations: [{ fineId: 2, lostBookReportId: null, type: 'Overdue', title: '1984', assessed: 28, paid: 28, balanceBefore: 28, balanceAfter: 0 }],
    }
    api.adminList.mockResolvedValue(listWithReceipt);api.adminTerms.mockResolvedValue([]);api.receipt.mockResolvedValue(detail)
    render(<AdminFinesPageUnderTest />)

    expect(await screen.findByText(reference.receiptNumber)).toBeTruthy()
    expect(screen.getByText(reference.verificationCode)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search fines and receipts'), { target: { value: reference.verificationCode } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(api.adminList).toHaveBeenLastCalledWith(expect.objectContaining({ search: reference.verificationCode })))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(reference.receiptNumber) }))
    await waitFor(() => expect(api.receipt).toHaveBeenCalledWith(8,true))
    expect(await screen.findByText(`Payment record ${reference.receiptNumber}`)).toBeTruthy()
  })

  it('reverses a cash receipt through an in-modal form without window.prompt', async () => {
    const reference = { receiptId: 8, receiptNumber: 'OR-20260904-000008', verificationCode: '428FC7C836DCC645', status: 'Issued' }
    const listWithReceipt = { ...fineList, items: [{ ...fineList.items[0], paid: 28, balance: 0, status: 'Paid', paymentAllowed: false, receipts: [reference] }] }
    const detail = {
      receiptId: 8, receiptNumber: reference.receiptNumber, verificationCode: reference.verificationCode, requestKey: 'cash-8',
      student: { userId: 7, schoolId: '02000871654', name: 'Buentheo Nathaniel Noval' }, amountReceived: 28,
      paymentMethod: 'Cash', receivedBy: 'Library Admin', receivedAt: '2026-09-04T14:37:00.000Z', status: 'Issued',
      reversedBy: null, reversedAt: null, reversalReason: null, notes: null, allocations: [],
    }
    api.adminList.mockResolvedValue(listWithReceipt)
    api.adminTerms.mockResolvedValue([])
    api.receipt.mockResolvedValue(detail)
    api.reverse.mockResolvedValue({ ...detail, status: 'Reversed' })
    render(<AdminFinesPageUnderTest />)

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(reference.receiptNumber) }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reverse receipt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reversal' }))
    expect(api.reverse).not.toHaveBeenCalled()
    expect(screen.getByText(/at least 5 characters/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Reason for reversing this cash receipt/i), { target: { value: 'Cashier posted to wrong student' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reversal' }))
    await waitFor(() => expect(api.reverse).toHaveBeenCalledWith(8, 'Cashier posted to wrong student'))
  })
})

describe('AdminFinesPage tabs and filters', () => {
  const violationFine = { ...fineList.items[0], id: 'F-9', fineId: 9, type: 'Infraction', typeLabel: 'Violation · Noise', category: 'Noise', incidentId: 5, title: 'Noise', reason: 'Loud conversation in the reading area' }

  it('keeps only Online payments in the header; Refresh and Export belong to the Fines & charges tab', async () => {
    api.adminList.mockResolvedValue(fineList); api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest />)
    await screen.findByText('Buentheo Nathaniel Noval')
    expect(screen.getByRole('link', { name: 'Online payments' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Export filtered PDF/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('tab', { name: 'Violations' }))
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Export filtered PDF/ })).toBeNull()
  })

  it('uses a real tablist with one-line captions and keeps the tab in the address', async () => {
    api.adminList.mockResolvedValue(fineList); api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest />)
    const list = screen.getByRole('tablist', { name: 'Fines management views' })
    expect(within(list).getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Fines & charges', 'Urgent alerts', 'Violations', 'Service charges'])
    expect(screen.getByRole('tab', { name: 'Fines & charges' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Overdue fines are added automatically. Record cash payments and adjustments here.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Service charges' }))
    expect(screen.getByTestId('where').textContent).toBe('?tab=service-charges')
    expect(screen.getByText('Service tab body')).toBeTruthy()
    expect(screen.getByText('Other one-off services. Separate from printing and fines.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Fines & charges' }))
    expect(screen.getByTestId('where').textContent).toBe('')
  })

  it('moves between tabs with arrow keys, Home and End without piling up history entries', async () => {
    api.adminList.mockResolvedValue(fineList); api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest />)
    const first = screen.getByRole('tab', { name: 'Fines & charges' })
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getByTestId('where').textContent).toBe('?tab=urgent')
    expect(screen.getByTestId('nav').textContent).toBe('REPLACE')
    fireEvent.keyDown(screen.getByRole('tab', { name: /Urgent alerts/ }), { key: 'End' })
    expect(screen.getByTestId('where').textContent).toBe('?tab=service-charges')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Service charges' }), { key: 'ArrowRight' })
    expect(screen.getByTestId('where').textContent).toBe('')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Fines & charges' }), { key: 'ArrowLeft' })
    expect(screen.getByTestId('where').textContent).toBe('?tab=service-charges')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Service charges' }), { key: 'Home' })
    expect(screen.getByTestId('where').textContent).toBe('')
  })

  it('opens the tab named in the address and passes a linked violation record to it', async () => {
    api.adminList.mockResolvedValue(fineList); api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest at="/librarian/fines?tab=violations&incident=5" />)
    expect(screen.getByRole('tab', { name: 'Violations' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Violations tab body 5')).toBeTruthy()
    expect(screen.getByText('Record library conduct. Warnings and fines follow Library setup → Violation rules.')).toBeTruthy()
  })

  it('falls back to Fines & charges for an unknown tab', async () => {
    api.adminList.mockResolvedValue(fineList); api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest at="/librarian/fines?tab=nope" />)
    expect(screen.getByRole('tab', { name: 'Fines & charges' }).getAttribute('aria-selected')).toBe('true')
  })

  it('shows how many urgent cases need follow-up on the tab', async () => {
    api.adminList.mockResolvedValue(fineList); api.adminTerms.mockResolvedValue([]); api.urgentCaseCount.mockResolvedValue(3)
    render(<AdminFinesPageUnderTest />)
    expect(await screen.findByLabelText('3 urgent cases')).toBeTruthy()
  })

  it('shows at most four summary cards (Waived is a status filter, not a card)', async () => {
    api.adminList.mockResolvedValue(fineList); api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest />)
    await screen.findByText('Buentheo Nathaniel Noval')
    for (const label of ['Assessed', 'Outstanding', 'Collected', 'Accounts with balance']) expect(screen.getByText(label, { selector: 'p' })).toBeTruthy()
    expect(screen.queryByText('Waived', { selector: 'p' })).toBeNull()
    expect(within(screen.getByLabelText('Fine status')).getByRole('option', { name: 'Waived' })).toBeTruthy()
  })

  it('builds the fine type filter from the server list, grouped, and sends type with category', async () => {
    api.adminList.mockResolvedValue(fineList); api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest />)
    await screen.findByText('Buentheo Nathaniel Noval')
    const select = screen.getByLabelText('Fine type')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Old rule (retired)' })).toBeTruthy())
    expect(within(select).getAllByRole('group').map(group => group.getAttribute('label'))).toEqual(['Borrowing', 'Violations'])
    expect(within(select).getByRole('option', { name: 'Damage replacement' })).toBeTruthy()
    fireEvent.change(select, { target: { value: 'Infraction::Noise' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(api.adminList).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'Infraction', category: 'Noise' })))
    fireEvent.change(select, { target: { value: 'Infraction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(api.adminList).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'Infraction', category: undefined })))
  })

  it('labels a violation fine by category and links to its violation record', async () => {
    api.adminList.mockResolvedValue({ ...fineList, items: [violationFine] }); api.adminTerms.mockResolvedValue([])
    render(<AdminFinesPageUnderTest />)
    expect(await screen.findByText('Violation · Noise')).toBeTruthy()
    expect(screen.queryByText('Infraction')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View violation' }))
    expect(screen.getByTestId('where').textContent).toBe('?tab=violations&incident=5')
    expect(screen.getByText('Violations tab body 5')).toBeTruthy()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
