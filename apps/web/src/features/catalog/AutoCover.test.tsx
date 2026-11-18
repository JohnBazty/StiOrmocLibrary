import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddMultipleCopiesModal } from './AddMultipleCopiesModal'

const api = vi.hoisted(() => ({ createBulkBook: vi.fn(), lookupIsbn: vi.fn(), searchTitles: vi.fn(), fetchCover: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api, ApiError: class extends Error {} }))
vi.mock('./BookLabelSheet', () => ({ BookLabelSheet: () => null }))
vi.mock('../../components/SelectedFilePreview', () => ({ SelectedFilePreview: ({ file, onRemove }: { file: File | null; onRemove: () => void }) => file ? <div><span>Preview {file.name}</span><button type="button" onClick={onRemove}>Remove cover</button></div> : null }))

const categories = [{ categoryId: 1, categoryName: 'Programming', shelfLocation: 'Cabinet 4-B' }]
const isbn = '9780132350884'
const found = { isbn, title: 'Clean Code', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, source: 'open_library' }
const lookedUpCover = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], `cover-${isbn}.jpg`, { type: 'image/jpeg' })

async function lookUp() {
  const field = screen.getByLabelText(/ISBN \*/i)
  fireEvent.change(field, { target: { value: isbn } })
  fireEvent.blur(field)
  await waitFor(() => expect(api.lookupIsbn).toHaveBeenCalled())
}

describe('cover from the book lookup', () => {
  it('attaches the cover when the ISBN lookup finds the book, and sends it on save', async () => {
    api.lookupIsbn.mockResolvedValue(found)
    api.fetchCover.mockResolvedValue(lookedUpCover())
    api.createBulkBook.mockResolvedValue({ titleId: 1, createdTitle: true, numberOfCopies: 2, copies: [] })
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    await lookUp()
    expect(await screen.findByText(`Preview cover-${isbn}.jpg`)).toBeTruthy()
    expect(screen.getByText(/Cover added from the book lookup/)).toBeTruthy()
    expect(api.fetchCover).toHaveBeenCalledWith(isbn)
    fireEvent.change(screen.getByLabelText(/Category \*/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /Create copy and generate codes/i }))
    await waitFor(() => expect(api.createBulkBook).toHaveBeenCalled())
    expect(String(api.createBulkBook.mock.calls[0][0].cover_image_data)).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('never replaces a cover staff chose themselves', async () => {
    api.lookupIsbn.mockResolvedValue(found)
    api.fetchCover.mockResolvedValue(lookedUpCover())
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    const mine = new File([new Uint8Array([0x89, 0x50])], 'my-scan.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Upload cover page'), { target: { files: [mine] } })
    await lookUp()
    expect(screen.getByText('Preview my-scan.png')).toBeTruthy()
    expect(api.fetchCover).not.toHaveBeenCalled()
  })

  it('leaves the cover alone for a title already in the catalog', async () => {
    api.lookupIsbn.mockResolvedValue({ ...found, source: 'local_catalog' })
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    await lookUp()
    await screen.findByText(/local library catalog/)
    expect(api.fetchCover).not.toHaveBeenCalled()
  })

  it('drops a looked-up cover when the ISBN is changed or the cover is removed', async () => {
    api.lookupIsbn.mockResolvedValue(found)
    api.fetchCover.mockResolvedValue(lookedUpCover())
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    await lookUp()
    await screen.findByText(`Preview cover-${isbn}.jpg`)
    fireEvent.change(screen.getByLabelText(/ISBN \*/i), { target: { value: '978013235088' } })
    expect(screen.queryByText(`Preview cover-${isbn}.jpg`)).toBeNull()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
