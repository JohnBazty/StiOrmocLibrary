import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogManagementPage } from './CatalogManagementPage'
const api=vi.hoisted(()=>({search:vi.fn(),copies:vi.fn(),categories:vi.fn(async()=>[])}))
vi.mock('./catalog-api',()=>({catalogApi:api,ApiError:class extends Error{}}))
vi.mock('./enhanced-catalog-api',()=>({enhancedCatalog:{options:vi.fn(async()=>({locations:[]}))}}))
vi.mock('./useBarcodeScanner',()=>({useBarcodeScanner:vi.fn()}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('uses authoritative result totals and server pagination without loading a duplicate copy table',async()=>{
 api.copies.mockResolvedValue([])
 api.search.mockImplementation(async(filters)=>({items:[],pagination:{page:filters.page??1,limit:25,total:51,pages:3}}))
 render(<CatalogManagementPage/>)
 await waitFor(()=>expect(screen.getByText('51 matching titles')).toBeTruthy())
 expect(api.copies).not.toHaveBeenCalled()
 expect(screen.queryByRole('heading',{name:'Physical copy register'})).toBeNull()
 expect(screen.getByLabelText('Resource type')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Next page'}))
 await waitFor(()=>expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({page:2})))
 fireEvent.change(screen.getByLabelText('Search catalog'),{target:{value:'new search'}})
 await waitFor(()=>expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({page:1,q:'new search'})))
})
it('does not turn a failed first load into an empty-results message',async()=>{
 api.search.mockRejectedValue(new Error('Catalog temporarily unavailable.'));api.copies.mockResolvedValue([])
 render(<CatalogManagementPage/>)
 expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('Catalog temporarily unavailable.'))
 expect(screen.queryByText('No records match these filters.')).toBeNull()
})
it('does not let a slow manual refresh replace results for newer filters', async () => {
 let resolveManual!: (value: unknown) => void
 api.search.mockResolvedValueOnce({ items: [], pagination: { total: 1, page: 1, limit: 25, pages: 1 } })
   .mockImplementationOnce(() => new Promise(resolve => { resolveManual = resolve }))
   .mockResolvedValue({ items: [], pagination: { total: 2, page: 1, limit: 25, pages: 1 } })
 render(<CatalogManagementPage />)
 await screen.findByText('1 matching titles')
 fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
 fireEvent.change(screen.getByLabelText('Search catalog'), { target: { value: 'newer' } })
 await screen.findByText('2 matching titles')
 await act(async () => { resolveManual({ items: [], pagination: { total: 99, page: 1, limit: 25, pages: 4 } }) })
 expect(screen.queryByText('99 matching titles')).toBeNull()
 expect(screen.getByText('2 matching titles')).toBeTruthy()
})
it('shows the copies actual shelf locations alongside Mismatch so staff can see what differs', async () => {
 const base = {
  recordType: 'Book' as const,
  coverImagePath: null,
  authors: ['Author'],
  isbn: null,
  publicationYear: 2024,
  publisher: 'Publisher',
  callNumber: 'QA76',
  accessionNumber: 'ACC-1',
  lastAccessionNumber: 'ACC-6',
  deweyCode: null,
  classification: null,
  edition: null,
  volumes: null,
  pages: null,
  remarks: null,
  categoryId: 1,
  categoryName: 'Reference',
  rowVersion: 1,
  shelfLocation: 'Reference Section',
  activeInventoryCount: 6,
  shelfStatus: 'Mismatch' as const,
  availability: 'Available' as const,
  totalCopies: 6,
  availableCopies: 6,
  research: null,
 }
 api.search.mockResolvedValueOnce({
  items: [
   { ...base, titleId: 1, title: 'Split Shelf Book', actualShelfLocations: ['Reference Section', 'SHELF 3B'] },
   { ...base, titleId: 2, title: 'Unassigned Shelf Book', actualShelfLocations: [] },
  ],
  pagination: { total: 2, page: 1, limit: 25, pages: 1 },
 })
 render(<CatalogManagementPage />)
 expect(await screen.findByText('Mismatch · Copies on: Reference Section, SHELF 3B')).toBeTruthy()
 expect(screen.getByText('Mismatch · No shelf on copies')).toBeTruthy()
})
