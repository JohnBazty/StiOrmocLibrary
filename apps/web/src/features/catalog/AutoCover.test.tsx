import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddMultipleCopiesModal } from './AddMultipleCopiesModal'

const api = vi.hoisted(() => ({ createBulkBook: vi.fn(), lookupIsbn: vi.fn(), searchTitles: vi.fn(), fetchCover: vi.fn() }))
vi.mock('./catalog-api', () => ({ catalogApi: api, ApiError: class extends Error {} }))
vi.mock('./BookLabelSheet', () => ({ BookLabelSheet: () => null }))
vi.mock('../../components/SelectedFilePreview', () => ({ SelectedFilePreview: ({ file, onRemove }: { file: File | null; onRemove: () => void }) => file ? <div><span>Preview {file.name}</span><button type="button" onClick={onRemove}>Remove cover</button></div> : null }))

const shelves = vi.hoisted(() => ({listShelves:vi.fn()}))
vi.mock('../categories/category-api', () => ({categoryApi:shelves,CategoryApiError:class extends Error {}}))
beforeEach(()=>shelves.listShelves.mockResolvedValue([{id:1,label:'Cabinet 4-B',status:'Active',version:1,columnCount:1,rowCount:1,defaultCapacity:10,capacityConfigured:true,used:0,capacity:10,remaining:10,compartments:[{column:1,row:1,capacity:10,used:0,remaining:10,status:'Available'}]}]))

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
  it('keeps manual entry and ISBN lookup while removing the title and author lookup control', async () => {
    api.lookupIsbn.mockResolvedValue(null)
    api.createBulkBook.mockResolvedValue({ titleId: 1, createdTitle: true, numberOfCopies: 2, copies: [] })
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'School reference handbook' } })
    fireEvent.change(screen.getByLabelText(/Author \*/i), { target: { value: 'Campus Author' } })
    expect(screen.queryByRole('button', { name: /search by title|find by title|look up title/i })).toBeNull()
    await lookUp()
    fireEvent.change(screen.getByLabelText(/Category \*/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /Review book and copies/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^Add book and \d+ cop/ }))
    await waitFor(() => expect(api.createBulkBook).toHaveBeenCalled())
    expect(api.createBulkBook.mock.calls[0][0].title).toBe('School reference handbook')
    expect(api.searchTitles).not.toHaveBeenCalled()
  })

  it('attaches the cover when the ISBN lookup finds the book, and sends it on save', async () => {
    api.lookupIsbn.mockResolvedValue(found)
    api.fetchCover.mockResolvedValue(lookedUpCover())
    api.createBulkBook.mockResolvedValue({ titleId: 1, createdTitle: true, numberOfCopies: 2, copies: [] })
    render(<AddMultipleCopiesModal categories={categories} onCreated={() => undefined} onClose={() => undefined} />)
    await lookUp()
    expect(await screen.findByText(`Preview cover-${isbn}.jpg`)).toBeTruthy()
    expect(screen.getByText(/Cover added from the book lookup/)).toBeTruthy()
    expect(api.fetchCover).toHaveBeenCalledWith(isbn,expect.any(AbortSignal))
    // The ISBN lookup fills the required details by itself.
    await waitFor(() => expect((screen.getByLabelText(/Title \*/i) as HTMLInputElement).value).not.toBe(''))
    fireEvent.change(screen.getByLabelText(/Category \*/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /Review book and copies/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^Add book and \d+ cop/ }))
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

it('manual cover retry keeps the details the librarian edited and shows a readable missing result',async()=>{
 api.lookupIsbn.mockResolvedValue(found);api.fetchCover.mockResolvedValue(null)
 render(<AddMultipleCopiesModal categories={categories} onCreated={()=>undefined} onClose={()=>undefined}/>)
 await lookUp();await screen.findByText(/No matching cover was found/)
 fireEvent.change(screen.getByLabelText(/Title \*/i),{target:{value:'Edited title'}})
 fireEvent.click(screen.getByRole('button',{name:'Find cover automatically'}))
 await waitFor(()=>expect(api.fetchCover.mock.calls.length).toBeGreaterThan(1))
 expect((screen.getByLabelText(/Title \*/i) as HTMLInputElement).value).toBe('Edited title')
})
it('ISBN edits discard an old pending cover even before it has a preview',async()=>{
 api.lookupIsbn.mockResolvedValue(found)
 let resolve!:(file:File)=>void;api.fetchCover.mockImplementation(()=>new Promise(r=>{resolve=r}))
 render(<AddMultipleCopiesModal categories={categories} onCreated={()=>undefined} onClose={()=>undefined}/>)
 await lookUp();await waitFor(()=>expect(api.fetchCover).toHaveBeenCalled())
 fireEvent.change(screen.getByLabelText(/ISBN \*/i),{target:{value:'978013235088'}})
 resolve(lookedUpCover());await waitFor(()=>expect(screen.queryByText(`Preview cover-${isbn}.jpg`)).toBeNull())
 expect(screen.queryByText('Finding cover…')).toBeNull()
})
it('removing a preview while retry is pending keeps it removed when the response arrives',async()=>{
 api.lookupIsbn.mockResolvedValue(found);api.fetchCover.mockResolvedValue(lookedUpCover())
 render(<AddMultipleCopiesModal categories={categories} onCreated={()=>undefined} onClose={()=>undefined}/>)
 await lookUp();await screen.findByText(`Preview cover-${isbn}.jpg`)
 let resolve!:(file:File)=>void;api.fetchCover.mockImplementation(()=>new Promise(r=>{resolve=r}))
 fireEvent.click(screen.getByRole('button',{name:'Find cover automatically'}));fireEvent.click(screen.getByRole('button',{name:'Remove cover'}))
 resolve(lookedUpCover());await waitFor(()=>expect(screen.queryByText(`Preview cover-${isbn}.jpg`)).toBeNull())
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
