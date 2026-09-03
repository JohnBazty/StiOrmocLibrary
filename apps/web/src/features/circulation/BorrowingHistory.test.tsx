import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BorrowingHistory } from './BorrowingHistory'

const api = vi.hoisted(() => ({ history: vi.fn(), cancelRequest: vi.fn() }))
const catalogApi = vi.hoisted(() => ({ fetchBookOverview: vi.fn(), fetchCatalogCopyAsset: vi.fn() }))
vi.mock('./circulation-api', () => ({ circulationApi: api }))
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
    expect(await screen.findByText('Clean Code')).toBeTruthy()
    expect(screen.getAllByAltText('Clean Code cover').some((image) => (image as HTMLImageElement).src.includes('/api/assets/covers/clean-code.png'))).toBe(true)
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(screen.getByText('Due: 8:59 AM')).toBeTruthy()
    expect(screen.getByText('Borrowed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View details' })).toBeTruthy()
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
    fireEvent.click(await screen.findByRole('button', { name: 'View details' }))
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
    expect(await screen.findByText('Clean Code')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel request' }).at(-1)!)
    await waitFor(() => expect(api.cancelRequest).toHaveBeenCalledWith(12, ''))
    expect(await screen.findByText('Clean Code request was cancelled and its copy is available again.')).toBeTruthy()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
