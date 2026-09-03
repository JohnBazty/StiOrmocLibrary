import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BookCatalog } from './BookCatalog'
import type { BookCatalogItem } from './book-catalog-types'

const api = vi.hoisted(() => ({
  fetchBookCatalog: vi.fn(),
  fetchBookCategories: vi.fn(),
  fetchBookOverview: vi.fn(),
  reserveBookTitle: vi.fn(),
}))

vi.mock('./book-catalog-api', () => api)
vi.mock('../auth/auth-storage', () => ({ getCurrentClaims: () => ({ userId: 5, schoolId: 'STI-5', role: 'Student', exp: 9999999999 }) }))

const baseBook: BookCatalogItem = {
  titleId: 1,
  title: 'Database Systems',
  author: 'C. J. Date',
  isbn: '9780133970777',
  publisher: 'Pearson',
  publicationYear: 2019,
  categoryId: 2,
  categoryName: 'Database',
  callNumber: 'QA76.9',
  shelfLocation: 'Shelf A-1',
  currentAvailabilityStatus: 'Available',
  currentConditionStatus: 'Fair',
  totalCopiesCount: 1,
  availableCopiesCount: 1,
  reservableMaterialId: 41,
  previewBarcode: 'STIORMOC2026000142',
}

function response(book: BookCatalogItem) {
  return Promise.resolve({
    items: [book],
    pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
    viewer: { role: 'Student' as const, activeBookCount: 0, bookLimit: 2 },
  })
}

describe('BookCatalog availability refresh', () => {
  it('opens a cover-first overview with catalog details below the image', async () => {
    const coveredBook = { ...baseBook, coverImagePath: '/api/assets/covers/database-systems.png' }
    api.fetchBookCategories.mockResolvedValue([{ categoryId: 2, categoryName: 'Database' }])
    api.fetchBookCatalog.mockImplementation(() => response(coveredBook))
    api.fetchBookOverview.mockResolvedValue(coveredBook)
    render(<MemoryRouter><BookCatalog /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'View details' }))

    const cover = await screen.findByAltText('Database Systems cover') as HTMLImageElement
    expect(cover.src).toContain('/api/assets/covers/database-systems.png')
    expect(screen.getByText('ISBN')).toBeTruthy()
    expect(screen.getByText('Fair')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate APA reference' })).toBeTruthy()
  })

  it('keeps a borrowed title visible and changes its action to Reserve', async () => {
    api.fetchBookCategories.mockResolvedValue([{ categoryId: 2, categoryName: 'Database' }])
    api.fetchBookCatalog.mockImplementationOnce(() => response(baseBook))
    render(<MemoryRouter><BookCatalog /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Borrow' })).toBeTruthy()

    api.fetchBookCatalog.mockImplementation(() => response({
      ...baseBook,
      availableCopiesCount: 0,
      currentAvailabilityStatus: 'Borrowed',
    }))
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reserve' })).toBeTruthy())
    expect(screen.getByText('Database Systems')).toBeTruthy()
    expect(screen.getByText('Copies: 0 of 1 available')).toBeTruthy()
  })

  it('shows the backend warning when the student already borrowed the selected title', async () => {
    api.fetchBookCategories.mockResolvedValue([{ categoryId: 2, categoryName: 'Database' }])
    api.fetchBookCatalog.mockImplementation(() => response({
      ...baseBook,
      availableCopiesCount: 0,
      currentAvailabilityStatus: 'Borrowed',
    }))
    api.reserveBookTitle.mockRejectedValue(new Error('You already borrowed this book. Return it before reserving the same book again.'))
    render(<MemoryRouter><BookCatalog /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Reserve' }))

    expect((await screen.findByRole('alert')).textContent).toContain('You already borrowed this book')
    expect(api.reserveBookTitle).toHaveBeenCalledWith(baseBook.titleId)
  })

  it('explains the two-book limit before sending another reservation request', async () => {
    api.fetchBookCategories.mockResolvedValue([{ categoryId: 2, categoryName: 'Database' }])
    api.fetchBookCatalog.mockResolvedValue({
      items: [{ ...baseBook, availableCopiesCount: 0, currentAvailabilityStatus: 'Borrowed' }],
      pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
      viewer: { role: 'Student', activeBookCount: 2, bookLimit: 2 },
    })
    render(<MemoryRouter><BookCatalog /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Reserve' }))

    expect((await screen.findByRole('alert')).textContent).toContain('already have 2 active book commitments')
    expect(api.reserveBookTitle).not.toHaveBeenCalled()
  })
})

afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.clearAllMocks() })
