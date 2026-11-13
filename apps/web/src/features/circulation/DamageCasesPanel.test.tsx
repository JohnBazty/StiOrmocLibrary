import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DamageCasesPanel } from './DamageCasesPanel'

const api = vi.hoisted(() => ({ listCases: vi.fn(), getCase: vi.fn(), addCaseNote: vi.fn(), recordCaseDisposition: vi.fn(), closeCase: vi.fn(), reopenCase: vi.fn() }))
const identity = vi.hoisted(() => ({ role: 'Librarian' }))
vi.mock('./circulation-api', () => ({ circulationApi: api }))
vi.mock('../auth/auth-storage', () => ({ getCurrentIdentity: () => ({ role: identity.role }) }))

const listItem = { caseId: 4, caseType: 'Damage', transactionId: 900, status: 'Open', openedAt: '2026-11-12T09:00:00', title: 'Clean Code', barcode: 'BOOK-50', borrowerName: 'Borrower Seven', borrowerSchoolId: 'STI-7', summary: 'Water damage', lostBookReportId: null }
function detail(overrides: { titlePrice?: number | null; status?: string } = {}) {
  return {
    case: { ...listItem, status: overrides.status ?? 'Open' },
    loan: { status: 'Returned', title: 'Clean Code', titlePrice: overrides.titlePrice === undefined ? 450 : overrides.titlePrice, barcode: 'BOOK-50', conditionStatus: 'Damaged', availabilityStatus: 'Unavailable', borrowerName: 'Borrower Seven', borrowerSchoolId: 'STI-7', replacementCharge: null, replacementPaymentStatus: null },
    events: [{ eventId: 1, eventType: 'Opened', actorName: 'Staff Three', notes: 'Water damage on pages 10-40.', reason: null, createdAt: '2026-11-12T09:00:00' }],
  }
}

beforeEach(() => {
  identity.role = 'Librarian'
  api.listCases.mockResolvedValue({ items: [listItem], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } })
  api.getCase.mockResolvedValue(detail())
})
afterEach(() => { cleanup(); vi.resetAllMocks() })

async function openReview() {
  render(<DamageCasesPanel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Review Clean Code' }))
  return screen.findByRole('region', { name: 'Damage case 4' })
}

describe('DamageCasesPanel', () => {
  it('lists cases and shows the book price and timeline on review', async () => {
    const region = await openReview()
    expect(api.getCase).toHaveBeenCalledWith(4)
    expect(within(region).getByText('Book price: PHP 450.00')).toBeTruthy()
    expect(within(region).getByText(/Water damage on pages 10-40/)).toBeTruthy()
  })

  it('filters the worklist by status', async () => {
    render(<DamageCasesPanel />)
    await screen.findByText('Clean Code')
    fireEvent.change(screen.getByLabelText('Case status'), { target: { value: 'Resolved' } })
    await waitFor(() => expect(api.listCases).toHaveBeenLastCalledWith('Resolved', 1))
  })

  it('lets a librarian write the copy off and charge the book price', async () => {
    api.recordCaseDisposition.mockResolvedValue(detail())
    const region = await openReview()
    fireEvent.change(within(region).getByLabelText('Decision'), { target: { value: 'lost' } })
    expect(within(region).queryByLabelText('Replacement charge (PHP)')).toBeNull()
    expect(within(region).getByText(/charged the book price, PHP 450.00/)).toBeTruthy()
    fireEvent.change(within(region).getByLabelText('Decision reason'), { target: { value: 'Pages torn out.' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Record decision' }))
    expect(api.recordCaseDisposition).not.toHaveBeenCalled()
    expect(within(region).getByText('Write off BOOK-50 and charge Borrower Seven PHP 450.00?')).toBeTruthy()
    fireEvent.click(within(region).getByRole('button', { name: 'Back' }))
    expect(within(region).queryByRole('button', { name: 'Confirm write-off' })).toBeNull()
    fireEvent.click(within(region).getByRole('button', { name: 'Record decision' }))
    fireEvent.click(within(region).getByRole('button', { name: 'Confirm write-off' }))
    await waitFor(() => expect(api.recordCaseDisposition).toHaveBeenCalledWith(4, { disposition: 'lost', reason: 'Pages torn out.' }))
    expect(await screen.findByText('Decision recorded.')).toBeTruthy()
  })

  it('reloads the case after a failed decision so a changed book price is shown', async () => {
    api.recordCaseDisposition.mockRejectedValue(new Error('The charge must equal the book price, PHP 500.00.'))
    const region = await openReview()
    api.getCase.mockResolvedValue(detail({ titlePrice: 500 }))
    fireEvent.change(within(region).getByLabelText('Decision reason'), { target: { value: 'Still damaged.' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Record decision' }))
    expect(await within(region).findByText('Book price: PHP 500.00')).toBeTruthy()
    expect(within(region).getByRole('alert').textContent).toContain('PHP 500.00')
  })

  it('ignores an older worklist response that arrives after a newer filter', async () => {
    let resolveOld: (value: unknown) => void = () => {}
    api.listCases.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce({ items: [{ ...listItem, caseId: 9, title: 'Newer Book' }], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } })
    render(<DamageCasesPanel />)
    fireEvent.change(screen.getByLabelText('Case status'), { target: { value: 'Resolved' } })
    expect(await screen.findByText('Newer Book')).toBeTruthy()
    resolveOld({ items: [listItem], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByText('Clean Code')).toBeNull()
  })

  it('asks for a charge when the title has no book price', async () => {
    api.getCase.mockResolvedValue(detail({ titlePrice: null }))
    api.recordCaseDisposition.mockResolvedValue(detail({ titlePrice: null }))
    const region = await openReview()
    fireEvent.change(within(region).getByLabelText('Decision'), { target: { value: 'lost' } })
    fireEvent.change(within(region).getByLabelText('Decision reason'), { target: { value: 'Spine broken.' } })
    fireEvent.change(within(region).getByLabelText('Replacement charge (PHP)'), { target: { value: '300' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Record decision' }))
    fireEvent.click(within(region).getByRole('button', { name: 'Confirm write-off' }))
    await waitFor(() => expect(api.recordCaseDisposition).toHaveBeenCalledWith(4, { disposition: 'lost', reason: 'Spine broken.', replacementCharge: 300 }))
  })

  it('shows server errors and does not send a decision without a reason', async () => {
    api.recordCaseDisposition.mockRejectedValue(new Error('A lost-book charge already exists for this loan.'))
    const region = await openReview()
    fireEvent.click(within(region).getByRole('button', { name: 'Record decision' }))
    expect(api.recordCaseDisposition).not.toHaveBeenCalled()
    fireEvent.change(within(region).getByLabelText('Decision reason'), { target: { value: 'Pages torn out.' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Record decision' }))
    expect((await within(region).findByRole('alert')).textContent).toContain('already exists')
  })

  it('lets desk staff add notes but not decide or close', async () => {
    identity.role = 'Staff'
    api.addCaseNote.mockResolvedValue(detail({ status: 'Under Investigation' }))
    const region = await openReview()
    expect(within(region).queryByRole('button', { name: 'Record decision' })).toBeNull()
    expect(within(region).queryByRole('button', { name: 'Resolve' })).toBeNull()
    fireEvent.change(within(region).getByLabelText('Note'), { target: { value: 'Borrower says it was wet on checkout.' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(api.addCaseNote).toHaveBeenCalledWith(4, 'Borrower says it was wet on checkout.'))
  })

  it('resolves with a reason and offers reopen on a closed case', async () => {
    api.closeCase.mockResolvedValue(detail({ status: 'Resolved' }))
    const region = await openReview()
    fireEvent.change(within(region).getByLabelText('Closing reason'), { target: { value: 'Charged and settled.' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(api.closeCase).toHaveBeenCalledWith(4, 'resolve', 'Charged and settled.'))
    expect(await within(region).findByRole('button', { name: 'Reopen' })).toBeTruthy()
  })
})

it('shows long-overdue follow-ups without offering damaged-book write-off controls',async()=>{
 api.listCases.mockResolvedValue({items:[{...listItem,caseType:'Long Overdue'}],pagination:{page:1,limit:25,total:1,totalPages:1}})
 api.getCase.mockResolvedValue({...detail(),case:{...detail().case,caseType:'Long Overdue'}})
 render(<DamageCasesPanel/>)
 fireEvent.click(await screen.findByRole('button',{name:'Review Clean Code'}))
 expect(await screen.findByRole('button',{name:'Add note'})).toBeTruthy()
 expect(screen.queryByLabelText('Decision')).toBeNull()
})

it('refreshes an open review after a return event and preserves an unsaved note', async () => {
 const region=await openReview()
 fireEvent.change(within(region).getByLabelText('Note'),{target:{value:'Unsaved investigation note'}})
 api.getCase.mockResolvedValue(detail({status:'Under Investigation'}))
 fireEvent(window,new Event('smartlib:circulation-updated'))
 await waitFor(()=>expect(api.getCase).toHaveBeenCalledTimes(2))
 expect((within(region).getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Unsaved investigation note')
 api.listCases.mockResolvedValue({items:[{...listItem,status:'Resolved'}],pagination:{page:1,limit:50,total:1,totalPages:1}})
 api.getCase.mockResolvedValue(detail({status:'Resolved'}))
 fireEvent(window,new Event('smartlib:circulation-updated'))
 expect(await within(region).findByRole('button',{name:'Reopen'})).toBeTruthy()
 expect(within(region).queryByRole('button',{name:'Record decision'})).toBeNull()
})

it('opens subsequent pages and refreshes the selected page', async () => {
 api.listCases.mockResolvedValue({items:[listItem],pagination:{page:1,limit:50,total:51,totalPages:2}})
 render(<DamageCasesPanel/>)
 fireEvent.click(await screen.findByRole('button',{name:'Next follow-ups'}))
 await waitFor(()=>expect(api.listCases).toHaveBeenLastCalledWith('all',2))
 fireEvent.click(screen.getByRole('button',{name:'Refresh follow-ups'}))
 await waitFor(()=>expect(api.listCases).toHaveBeenLastCalledWith('all',2))
})
