import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TitleLookup } from './TitleLookup'

const api = vi.hoisted(() => ({ searchTitles: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api }))
const candidate = { title: 'Clean Code: A Handbook', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, isbn: '9780132350884', inCatalog: false }

// Kept as standalone coverage for the archived module; Add Books no longer mounts it.
describe('archived title lookup component', () => {
  it('keeps archived candidate selection independent of the Add Books form', async () => {
    api.searchTitles.mockResolvedValue({ source: 'open_library', localMatches: [{ titleId: 4, title: 'Clean Code', author: 'Robert C. Martin', isbn: null }], candidates: [candidate] })
    const pick = vi.fn(), { rerender } = render(<TitleLookup title="" author="" onPick={pick} />)
    expect((screen.getByRole('button', { name: 'Search by title or author' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<TitleLookup title="Clean Code" author="Martin" onPick={pick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search by title or author' }))
    await waitFor(() => expect(api.searchTitles).toHaveBeenCalledWith('Clean Code','Martin'))
    fireEvent.click(await screen.findByRole('button', { name: 'Use Clean Code: A Handbook' }))
    expect(pick).toHaveBeenCalledWith(candidate)
  })
  it('discards results after changing the title', async () => {
    api.searchTitles.mockResolvedValue({ source: 'open_library', localMatches: [], candidates: [candidate] })
    const pick = vi.fn(), { rerender } = render(<TitleLookup title="Clean Code" author="" onPick={pick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search by title or author' }))
    await screen.findByRole('button', { name: 'Use Clean Code: A Handbook' })
    rerender(<TitleLookup title="Refactoring" author="" onPick={pick} />)
    expect(screen.queryByRole('button', { name: 'Use Clean Code: A Handbook' })).toBeNull()
  })
  it('surfaces a provider failure', async () => {
    api.searchTitles.mockRejectedValue(new Error('Book search is temporarily unavailable.'))
    render(<TitleLookup title="Clean Code" author="" onPick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search by title or author' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent','Book search is temporarily unavailable.')
  })
  it('preserves the archived author-only lookup', async () => {
    api.searchTitles.mockResolvedValue({ source: 'google_books', localMatches: [], candidates: [] })
    render(<TitleLookup title="" author="Robert Martin" onPick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search by title or author' }))
    await waitFor(() => expect(api.searchTitles).toHaveBeenCalledWith('','Robert Martin'))
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
