import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddMultipleCopiesModal } from './AddMultipleCopiesModal'

const api = vi.hoisted(() => ({ createBulkBook: vi.fn(), lookupIsbn: vi.fn(), searchTitles: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api, ApiError: class extends Error {} }))
vi.mock('./BookLabelSheet', () => ({ BookLabelSheet: () => null }))

const categories = [{ categoryId: 1, categoryName: 'Programming', shelfLocation: 'Cabinet 4-B' }]
const candidate = { title: 'Clean Code: A Handbook', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, isbn: '9780132350884', inCatalog: false }

describe('title lookup in the add-book form', () => {
  it('searches by the typed title and author and fills the form from the picked result without an ISBN re-lookup', async () => {
    api.searchTitles.mockResolvedValue({ source: 'open_library', localMatches: [{ titleId: 4, title: 'Clean Code', author: 'Robert C. Martin', isbn: null }], candidates: [candidate] })
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    const search = screen.getByRole('button', { name: /Search by title and author/i })
    expect((search as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'Clean Code' } })
    fireEvent.change(screen.getByLabelText(/Author \*/i), { target: { value: 'Martin' } })
    fireEvent.click(search)
    await waitFor(() => expect(api.searchTitles).toHaveBeenCalledWith('Clean Code', 'Martin'))
    expect(await screen.findByText(/Already in the catalog: Clean Code/)).toBeTruthy()
    expect(screen.getByText(/Results from Open Library/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use Clean Code: A Handbook' }))
    expect((screen.getByLabelText(/Title \*/i) as HTMLInputElement).value).toBe('Clean Code: A Handbook')
    expect((screen.getByLabelText(/Author \*/i) as HTMLInputElement).value).toBe('Robert C. Martin')
    expect((screen.getByLabelText(/ISBN \*/i) as HTMLInputElement).value).toBe('9780132350884')
    expect((screen.getByLabelText(/Publication year/i) as HTMLInputElement).value).toBe('2008')
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(api.lookupIsbn).not.toHaveBeenCalled()
  })

  it('drops results once the title is edited', async () => {
    api.searchTitles.mockResolvedValue({ source: 'open_library', localMatches: [], candidates: [candidate] })
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'Clean Code' } })
    fireEvent.click(screen.getByRole('button', { name: /Search by title and author/i }))
    expect(await screen.findByRole('button', { name: 'Use Clean Code: A Handbook' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'Refactoring' } })
    expect(screen.queryByRole('button', { name: 'Use Clean Code: A Handbook' })).toBeNull()
  })

  it('shows a search failure as an alert', async () => {
    api.searchTitles.mockRejectedValue(new Error('Book search is temporarily unavailable.'))
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'Clean Code' } })
    fireEvent.click(screen.getByRole('button', { name: /Search by title and author/i }))
    expect((await screen.findByText('Book search is temporarily unavailable.')).getAttribute('role')).toBe('alert')
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
