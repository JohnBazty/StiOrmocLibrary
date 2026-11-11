import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogPage, StudentDashboard } from './StudentPages'

vi.mock('../../data/mockData', () => ({
  attendance: [{ id: 1, user: 'John Doe', studentId: 'S2023001', date: '2026-11-11', checkIn: '08:00', checkOut: '-', purpose: 'Study', status: 'active' }],
  books: [
    { id: 1, title: 'Clean Code', author: 'Robert C. Martin', isbn: '978-0-13-235088-4', year: 2008, category: 'Programming', shelf: 'A-1', available: 5, total: 10, status: 'available', cover: 'CC', accent: 'from-[#003399] to-[#003399]' },
    { id: 2, title: 'Design Patterns', author: 'Gamma et al.', isbn: '978-0-201-63361-0', year: 1994, category: 'Programming', shelf: 'B-2', available: 3, total: 5, status: 'available', cover: 'DP', accent: 'from-[#003399] to-[#003399]' },
    { id: 3, title: 'The Pragmatic Programmer', author: 'Hunt & Thomas', isbn: '978-0-201-61622-4', year: 1999, category: 'Programming', shelf: 'C-3', available: 8, total: 10, status: 'available', cover: 'TP', accent: 'from-[#003399] to-[#003399]' },
  ],
  loans: [{ id: 'T001', book: 'Clean Code', user: 'John Doe', studentId: 'S2023001', borrowed: '2026-11-01', due: '2026-11-15', status: 'active' }],
  reservations: [{ id: 1, user: 'Jane Doe', book: 'Clean Code', status: 'active', requested: '2026-11-10', queue: 2 }],
  notifications: [{ id: 1, message: 'Print request ready', read: false }],
  printRequests: [{ id: 'P001', user: 'John Doe', file: 'Capstone.pdf', pages: 18, copies: 1, type: 'Black & white', amount: '₱36.00', status: 'ready_for_pickup', created: '2026-11-11 08:00' }],
  researchPapers: [{ id: 1, title: 'AI in Education', authors: 'A. Reyes', department: 'BSIT', year: 2025, shelf: 'TH-01', availability: 'Available' }],
}))

describe('StudentPages', () => {
  afterEach(() => { cleanup() })

  describe('StudentDashboard', () => {
    it('renders greeting and description', () => {
      render(<MemoryRouter><StudentDashboard /></MemoryRouter>)
      expect(screen.getByRole('heading', { name: /Good morning, John!/i })).toBeTruthy()
    })

    it('shows quick action links', () => {
      render(<MemoryRouter><StudentDashboard /></MemoryRouter>)
      expect(screen.getByRole('link', { name: /explore catalog/i })).toBeTruthy()
      expect(screen.getByRole('link', { name: /browse research/i })).toBeTruthy()
      expect(screen.getByRole('link', { name: /scan attendance/i })).toBeTruthy()
    })

    it('displays stat cards', () => {
      render(<MemoryRouter><StudentDashboard /></MemoryRouter>)
      expect(screen.getByText('Active loans')).toBeTruthy()
      expect(screen.getByText('Reservations')).toBeTruthy()
      expect(screen.getByText('Unread updates')).toBeTruthy()
      expect(screen.getByText('Outstanding fines')).toBeTruthy()
    })

    it('shows current loan section', () => {
      render(<MemoryRouter><StudentDashboard /></MemoryRouter>)
      expect(screen.getByText('Current loan')).toBeTruthy()
      expect(screen.getByText('Clean Code')).toBeTruthy()
    })

    it('displays print service section', () => {
      render(<MemoryRouter><StudentDashboard /></MemoryRouter>)
      expect(screen.getByText('Print service')).toBeTruthy()
      expect(screen.getAllByText(/ready for pickup/i).length).toBeGreaterThanOrEqual(1)
    })

    it('shows clearance status as cleared', () => {
      render(<MemoryRouter><StudentDashboard /></MemoryRouter>)
      expect(screen.getByText(/cleared/i)).toBeTruthy()
    })
  })

  describe('CatalogPage', () => {
    it('renders catalog search page', () => {
      render(<MemoryRouter><CatalogPage /></MemoryRouter>)
      expect(screen.getByRole('heading', { name: /find your next resource/i })).toBeTruthy()
    })

    it('displays search input', () => {
      render(<MemoryRouter><CatalogPage /></MemoryRouter>)
      expect(screen.getByPlaceholderText(/search title, author, or isbn/i)).toBeTruthy()
    })

    it('shows category filter buttons', () => {
      render(<MemoryRouter><CatalogPage /></MemoryRouter>)
      expect(screen.getByRole('button', { name: /all/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /programming/i })).toBeTruthy()
    })

    it('filters books by query', () => {
      render(<MemoryRouter><CatalogPage /></MemoryRouter>)
      const searchInput = screen.getByPlaceholderText(/search title, author, or isbn/i)
      fireEvent.change(searchInput, { target: { value: 'Clean Code' } })
      expect(screen.getByText('Clean Code')).toBeTruthy()
    })

    it('displays result count', () => {
      render(<MemoryRouter><CatalogPage /></MemoryRouter>)
      expect(screen.getByText(/resources found/i)).toBeTruthy()
    })

    it('shows book cards with borrow/reserve options', () => {
      render(<MemoryRouter><CatalogPage /></MemoryRouter>)
      expect(screen.getAllByRole('button', { name: /view details/i }).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('button', { name: /borrow/i }).length).toBeGreaterThan(0)
    })
  })
})