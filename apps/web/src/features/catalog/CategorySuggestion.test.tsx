import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddMultipleCopiesModal } from './AddMultipleCopiesModal'

const api = vi.hoisted(() => ({ createBulkBook: vi.fn(), lookupIsbn: vi.fn(), searchTitles: vi.fn(), fetchCover: vi.fn(async () => null) }))
const categoryApi = vi.hoisted(() => ({ listShelves: vi.fn(), create: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api, ApiError: class extends Error {} }))
vi.mock('../categories/category-api', () => ({ categoryApi, CategoryApiError: class extends Error {} }))
vi.mock('./BookLabelSheet', () => ({ BookLabelSheet: () => null }))

const categories = [
  { categoryId: 1, categoryName: 'Fiction', shelfLocation: 'Shelf F' },
  { categoryId: 2, categoryName: 'Computer Science', shelfLocation: 'Shelf C' },
]
const isbn = '9780132350884'
const found = (subjects: string[]) => ({ isbn, title: 'Clean Code', author: 'Robert C. Martin', publisher: null, publicationYear: 2008, subjects, source: 'google_books' })

async function lookUp() {
  const field = screen.getByLabelText(/ISBN \*/i)
  fireEvent.change(field, { target: { value: isbn } })
  fireEvent.blur(field)
  await waitFor(() => expect(api.lookupIsbn).toHaveBeenCalled())
}

describe('category help from the lookup subjects', () => {
  it('selects the matching category and its shelf', async () => {
    api.lookupIsbn.mockResolvedValue(found(['Computers', 'Computer science']))
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    await lookUp()
    expect(await screen.findByText(/Category set to Computer Science from the subject “Computer science”/)).toBeTruthy()
    expect((screen.getByLabelText(/Category \*/i) as HTMLSelectElement).value).toBe('2')
    expect((screen.getByLabelText(/Book location \*/i) as HTMLSelectElement).value).toBe('Shelf C')
  })

  it('never changes a category staff already chose', async () => {
    api.lookupIsbn.mockResolvedValue(found(['Computer science']))
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText(/Category \*/i), { target: { value: '1' } })
    await lookUp()
    await screen.findByText(/Subjects from the lookup/)
    expect((screen.getByLabelText(/Category \*/i) as HTMLSelectElement).value).toBe('1')
  })

  it('creates a category named after the subject and selects it', async () => {
    api.lookupIsbn.mockResolvedValue(found(['Software engineering']))
    categoryApi.listShelves.mockResolvedValue([{ id: 7, label: 'Shelf S', columnCount: 2, rowCount: 2 }])
    categoryApi.create.mockResolvedValue({ categoryId: 9, categoryName: 'Software engineering', shelfLocation: 'Shelf S', shelfColumn: 1, shelfRow: 1 })
    render(<AddMultipleCopiesModal categories={categories} locations={['Shelf F', 'Shelf C', 'Shelf S']} onCreated={() => undefined} onClose={() => undefined} />)
    await lookUp()
    fireEvent.click(await screen.findByRole('button', { name: 'Create category “Software engineering”' }))
    const name = await screen.findByLabelText(/Category name \*/i) as HTMLInputElement
    expect(name.value).toBe('Software engineering')
    fireEvent.change(screen.getByLabelText(/Shelf location \*/i), { target: { value: 'Shelf S' } })
    fireEvent.submit(name.closest('form')!)
    await waitFor(() => expect(categoryApi.create).toHaveBeenCalledWith(expect.objectContaining({ categoryName: 'Software engineering', shelfLocation: 'Shelf S' })))
    expect(await screen.findByText(/Category Software engineering created and selected/)).toBeTruthy()
    expect((screen.getByLabelText(/^Category \*/i) as HTMLSelectElement).value).toBe('9')
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
