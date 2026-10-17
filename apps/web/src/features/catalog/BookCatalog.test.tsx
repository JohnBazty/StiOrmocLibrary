import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BookCatalog } from './BookCatalog'
import { LegacyCatalogRedirect } from './LegacyCatalogRedirect'
import { clearBookCartForTests, readBookCart } from './book-cart-store'
import { fetchBookCatalog, fetchBookOverview, reserveBookTitle } from './book-catalog-api'
import { enhancedCatalog } from './enhanced-catalog-api'

vi.mock('../auth/auth-storage', () => ({ getCurrentClaims: () => ({ userId: 99, role: 'Student', schoolId: 'TEST-99' }), getCurrentIdentity: () => ({ userId: 99, role: 'Student', schoolId: 'TEST-99' }) }))
vi.mock('./book-catalog-api', () => ({ fetchBookCatalog: vi.fn(), fetchBookOverview: vi.fn(), reserveBookTitle: vi.fn() }))
vi.mock('./enhanced-catalog-api', () => ({ enhancedCatalog: { options: vi.fn(), search: vi.fn(), detail: vi.fn() } }))
vi.mock('./CatalogDetailsPanel', () => ({ catalogInput: 'field', CatalogDetailsPanel: () => <p>Digital files and catalog metadata</p> }))

const record = { id: 42, title: 'Example book', kind: 'Book', author: 'Alex Writer', coverImagePath: '/cover.jpg', available: 1, copyCount: 1, copies: [], programs: [], courses: [], files: [] }
const overview = { titleId: 42, title: 'Example book', author: 'Alex Writer', isbn: '123', publisher: 'Publisher', publicationYear: 2024, categoryName: 'Computing', shelfLocation: 'A1', callNumber: '001', currentAvailabilityStatus: 'Available', availableCopiesCount: 1, totalCopiesCount: 1, reservableMaterialId: 1, previewBarcode: 'BOOK1' }
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output> }
function setup(url = '/student/library') { render(<MemoryRouter initialEntries={[url]}><BookCatalog /><Location /></MemoryRouter>) }

beforeEach(() => {
  vi.mocked(fetchBookCatalog).mockResolvedValue({ items: [], viewer: { role: 'Student', activeBookCount: 0, bookLimit: 2 }, pagination: { page: 1, limit: 24, total: 1, totalPages: 1 } })
  vi.mocked(fetchBookOverview).mockResolvedValue(overview as never)
  vi.mocked(reserveBookTitle).mockResolvedValue({ reservationId: 1, queuePosition: 3, status: 'approved', statusLabel:'Preparing',instructions:'Wait for Ready for pickup.' })
  vi.mocked(enhancedCatalog.options).mockResolvedValue({ categories: [], programs: [], courses: [], types: [], locations: [] })
  vi.mocked(enhancedCatalog.search).mockResolvedValue({ items: [record, { ...record, id: 43, title: 'Research example', kind: 'Research/Thesis' }], pagination: { page: 1, limit: 24, total: 2 } } as never)
})
afterEach(() => { cleanup(); clearBookCartForTests(); vi.resetAllMocks() })

it('shows covers and filters and adds locally without submitting a request', async () => {
  setup()
  await screen.findByText('Active books + requests: 0 / 2')
  expect(screen.getByAltText('Example book book cover').getAttribute('src')).toBe('/cover.jpg')
  fireEvent.change(screen.getByRole('textbox', { name: 'Search title, author or ISBN' }), { target: { value: 'Computing' } })
  await waitFor(() => expect(vi.mocked(enhancedCatalog.search).mock.calls.at(-1)?.[0].get('q')).toBe('Computing'))
  fireEvent.click(await screen.findByRole('button', { name: 'Borrow book' }))
  await screen.findByRole('button', { name: 'In cart' })
  expect(readBookCart().map(item=>item.titleId)).toEqual([42])
  expect(reserveBookTitle).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Book cart (1)' }).getAttribute('href')).toBe('/student/cart')
  const research = screen.getByRole('heading', { name: 'Research example' }).closest('article')!
  expect(within(research).queryByRole('button', { name: 'Borrow book' })).toBeNull()
})

it('allows preparing a cart at the active borrowing limit and explains the submission requirement', async () => {
  vi.mocked(fetchBookCatalog).mockResolvedValue({ items: [], viewer: { role: 'Student', activeBookCount: 2, bookLimit: 2 }, pagination: { page: 1, limit: 24, total: 1, totalPages: 1 } })
  setup(); await screen.findByText('Active books + requests: 2 / 2')
  fireEvent.click(await screen.findByRole('button', { name: 'Borrow book' }))
  await screen.findByRole('button',{name:'In cart'})
  expect(readBookCart()).toHaveLength(1); expect(reserveBookTitle).not.toHaveBeenCalled()
  expect(screen.getByText(/return a book or cancel an existing request before submitting/i)).toBeTruthy()
})

it('allows adding from details when existing loans or requests fill the borrowing limit',async()=>{
  vi.mocked(fetchBookCatalog).mockResolvedValue({items:[],viewer:{role:'Student',activeBookCount:2,bookLimit:2},pagination:{page:1,limit:24,total:1,totalPages:1}})
  setup('/student/library?titleId=42')
  await screen.findByText('Active books + requests: 2 / 2')
  const dialog=await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button',{name:'Borrow book'}))
  expect(readBookCart()).toHaveLength(1)
  expect(reserveBookTitle).not.toHaveBeenCalled()
})

it('reserves unavailable books without adding them to the cart', async () => {
  vi.mocked(enhancedCatalog.search).mockResolvedValue({items:[{...record,available:0}],pagination:{page:1,limit:24,total:1}} as never)
  setup();await screen.findByText('Active books + requests: 0 / 2')
  fireEvent.click(await screen.findByRole('button',{name:'Reserve book'}))
  await screen.findByRole('button',{name:'Reserved'})
  expect(reserveBookTitle).toHaveBeenCalledWith(42,expect.any(String))
  expect(readBookCart()).toHaveLength(0)
  expect(screen.queryByRole('button',{name:'Borrow book'})).toBeNull()
})

it('shows Reserve book in unavailable-book details and keeps errors visible',async()=>{
  vi.mocked(fetchBookOverview).mockResolvedValue({...overview,availableCopiesCount:0} as never)
  vi.mocked(reserveBookTitle).mockRejectedValueOnce(new Error('This book has an available copy. Add it to your cart instead.'))
  setup('/student/library?titleId=42')
  const dialog=await screen.findByRole('dialog')
  fireEvent.click(await within(dialog).findByRole('button',{name:'Reserve book'}))
  await within(dialog).findByText(/This book has an available copy/)
  expect(readBookCart()).toHaveLength(0)
})

it('adds from card metadata without waiting for a separate book-details request', async () => {
  vi.mocked(fetchBookOverview).mockRejectedValue(new Error('Details service unavailable'))
  setup();await screen.findByText('Active books + requests: 0 / 2')
  fireEvent.click(screen.getByRole('button',{name:'Borrow book'}))
  await screen.findByRole('button',{name:'In cart'})
  expect(readBookCart()).toEqual([expect.objectContaining({titleId:42,title:'Example book',author:'Alex Writer',coverImagePath:'/cover.jpg'})])
  expect(fetchBookOverview).not.toHaveBeenCalled();expect(reserveBookTitle).not.toHaveBeenCalled()
})

it('adds from details while preserving the selected catalog filters', async () => {
  setup('/student/library?titleId=42&request=1&q=Computing&programId=1')
  await screen.findByText('Active books + requests: 0 / 2')
  const dialog=await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button',{name:'Generate APA reference'}))
  expect(within(dialog).getByRole('textbox',{name:'APA 7th Edition reference'})).toHaveProperty('value',expect.stringContaining('Example book'))
  fireEvent.click(within(dialog).getByRole('button',{name:'Borrow book'}))
  expect(readBookCart()).toHaveLength(1);expect(reserveBookTitle).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button',{name:'Close'}))
  expect(screen.getByTestId('location').textContent).toBe('/student/library?q=Computing&programId=1')
})

it('redirects the former catalog URL without losing selected title, filters or hash', async () => {
  render(<MemoryRouter initialEntries={['/faculty/catalog?titleId=42&q=Computing#catalog']}><Routes><Route path="/faculty/catalog" element={<LegacyCatalogRedirect />} /><Route path="/faculty/library" element={<Location />} /></Routes></MemoryRouter>)
  expect((await screen.findByTestId('location')).textContent).toBe('/faculty/library?titleId=42&q=Computing#catalog')
})

it('keeps digital-only book details accessible without the physical-copy API', async () => {
  const digital = { ...record, available: 0, copyCount: 0 }
  vi.mocked(enhancedCatalog.search).mockResolvedValue({ items: [digital], pagination: { page: 1, limit: 24, total: 1 } } as never)
  vi.mocked(enhancedCatalog.detail).mockResolvedValue(digital as never)
  setup()
  fireEvent.click(await screen.findByRole('button', { name: 'View details' }))
  await screen.findByRole('dialog')
  expect(screen.getByText('Digital files and catalog metadata')).toBeTruthy()
  expect(fetchBookOverview).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Join waitlist' })).toBeNull()
})

it('shows the faculty cart and respects its server-provided unlimited selection',async()=>{
  vi.mocked(fetchBookCatalog).mockResolvedValue({items:[],viewer:{role:'Faculty',activeBookCount:4,bookLimit:null},pagination:{page:1,limit:24,total:1,totalPages:1}})
  setup('/faculty/library')
  await waitFor(()=>expect(screen.getByRole('link',{name:'Book cart (0)'}).getAttribute('href')).toBe('/faculty/cart'))
  fireEvent.click(await screen.findByRole('button',{name:'Borrow book'}));await screen.findByRole('button',{name:'In cart'})
  expect(readBookCart()).toHaveLength(1)
})
it('allows local selection while eligibility is still loading',async()=>{
  vi.mocked(fetchBookCatalog).mockImplementation(()=>new Promise(()=>{}))
  setup()
  const add=await screen.findByRole('button',{name:'Borrow book'})
  expect(add).toHaveProperty('disabled',false)
  fireEvent.click(add)
  expect(readBookCart().map(item=>item.titleId)).toEqual([42])
  expect(reserveBookTitle).not.toHaveBeenCalled()
})
it('allows local selection with a clear notice if eligibility cannot be loaded',async()=>{
  vi.mocked(fetchBookCatalog).mockRejectedValue(new Error('Borrowing service unavailable.'))
  setup();await screen.findByText(/Borrowing service unavailable/)
  const add=screen.getByRole('button',{name:'Borrow book'})
  expect(add).toHaveProperty('disabled',false)
  fireEvent.click(add)
  expect(readBookCart()).toHaveLength(1)
  expect(screen.getByText(/eligibility will be checked when you submit/i)).toBeTruthy()
  expect(reserveBookTitle).not.toHaveBeenCalled()
})
