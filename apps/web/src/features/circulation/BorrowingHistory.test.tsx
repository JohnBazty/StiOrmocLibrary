import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BorrowingHistory } from './BorrowingHistory'

const api = vi.hoisted(() => ({ history: vi.fn(), cancelRequest: vi.fn(), preflightRenewal: vi.fn(), submitRenewal: vi.fn() }))
const clearance = vi.hoisted(() => ({ reportLost: vi.fn() }))
const catalogApi = vi.hoisted(() => ({ fetchBookOverview: vi.fn(), fetchCatalogCopyAsset: vi.fn() }))
vi.mock('./circulation-api', () => ({ circulationApi: api }))
vi.mock('../clearance/clearance-api', () => ({ clearanceApi: clearance }))
vi.mock('../catalog/book-catalog-api', () => catalogApi)
vi.mock('../catalog/AssetCodeCanvas', () => ({ AssetCodeCanvas: ({ testId }: { testId?: string }) => <canvas data-testid={testId} /> }))

describe('BorrowingHistory', () => {
  it('renders the live student capacity, due cutoff, and transaction lifecycle', async () => {
    api.history.mockResolvedValue({
      summary: { role: 'Student', activeLoans: 1, activeReservations: 0, activeStackCount: 1, loanLimit: 2, remainingLoanSlots: 1, nextDueAt: '2026-08-24T08:59:00', dueCutoffLabel: '8:59 AM' },
      items: [{ transactionId: 1, titleId: 5, title: 'Clean Code', author: 'Robert C. Martin', coverImagePath: '/api/assets/covers/clean-code.png', accessionNumber: 'ACC-1', barcode: 'BOOK-1', borrowDate: '2026-08-23T10:00:00', dueDate: '2026-08-24T08:59:00', returnDate: null, status: 'Borrowed' }],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    })
    render(<BorrowingHistory />)
    expect((await screen.findAllByText('Clean Code')).length).toBeGreaterThan(0)
    expect(screen.getAllByAltText('Clean Code cover').some((image) => (image as HTMLImageElement).src.includes('/api/assets/covers/clean-code.png'))).toBe(true)
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(screen.getByText('Due: 8:59 AM')).toBeTruthy()
    expect(screen.getAllByText('Borrowed').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'View details' }).length).toBeGreaterThan(0)
  })

  it('shows the saved cover in borrowing-history book details', async () => {
    api.history.mockResolvedValue({
      summary: { role: 'Student', activeLoans: 1, activeReservations: 0, activeStackCount: 1, loanLimit: 2, remainingLoanSlots: 1, nextDueAt: null, dueCutoffLabel: '8:59 AM' },
      items: [{ transactionId: 1, titleId: 5, title: 'Clean Code', author: 'Robert C. Martin', coverImagePath: '/api/assets/covers/clean-code.png', accessionNumber: 'ACC-1', barcode: 'BOOK-1', borrowDate: '2026-08-23T10:00:00', dueDate: '2026-08-24T08:59:00', returnDate: null, status: 'Borrowed' }],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    })
    catalogApi.fetchBookOverview.mockResolvedValue({
      titleId: 5, title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', publisher: 'Prentice Hall', publicationYear: 2008,
      categoryId: 1, categoryName: 'Programming', callNumber: 'QA76', shelfLocation: 'Shelf A-1', currentAvailabilityStatus: 'Borrowed',
      totalCopiesCount: 1, availableCopiesCount: 0, reservableMaterialId: 5, previewBarcode: 'BOOK-1', coverImagePath: '/api/assets/covers/clean-code.png',
    })
    catalogApi.fetchCatalogCopyAsset.mockResolvedValue({
      physicalCopyId: 21, titleId: 5, title: 'Clean Code', author: 'Robert C. Martin', accessionNumber: 'ACC-1', barcode: 'BOOK-1', shelfLocation: 'Shelf A-1', conditionStatus: 'For Repair', barcodeImageData: 'data:image/svg+xml;base64,barcode',
    })
    render(<BorrowingHistory />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'View details' }))[0]!)
    expect(await screen.findByTestId('book-detail-barcode')).toBeTruthy()
    expect(screen.getByText('For Repair')).toBeTruthy()
    expect(screen.getAllByAltText('Clean Code cover').some((image) => (image as HTMLImageElement).src.includes('/api/assets/covers/clean-code.png'))).toBe(true)
  })

  it('lets the student confirm cancellation and synchronizes history without reloading the page', async () => {
    const pending = {
      summary: { role: 'Student', activeLoans: 1, activeReservations: 0, activeStackCount: 1, loanLimit: 2, remainingLoanSlots: 1, nextDueAt: null, dueCutoffLabel: '8:59 AM' },
      items: [{ transactionId: 12, titleId: 5, title: 'Clean Code', author: 'Robert C. Martin', coverImagePath: null, accessionNumber: 'ACC-1', barcode: 'BOOK-1', borrowDate: null, dueDate: null, returnDate: null, status: 'Pending' }],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    }
    api.history.mockResolvedValue(pending)
    api.cancelRequest.mockResolvedValue({ transactionId: 12, status: 'Cancelled', copyAvailability: 'Available' })
    render(<BorrowingHistory />)
    expect((await screen.findAllByText('Clean Code')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel request' })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel request' }).at(-1)!)
    await waitFor(() => expect(api.cancelRequest).toHaveBeenCalledWith(12, ''))
    expect(await screen.findByText('Clean Code request was cancelled and its copy is available again.')).toBeTruthy()
  })

  it('submits a lost report through an in-page confirmation and shows the result', async () => {
    api.history.mockResolvedValue({
      summary: { role: 'Student', activeLoans: 1, activeReservations: 0, activeStackCount: 1, loanLimit: 2, remainingLoanSlots: 1, nextDueAt: null, dueCutoffLabel: '8:59 AM' },
      items: [{ transactionId: 21, titleId: 5, title: 'Clean Code', author: 'Robert C. Martin', coverImagePath: null, accessionNumber: 'ACC-1', barcode: 'BOOK-1', borrowDate: '2026-08-23T10:00:00', dueDate: '2026-08-24T08:59:00', returnDate: null, status: 'Borrowed', lostReportStatus: null }],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    })
    clearance.reportLost.mockResolvedValue({ lostBookReportId: 3, status: 'Pending' })
    render(<BorrowingHistory />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Report lost' }))[0]!)
    expect(screen.getByRole('dialog', { name: 'Report this book as lost?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Submit lost report' }))
    await waitFor(() => expect(clearance.reportLost).toHaveBeenCalledWith(21))
    expect(await screen.findByText('Clean Code was reported lost. Library staff have been notified.')).toBeTruthy()
  })

  it('renews an eligible loan with one stable request key and refreshes history', async () => {
    api.history.mockResolvedValue({
      summary: { role: 'Student', activeLoans: 1, activeReservations: 0, activeStackCount: 1, loanLimit: 2, remainingLoanSlots: 1, nextDueAt: '2026-10-11T08:59:00', dueCutoffLabel: '8:59 AM' },
      items: [{
        transactionId: 31, titleId: 5, title: 'Clean Code', author: 'Robert C. Martin', coverImagePath: null, accessionNumber: 'ACC-1', barcode: 'BOOK-1',
        borrowDate: '2026-10-10T10:00:00', initialDueAt: '2026-10-11T08:59:00', dueDate: '2026-10-11T08:59:00', returnDate: null,
        status: 'Borrowed', lostReportStatus: null, renewalCount: 0, maxRenewals: 1, remainingRenewals: 1, lastRenewalStatus: null,
        lastRenewalDecisionSummary: null, lastRenewalAt: null, lastRenewalDecisionSource: null, canRequestRenewal: true,
      }],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    })
    api.preflightRenewal.mockResolvedValue({
      transactionId: 31, currentDueAt: '2026-10-11T08:59:00', proposedDueAt: '2026-10-12T08:59:00',
      renewalCount: 0, maxRenewals: 1, remainingRenewals: 1, policyVersionId: 4, blockers: [], canRequestRenewal: true,
    })
    api.submitRenewal
      .mockRejectedValueOnce(new Error('Temporary connection problem.'))
      .mockResolvedValue({
        renewalRequestId: 8, requestKey: 'returned-key', transactionId: 31, status: 'Approved', decisionCode: 'RENEWAL_APPROVED',
        decisionSummary: 'The loan was renewed successfully.', decisionSource: 'System', staffNote: null,
        previousDueAt: '2026-10-11T08:59:00', newDueAt: '2026-10-12T08:59:00', renewalNumber: 1, maxRenewals: 1,
        remainingRenewals: 0, policyVersionId: 4, requestedAt: '2026-10-10T10:00:00', decidedAt: '2026-10-10T10:00:00',
        blockers: [], idempotent: false,
      })
    render(<BorrowingHistory />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Request renewal' }))[0]!)
    expect(await screen.findByText('Proposed due')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm renewal' }))
    expect(await screen.findByText('Temporary connection problem.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm renewal' }))
    await waitFor(() => expect(api.submitRenewal).toHaveBeenCalledTimes(2))
    expect(api.submitRenewal.mock.calls[0]?.[1]).toBe(api.submitRenewal.mock.calls[1]?.[1])
    expect(await screen.findByText(/Clean Code was renewed until/)).toBeTruthy()
    expect(api.history.mock.calls.length).toBeGreaterThan(1)
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
