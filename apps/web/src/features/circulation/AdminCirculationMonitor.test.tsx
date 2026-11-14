import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminCirculationMonitor } from './AdminCirculationMonitor'

const reservations=vi.hoisted(()=>({adjustStatus:vi.fn()}))
vi.mock('./DamageCasesPanel', () => ({ DamageCasesPanel: () => null }))
vi.mock('../reservations/reservation-api',()=>({reservationApi:reservations}))
const api = vi.hoisted(() => ({ monitor: vi.fn(), fulfillClaim: vi.fn(), returnBook: vi.fn(), calculatePenalty: vi.fn(), cancelRequest: vi.fn(), preflightRenewal: vi.fn(), staffRenewal: vi.fn() }))
vi.mock('./circulation-api', () => ({ circulationApi: api }))
vi.mock('../auth/auth-storage',()=>({getCurrentIdentity:()=>({role:'Librarian'})}))
vi.mock('./CirculationDesk',()=>({CirculationDesk:({returnBarcode,borrowerRequest}:any)=><div>Scan desk {returnBarcode?.value}{borrowerRequest ? ` Pickup ${borrowerRequest.reservationId ?? borrowerRequest.transactionId} loaded` : ''}</div>}))

const monitor = { summary: { pendingClaims: 0, activeLoans: 1, overdueLoans: 0, returnedToday: 0, dueToday: 1 }, items: [{ transactionId: 4, userName: 'A Student', schoolId: 'STI-4', role: 'Student', title: 'Database Systems', accessionNumber: 'ACC-4', barcode: 'BOOK-4', requestedAt: '2026-08-23T08:55:00', borrowDate: '2026-08-23T09:00:00', dueDate: '2026-08-24T08:59:00', returnDate: null, status: 'Borrowed' }], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } }

describe('AdminCirculationMonitor', () => {
  it('routes a return to the scanned preview without immediately writing',async()=>{api.monitor.mockResolvedValue(monitor);render(<AdminCirculationMonitor />);expect(await screen.findByText('Database Systems')).toBeTruthy();fireEvent.click(screen.getByText('Return book'));expect(screen.getByText('Scan desk BOOK-4')).toBeTruthy();expect(api.returnBook).not.toHaveBeenCalled()})

  it('starts guided checkout for a pending pickup', async () => {
    api.monitor.mockResolvedValue({ ...monitor, summary: { ...monitor.summary, pendingClaims: 1, activeLoans: 0 }, items: [{ ...monitor.items[0], transactionId: 9, title: 'Computer Networks', borrowDate: null, dueDate: null, status: 'Pending' }] })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Computer Networks')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start checkout' }))
    expect(screen.getByText('Scan desk Pickup 9 loaded')).toBeTruthy()
    expect(api.fulfillClaim).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('More actions'))
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeTruthy()
  })

  it('cancels a pending claim and removes it from the admin lane without a page reload', async () => {
    api.monitor.mockResolvedValue({ ...monitor, summary: { ...monitor.summary, pendingClaims: 1, activeLoans: 0 }, items: [{ ...monitor.items[0], transactionId: 9, title: 'Computer Networks', borrowDate: null, dueDate: null, status: 'Pending' }] })
    api.cancelRequest.mockResolvedValue({ transactionId: 9, status: 'Cancelled', copyAvailability: 'Available' })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Computer Networks')).toBeTruthy()
    fireEvent.click(screen.getByText('More actions'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    fireEvent.click(screen.getByRole('dialog').querySelector('footer button:last-child')!)
    await waitFor(() => expect(api.cancelRequest).toHaveBeenCalledWith(9, ''))
    expect(await screen.findByText('Computer Networks pending claim was cancelled and released.')).toBeTruthy()
  })
  it('hides Renew on behalf when canRequestRenewal is false', async () => {
    api.monitor.mockResolvedValue({ ...monitor, items: [{ ...monitor.items[0], renewalCount: 1, maxRenewals: 1, remainingRenewals: 0, canRequestRenewal: false }] })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText('Database Systems')).toBeTruthy()
    fireEvent.click(screen.getByText('More actions'))
    expect(screen.queryByRole('button', { name: /Renew on behalf/ })).toBeNull()
  })

  it('requires a staff note and renews an eligible borrowed item on behalf of the borrower', async () => {
    api.monitor.mockResolvedValue({ ...monitor, items: [{ ...monitor.items[0], initialDueAt: '2026-08-24T08:59:00', renewalCount: 0, maxRenewals: 1, remainingRenewals: 1,
      lastRenewalStatus: 'Rejected', lastRenewalDecisionSummary: 'A reservation was waiting.', lastRenewalAt: '2026-08-23T11:00:00', lastRenewalDecisionSource: 'System', canRequestRenewal: true }] })
    api.preflightRenewal.mockResolvedValue({ transactionId: 4, currentDueAt: '2026-08-24T08:59:00', proposedDueAt: '2026-08-25T08:59:00',
      renewalCount: 0, maxRenewals: 1, remainingRenewals: 1, policyVersionId: 4, blockers: [], canRequestRenewal: true })
    api.staffRenewal.mockResolvedValue({ renewalRequestId: 9, requestKey: 'staff-key', transactionId: 4, status: 'Approved', decisionCode: 'RENEWAL_APPROVED',
      decisionSummary: 'The loan was renewed successfully.', decisionSource: 'Staff', staffNote: 'Borrower requested at the circulation desk.',
      previousDueAt: '2026-08-24T08:59:00', newDueAt: '2026-08-25T08:59:00', renewalNumber: 1, maxRenewals: 1,
      remainingRenewals: 0, policyVersionId: 4, requestedAt: '2026-08-23T12:00:00', decidedAt: '2026-08-23T12:00:00', blockers: [], idempotent: false })
    render(<AdminCirculationMonitor />)
    expect(await screen.findByText(/Last renewal: System/)).toBeTruthy()
    fireEvent.click(screen.getByText('More actions'))
    fireEvent.click(screen.getByRole('button', { name: /Renew on behalf/ }))
    await waitFor(() => expect(api.preflightRenewal).toHaveBeenCalledWith(4, true))
    const confirmButton = screen.getByRole('button', { name: 'Confirm staff renewal' })
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/staff note/i), { target: { value: 'Borrower requested at the circulation desk.' } })
    fireEvent.click(confirmButton)
    await waitFor(() => expect(api.staffRenewal).toHaveBeenCalledWith(4, expect.any(String), 'Borrower requested at the circulation desk.'))
    expect(await screen.findByText(/Database Systems was renewed for A Student until/)).toBeTruthy()
  })
})

it('opens ready queue pickups without requiring a Pending loan and deduplicates old linked rows',async()=>{
 api.monitor.mockResolvedValue({...monitor,items:[{...monitor.items[0],status:'Pending',reservationId:12}],requests:[{reservationId:12,title:'Database Systems',userName:'A Student',schoolId:'STI-4',barcode:'BOOK-4',pickupDeadline:'2026-10-17T10:00:00'}]})
 render(<AdminCirculationMonitor/>);await screen.findByText('Database Systems')
 expect(screen.getAllByRole('button',{name:'Start checkout'})).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'Start checkout'}))
 expect(screen.getByText('Scan desk Pickup 12 loaded')).toBeTruthy()
 expect(api.fulfillClaim).not.toHaveBeenCalled()
})

it('sends an older linked request to preparation until it is ready instead of offering unusable checkout',async()=>{
 api.monitor.mockResolvedValue({...monitor,items:[{...monitor.items[0],status:'Pending',reservationId:12}],requests:[]})
 render(<AdminCirculationMonitor/>);await screen.findByText('Database Systems')
 expect(screen.queryByRole('button',{name:'Start checkout'})).toBeNull()
 expect(screen.getByRole('link',{name:'Prepare request'}).getAttribute('href')).toBe('/librarian/reservations')
 expect(screen.getByText('In request queue')).toBeTruthy()
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows available cart handovers at the desk with direct checkout and cancellation',async()=>{
 api.monitor.mockResolvedValue({...monitor,items:[],requests:[{requestKind:'CartHandover',reservationId:45,title:'Available cart book',userName:'A Student',schoolId:'STI-4',barcode:'BOOK-45',pickupDeadline:null}]})
 render(<AdminCirculationMonitor/>);await screen.findByText('Available cart book')
 expect(screen.getByText('Awaiting handover')).toBeTruthy()
 expect(screen.queryByRole('link',{name:'Manage reservation'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Start checkout'}))
 expect(screen.getByText('Scan desk Pickup 45 loaded')).toBeTruthy()
 reservations.adjustStatus.mockResolvedValue({})
 fireEvent.click(screen.getByRole('button',{name:'Cancel handover'}))
 await waitFor(()=>expect(reservations.adjustStatus).toHaveBeenCalledWith(45,'cancelled'))
})
