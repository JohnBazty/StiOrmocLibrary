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
  vi.mocked(reserveBookTitle).mockResolvedValue({ reservationId: 1, queuePosition: 3, status: 'pending' })
  vi.mocked(enhancedCatalog.options).mockResolvedValue({ categories: [], programs: [], courses: [], types: [], locations: [] })
  vi.mocked(enhancedCatalog.search).mockResolvedValue({ items: [record, { ...record, id: 43, title: 'Research example', kind: 'Research/Thesis' }], pagination: { page: 1, limit: 24, total: 2 } } as never)
})
afterEach(() => { cleanup(); clearBookCartForTests(); vi.resetAllMocks() })

it('browses covers and filters and adds a book to the same borrow cart without another catalog', async () => {
  setup()
  await screen.findByText('Active + selected: 0 / 2')
  const action = await screen.findByRole('button', { name: 'Borrow book' })
  expect(screen.getByAltText('Example book book cover').getAttribute('src')).toBe('/cover.jpg')
  fireEvent.change(screen.getByRole('textbox', { name: 'Search title, author or ISBN' }), { target: { value: 'Computing' } })
  await waitFor(() => expect(vi.mocked(enhancedCatalog.search).mock.calls.at(-1)?.[0].get('q')).toBe('Computing'))
  fireEvent.click(action)
  await screen.findByRole('button', { name: 'In cart' })
  expect(readBookCart().map(book => book.titleId)).toEqual([42])
  expect(screen.getByRole('link', { name: 'Book cart (1)' }).getAttribute('href')).toBe('/student/cart')
  expect(screen.queryByRole('link', { name: 'Borrow book' })).toBeNull()
  const research = screen.getByRole('heading', { name: 'Research example' }).closest('article')!
  expect(within(research).queryByRole('button', { name: /Borrow|Reserve/ })).toBeNull()
})

it('preserves student limits when adding from the merged grid', async () => {
  vi.mocked(fetchBookCatalog).mockResolvedValue({ items: [], viewer: { role: 'Student', activeBookCount: 2, bookLimit: 2 }, pagination: { page: 1, limit: 24, total: 1, totalPages: 1 } })
  setup()
  await screen.findByText('Active + selected: 2 / 2')
  fireEvent.click(await screen.findByRole('button', { name: 'Borrow book' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Transaction Blocked: Students cannot exceed 2 books.')
  expect(readBookCart()).toEqual([])
})

it('reserves unavailable books and reports a rejected request', async () => {
  vi.mocked(enhancedCatalog.search).mockResolvedValue({ items: [{ ...record, available: 0 }], pagination: { page: 1, limit: 24, total: 1 } } as never)
  vi.mocked(fetchBookOverview).mockResolvedValue({ ...overview, availableCopiesCount: 0, currentAvailabilityStatus: 'Borrowed' } as never)
  setup()
  await screen.findByText('Active + selected: 0 / 2')
  fireEvent.click(await screen.findByRole('button', { name: 'Reserve book' }))
  await screen.findByText('Reservation submitted. You are number 3 in the queue.')
  expect(reserveBookTitle).toHaveBeenCalledWith(42)
  expect(readBookCart()).toEqual([])
  vi.mocked(reserveBookTitle).mockRejectedValue(new Error('You already have a reservation for this book.'))
  fireEvent.click(await screen.findByRole('button', { name: 'Reserve book' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'You already have a reservation for this book.')
})

it('opens selected book details and APA reference, adds to cart and preserves filters when closed', async () => {
  setup('/student/library?titleId=42&request=1&q=Computing&programId=1')
  await screen.findByText('Active + selected: 0 / 2')
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Generate APA reference' }))
  expect(within(dialog).getByRole('textbox', { name: 'APA 7th Edition reference' })).toHaveProperty('value', expect.stringContaining('Example book'))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add to cart' }))
  expect(readBookCart()).toHaveLength(1)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).toBeNull()
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
  expect(screen.queryByRole('button', { name: 'Reserve book' })).toBeNull()
})

it('uses the faculty cart and does not apply the student two-book cap to faculty', async () => {
  vi.mocked(fetchBookCatalog).mockResolvedValue({ items: [], viewer: { role: 'Faculty', activeBookCount: 4, bookLimit: null }, pagination: { page: 1, limit: 24, total: 1, totalPages: 1 } })
  setup('/faculty/library')
  await screen.findByRole('link', { name: 'Book cart (0)' })
  await waitFor(() => expect(screen.getByRole('link', { name: 'Book cart (0)' }).getAttribute('href')).toBe('/faculty/cart'))
  fireEvent.click(await screen.findByRole('button', { name: 'Borrow book' }))
  await screen.findByRole('button', { name: 'In cart' })
  expect(readBookCart()).toHaveLength(1)
})

it('offers reservation in details if availability changed, without submitting it automatically', async () => {
  vi.mocked(fetchBookOverview).mockResolvedValue({ ...overview, availableCopiesCount: 0, currentAvailabilityStatus: 'Reserved' } as never)
  setup()
  await screen.findByText('Active + selected: 0 / 2')
  fireEvent.click(await screen.findByRole('button', { name: 'Borrow book' }))
  const dialog = await screen.findByRole('dialog')
  const reserve = await within(dialog).findByRole('button', { name: 'Reserve book' })
  expect(reserveBookTitle).not.toHaveBeenCalled()
  expect(readBookCart()).toEqual([])
  fireEvent.click(reserve)
  await within(dialog).findByText('Reservation submitted. You are number 3 in the queue.')
  expect(reserveBookTitle).toHaveBeenCalledOnce()
})

it('keeps browsing available but disables requests if borrowing eligibility fails', async () => {
  vi.mocked(fetchBookCatalog).mockRejectedValue(new Error('Borrowing service unavailable.'))
  setup()
  await screen.findByText('Borrowing service unavailable.')
  expect(await screen.findByRole('button', { name: 'Borrow book' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('heading', { name: 'Example book' })).toBeTruthy()
})
