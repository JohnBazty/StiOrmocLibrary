import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddMultipleCopiesModal } from './AddMultipleCopiesModal'

const api = vi.hoisted(() => ({ createBulkBook: vi.fn(), lookupIsbn: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api, ApiError: class extends Error {} }))
vi.mock('./BookLabelSheet', () => ({ BookLabelSheet: () => <div data-testid="inline-label-preview">Generated labels</div> }))

const categories = [
  { categoryId: 1, categoryName: 'Programming', shelfLocation: 'Cabinet 4-B' },
  { categoryId: 2, categoryName: 'Database', shelfLocation: 'Aisle 3' },
]

describe('AddMultipleCopiesModal', () => {
  it('autofills bibliographic metadata while preserving librarian-managed fields', async () => {
    api.lookupIsbn.mockResolvedValue({ isbn: '9780132350884', title: 'Clean Code', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, source: 'google_books' })
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText(/Number of copies/i), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText(/Call number/i), { target: { value: '005.1 MAR' } })
    fireEvent.change(screen.getByLabelText(/Category \*/i), { target: { value: '2' } })
    const isbn = screen.getByLabelText(/ISBN \*/i)
    fireEvent.change(isbn, { target: { value: '9780132350884' } })
    fireEvent.blur(isbn)
    await waitFor(() => expect(api.lookupIsbn).toHaveBeenCalledWith('9780132350884', expect.any(AbortSignal)))
    expect((screen.getByLabelText(/Title \*/i) as HTMLInputElement).value).toBe('Clean Code')
    expect((screen.getByLabelText(/Author \*/i) as HTMLInputElement).value).toBe('Robert C. Martin')
    expect((screen.getByLabelText(/Publisher/i) as HTMLInputElement).value).toBe('Prentice Hall')
    expect((screen.getByLabelText(/Publication year/i) as HTMLInputElement).value).toBe('2008')
    expect((screen.getByLabelText(/Number of copies/i) as HTMLInputElement).value).toBe('4')
    expect((screen.getByLabelText(/Call number/i) as HTMLInputElement).value).toBe('005.1 MAR')
    expect((screen.getByLabelText(/Category \*/i) as HTMLSelectElement).value).toBe('2')
    expect((screen.getByLabelText(/Book location \*/i) as HTMLSelectElement).value).toBe('Aisle 3')
    expect(screen.getByText(/Book information found from Google Books/i)).toBeTruthy()
  })

  it('uses database-managed category and book-location dropdowns and renders the inline preview', async () => {
    api.createBulkBook.mockResolvedValue({ titleId: 8, createdTitle: true, numberOfCopies: 2, copies: [] })
    const created = vi.fn()
    render(<AddMultipleCopiesModal categories={categories} onCreated={created} onClose={() => undefined} />)
    expect(screen.getByRole('option', { name: 'Programming' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Cabinet 4-B' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Category \*/i), { target: { value: '1' } })
    expect((screen.getByLabelText(/Book location \*/i) as HTMLSelectElement).value).toBe('Cabinet 4-B')
    fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'Clean Code' } })
    fireEvent.change(screen.getByLabelText(/Author \*/i), { target: { value: 'Robert C. Martin' } })
    fireEvent.change(screen.getByLabelText(/Purchase price/i), { target: { value: '650.00' } })
    fireEvent.change(screen.getByLabelText(/ISBN \*/i), { target: { value: '9780132350884' } })
    fireEvent.click(screen.getByRole('button', { name: /Create copy and generate codes/i }))
    await waitFor(() => expect(api.createBulkBook).toHaveBeenCalledWith(expect.objectContaining({ category_id: '1', shelf_location: 'Cabinet 4-B', number_of_copies: '2', purchase_price: '650.00' })))
    expect(await screen.findByTestId('inline-label-preview')).toBeTruthy()
    expect(screen.getByText(/Saved to inventory: 2 physical copies/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Close and view inventory/i })).toBeTruthy()
    expect(created).toHaveBeenCalled()
  })

  it('explains an invalid check digit and accepts a formatted ISBN-10', async () => {
    api.createBulkBook.mockResolvedValue({ titleId: 9, createdTitle: true, numberOfCopies: 1, copies: [] })
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: "Charlotte's Web" } })
    fireEvent.change(screen.getByLabelText(/Author \*/i), { target: { value: 'E. B. White' } })
    fireEvent.change(screen.getByLabelText(/Purchase price/i), { target: { value: '450.00' } })
    fireEvent.change(screen.getByLabelText(/Category \*/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/ISBN \*/i), { target: { value: '9780062638500' } })
    expect(screen.getByText('Incorrect check digit. The final digit must be 2.')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Create copy and generate codes/i }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/ISBN \*/i), { target: { value: 'ISBN-10: 0-13-235088-2' } })
    expect(screen.getByText('Valid ISBN-10 checksum')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Create copy and generate codes/i }))
    await waitFor(() => expect(api.createBulkBook).toHaveBeenCalledWith(expect.objectContaining({ isbn: '0132350882' })))
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
