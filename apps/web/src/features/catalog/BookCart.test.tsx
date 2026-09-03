import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookCart } from './BookCart'
import { clearBookCartForTests, useBookCart } from './book-cart-store'

const api = vi.hoisted(() => ({ submitBorrowRequest: vi.fn() }))
const catalogApi = vi.hoisted(() => ({ fetchBookOverview: vi.fn(), fetchCatalogCopyAsset: vi.fn() }))
vi.mock('./book-cart-api', () => ({ submitBorrowRequest: api.submitBorrowRequest }))
vi.mock('./book-catalog-api', () => catalogApi)
vi.mock('./AssetCodeCanvas', () => ({ AssetCodeCanvas: ({ testId }: { testId?: string }) => <canvas data-testid={testId} /> }))

function AddFixture() {
  const { addItem } = useBookCart()
  return <button onClick={() => addItem({ titleId: 4, title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', shelfLocation: 'Shelf A-1', callNumber: 'QA76', previewBarcode: 'STIORMOC2026000142', coverImagePath: '/api/assets/covers/clean-code.png' })}>Add fixture</button>
}

describe('BookCart', () => {
  it('disables checkout when empty and removes a selected row locally', async () => {
    render(<><AddFixture /><BookCart /></>)
    expect((screen.getByRole('button', { name: 'Submit Borrow Request' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add fixture' }))
    expect(await screen.findByText('Clean Code')).toBeTruthy()
    expect(screen.getAllByAltText('Clean Code cover').some((image) => (image as HTMLImageElement).src.includes('/api/assets/covers/clean-code.png'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Clean Code' }))
    expect(screen.queryByText('Clean Code')).toBeNull()
    expect((screen.getByRole('button', { name: 'Submit Borrow Request' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('submits title IDs, clears the cart, and shows counter-claim instructions', async () => {
    api.submitBorrowRequest.mockResolvedValue({ requestGroupId: 'group-1', status: 'pending_claim', instructions: 'Go to the library to claim and confirm books.', items: [] })
    render(<><AddFixture /><BookCart /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Add fixture' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Borrow Request' }))
    await waitFor(() => expect(api.submitBorrowRequest).toHaveBeenCalledWith([4]))
    expect(await screen.findByText('Go to the library to claim and confirm books.')).toBeTruthy()
    expect(screen.getByText('Your cart is empty')).toBeTruthy()
  })

  it('shows a student barcode in cart details without rendering any QR asset', async () => {
    catalogApi.fetchBookOverview.mockResolvedValue({
      titleId: 4, title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', publisher: 'Prentice Hall', publicationYear: 2008,
      categoryId: 1, categoryName: 'Programming', callNumber: 'QA76', shelfLocation: 'Shelf A-1', currentAvailabilityStatus: 'Available',
      totalCopiesCount: 1, availableCopiesCount: 1, reservableMaterialId: 5, previewBarcode: 'STIORMOC2026000142', coverImagePath: '/api/assets/covers/clean-code.png',
    })
    catalogApi.fetchCatalogCopyAsset.mockResolvedValue({
      physicalCopyId: 21, titleId: 4, title: 'Clean Code', author: 'Robert C. Martin',
      accessionNumber: 'STI-ACC-2026-000142', barcode: 'STIORMOC2026000142', shelfLocation: 'Shelf A-1',
      conditionStatus: 'Damaged',
      barcodeImageData: 'data:image/svg+xml;base64,barcode',
    })
    render(<><AddFixture /><BookCart /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Add fixture' }))
    fireEvent.click(await screen.findByRole('button', { name: 'View details' }))
    expect(await screen.findByTestId('book-detail-barcode')).toBeTruthy()
    expect(screen.getByText('Damaged')).toBeTruthy()
    expect(screen.getAllByAltText('Clean Code cover').some((image) => (image as HTMLImageElement).src.includes('/api/assets/covers/clean-code.png'))).toBe(true)
    expect(screen.queryByTestId('cart-qr-code')).toBeNull()
    expect(screen.queryByText('QR code')).toBeNull()
  })
})

afterEach(() => { cleanup(); clearBookCartForTests(); vi.clearAllMocks() })
