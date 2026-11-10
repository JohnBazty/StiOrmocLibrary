import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookCart } from './BookCart'
import { BookCartApiError } from './book-cart-api'
import { clearBookCartForTests, useBookCart } from './book-cart-store'

const api = vi.hoisted(() => ({ submitBorrowRequest: vi.fn(), fetchCartState: vi.fn() }))
const catalogApi = vi.hoisted(() => ({ fetchBookOverview: vi.fn(), fetchCatalogCopyAsset: vi.fn() }))
vi.mock('./book-cart-api', async (importOriginal) => ({...await importOriginal<typeof import('./book-cart-api')>(), submitBorrowRequest: api.submitBorrowRequest, fetchCartState:api.fetchCartState }))
vi.mock('./book-catalog-api', () => catalogApi)
vi.mock('./AssetCodeCanvas', () => ({ AssetCodeCanvas: ({ testId }: { testId?: string }) => <canvas data-testid={testId} /> }))

function AddFixture() {
  const { addItem } = useBookCart()
  return <button onClick={() => addItem({ titleId: 4, title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', shelfLocation: 'Shelf A-1', callNumber: 'QA76', previewBarcode: 'STIORMOC2026000142', coverImagePath: '/api/assets/covers/clean-code.png' })}>Add fixture</button>
}

describe('BookCart', () => {
  it('removes a stale checked-out selection when the cart is opened',async()=>{
    api.fetchCartState.mockResolvedValue({activeTitleIds:[4]})
    render(<><AddFixture/><BookCart/></>)
    fireEvent.click(screen.getByRole('button',{name:'Add fixture'}))
    await screen.findByText(/already requested or checked out/)
    expect(screen.queryByRole('heading',{name:'Clean Code'})).toBeNull()
    expect(screen.getByText('Your cart is empty')).toBeTruthy()
    expect(api.submitBorrowRequest).not.toHaveBeenCalled()
  })

  it('refreshes completed selections on focus but keeps unrelated selections',async()=>{
    api.fetchCartState.mockResolvedValue({activeTitleIds:[]})
    render(<><AddFixture/><BookCart/></>)
    fireEvent.click(screen.getByRole('button',{name:'Add fixture'}))
    await waitFor(()=>expect(api.fetchCartState).toHaveBeenCalled())
    api.fetchCartState.mockResolvedValue({activeTitleIds:[999]})
    fireEvent.focus(window)
    await waitFor(()=>expect(api.fetchCartState).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('heading',{name:'Clean Code'})).toBeTruthy()
    api.fetchCartState.mockResolvedValue({activeTitleIds:[4]})
    fireEvent.focus(window)
    await screen.findByText(/already requested or checked out/)
    expect(screen.getByText('Your cart is empty')).toBeTruthy()
  })

  it('keeps selections if checking current loans and requests fails',async()=>{
    api.fetchCartState.mockRejectedValue(new Error('Offline'))
    render(<><AddFixture/><BookCart/></>)
    fireEvent.click(screen.getByRole('button',{name:'Add fixture'}))
    await waitFor(()=>expect(api.fetchCartState).toHaveBeenCalled())
    expect(screen.getByRole('heading',{name:'Clean Code'})).toBeTruthy()
  })
  it('keeps a prepared cart when the server rejects submission at the active limit',async()=>{
    api.submitBorrowRequest.mockRejectedValueOnce(new BookCartApiError('The approved borrowing limit is 2 active books or requests.','STUDENT_BORROW_LIMIT_REACHED'))
    render(<><AddFixture/><BookCart/></>)
    fireEvent.click(screen.getByRole('button',{name:'Add fixture'}))
    fireEvent.click(screen.getByRole('button',{name:'Check Out'}))
    await screen.findByText(/Return a book or cancel an existing request, then try again. Your cart has been kept./)
    expect(screen.getByText('Clean Code')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('disables checkout when empty and removes a selected row locally', async () => {
    render(<><AddFixture /><BookCart /></>)
    expect((screen.getByRole('button', { name: 'Check Out' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add fixture' }))
    expect(await screen.findByText('Clean Code')).toBeTruthy()
    expect(screen.getAllByAltText('Clean Code cover').some((image) => (image as HTMLImageElement).src.includes('/api/assets/covers/clean-code.png'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Clean Code' }))
    expect(screen.queryByText('Clean Code')).toBeNull()
    expect((screen.getByRole('button', { name: 'Check Out' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('submits title IDs, clears the cart, and shows handover instructions', async () => {
    api.submitBorrowRequest.mockResolvedValue({ requestGroupId: 'group-1', status: 'pending_claim', instructions: 'Bring the selected books to the library desk.', items: [] })
    render(<><AddFixture /><BookCart /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Add fixture' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Check Out' }))
    await waitFor(() => expect(api.submitBorrowRequest).toHaveBeenCalledWith([4],expect.any(String)))
    expect(await screen.findByText('Bring the selected books to the library desk.')).toBeTruthy()
    expect(screen.getByText('Your cart is empty')).toBeTruthy()
  })

  it('preserves selections and the confirmation key when a request response fails', async () => {
    api.submitBorrowRequest.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce({requestGroupId:'group-retry',status:'queued',instructions:'Wait for pickup.',items:[]})
    render(<><AddFixture /><BookCart /></>)
    fireEvent.click(screen.getByRole('button',{name:'Add fixture'}))
    fireEvent.click(screen.getByRole('button',{name:'Check Out'}))
    await screen.findByText('Connection interrupted')
    expect(screen.getByText('Clean Code')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Check Out'}))
    await screen.findByText('Wait for pickup.')
    expect(api.submitBorrowRequest.mock.calls[0][1]).toBe(api.submitBorrowRequest.mock.calls[1][1])
  })

  it('prevents double submission and removing a book while saving', async () => {
    let finish!: (value:unknown)=>void
    api.submitBorrowRequest.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
    render(<><AddFixture /><BookCart /></>)
    fireEvent.click(screen.getByRole('button',{name:'Add fixture'}))
    const submit=screen.getByRole('button',{name:'Check Out'})
    fireEvent.click(submit);fireEvent.click(submit)
    expect(api.submitBorrowRequest).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button',{name:'Remove Clean Code'})).toHaveProperty('disabled',true)
    finish({requestGroupId:'group-double',status:'queued',instructions:'Only one queue submission.',items:[]})
    await screen.findByText('Only one queue submission.')
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

afterEach(() => { cleanup(); clearBookCartForTests(); vi.resetAllMocks() })
