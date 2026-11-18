import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FindBookDetailsPage } from './FindBookDetailsPage'

const api = vi.hoisted(() => ({ inspect: vi.fn(), findRead: vi.fn(), findFill: vi.fn(), findExport: vi.fn() }))
vi.mock('./enhanced-catalog-api', () => ({ enhancedCatalog: api }))

const blank = { title: '', author: '', isbn: '', edition: '', publisher: '', publicationYear: '', copyrightYear: '', pages: '', copies: '', summary: '' }
const sheet = { name: 'GE', rowCount: 3, headers: ['Title', 'ISBN'], preview: [['Title', 'ISBN']], mapping: { sheet: 'GE', headerRow: 1, columns: { title: 1, isbn: 2 } } }

async function readList() {
  api.inspect.mockResolvedValue([sheet])
  api.findRead.mockResolvedValue({ rows: [{ id: 1, sheet: 'GE', sourceRow: 2, data: { ...blank, title: 'Clean Code', isbn: '9780132350884' } }, { id: 2, sheet: 'GE', sourceRow: 3, data: { ...blank, title: 'Local Book', author: 'A', isbn: '9780306406157', publisher: 'P', publicationYear: '1999' } }] })
  render(<><a href="/librarian/dashboard" onClick={(event) => event.preventDefault()}>Dashboard</a><FindBookDetailsPage /></>)
  fireEvent.change(screen.getByLabelText(/Book list/), { target: { files: [new File(['x'], 'books.xlsx')] } })
  fireEvent.click(await screen.findByRole('button', { name: /Read my list/ }))
  await screen.findByText(/2 books read from books.xlsx/)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('FindBookDetailsPage', () => {
  it('looks up only rows with blanks, shows the source, and needs no warning before anything changed', async () => {
    await readList()
    fireEvent.click(screen.getByText('Dashboard'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    api.findFill.mockResolvedValue({ rows: [{ id: 1, filled: { author: { value: 'Robert C. Martin', source: 'google_books' } } }], notReached: [], unavailable: false })
    fireEvent.click(screen.getByRole('button', { name: 'Find missing details' }))
    await screen.findByText(/1 book filled, 0 not found/)
    expect(api.findFill.mock.calls[0][0].map((row: { id: number }) => row.id)).toEqual([1])
    expect((screen.getByLabelText('Author, line 2') as HTMLInputElement).value).toBe('Robert C. Martin')
    expect(screen.getByText('from Google Books')).toBeTruthy()
    expect(screen.getByText(/not checked yet; the download marks it/)).toBeTruthy()
  })

  it('asks before leaving with filled details, and Save changes downloads the list first', async () => {
    await readList()
    api.findFill.mockResolvedValue({ rows: [{ id: 1, filled: { author: { value: 'Robert C. Martin', source: 'google_books' } } }], notReached: [], unavailable: false })
    fireEvent.click(screen.getByRole('button', { name: 'Find missing details' }))
    await screen.findByText(/1 book filled/)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('Dashboard'))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.findExport).toHaveBeenCalledWith([expect.objectContaining({ checked: true, sourceRow: 2, filled: { author: { value: 'Robert C. Martin', source: 'google_books' } } }), expect.objectContaining({ checked: false })], 'csv'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    fireEvent.click(screen.getByText('Dashboard'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('editing a checked row clears its check, and Excel download sends the edited value', async () => {
    await readList()
    api.findFill.mockResolvedValue({ rows: [{ id: 1, filled: { author: { value: 'Robert C. Martin', source: 'google_books' } } }], notReached: [], unavailable: false })
    fireEvent.click(screen.getByRole('button', { name: 'Find missing details' }))
    await screen.findByText(/1 book filled/)
    const box = screen.getByRole('checkbox')
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'All (2)' }))
    fireEvent.change(screen.getByLabelText('Author, line 2'), { target: { value: 'R. C. Martin' } })
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Download Excel/ }))
    await waitFor(() => expect(api.findExport).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ checked: false, data: expect.objectContaining({ author: 'R. C. Martin' }) })]), 'xlsx'))
  })
})
