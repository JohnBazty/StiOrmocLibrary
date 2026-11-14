import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminDashboard, CatalogManagementPage, CirculationPage, FinesPage, UsersPage } from './AdminPages'

vi.mock('../../data/mockData', () => ({
  adminKpis: [{ label: 'Active borrowed', value: '184', note: '7.4% of collection', tone: 'blue' }],
  attendance: [{ id: 1, user: 'John Bazty Cantay', studentId: '02000241372', date: 'Aug 15, 2026', checkIn: '8:12 AM', checkOut: '-', purpose: 'Library visit' }],
  books: [{ id: 1, title: 'Clean Code', author: 'Robert C. Martin', isbn: '978-0132350884', year: 2008, category: 'Software Engineering', shelf: 'IT-A12', available: 3, total: 5, status: 'available', cover: 'CC', accent: 'from-[#003399] to-[#003399]' }],
  fines: [{ id: 'FN-0912', user: 'Mika Santos', studentId: '02000241918', book: 'Computer Networks', amount: '₱24.00', reason: '12 hours overdue', status: 'unpaid' }],
  loans: [{ id: 'BR-1048', user: 'John Bazty Cantay', studentId: '02000241372', book: 'Clean Code', copy: 'BC-00128', borrowed: 'Aug 14, 2026 - 9:20 AM', due: 'Aug 15, 2026 - 8:59 AM', status: 'active' }],
  printRequests: [{ id: 'PR-2041', user: 'John Bazty Cantay', file: 'Capstone-Chapter-1.pdf', pages: 18, copies: 1, type: 'Black & white', amount: '₱36.00', status: 'ready_for_pickup', created: 'Aug 15, 2026 - 8:40 AM' }],
  reports: [{ id: 'REP-01', name: 'Daily Attendance Summary', description: 'Visitor totals', category: 'Attendance', updated: 'Today, 9:30 AM' }],
  reservations: [{ id: 'RS-3004', user: 'John Bazty Cantay', book: 'Introduction to Algorithms', queue: 2, requested: 'Aug 13, 2026', status: 'queued' }],
  researchPapers: [{ id: 'TH-0014', title: 'Smart Campus Attendance', authors: 'A. Reyes', department: 'BSIT', year: 2025, shelf: 'TH-01', availability: 'Room use' }],
  supplies: [{ id: 'INK-001', name: 'Epson 003 Black Ink', type: 'Ink', printer: 'Front Desk Epson L3210', level: 72, unit: '%' }],
  users: [{ id: '02000241372', name: 'John Bazty Cantay', email: 'cantay242@gmail.com', role: 'Student', program: 'BSIT-3A', status: 'active', clearance: 'cleared' }],
}))

describe('AdminPages', () => {
  afterEach(() => { cleanup() })

  describe('AdminDashboard', () => {
    it('renders greeting and description', () => {
      render(<MemoryRouter><AdminDashboard /></MemoryRouter>)
      expect(screen.getByRole('heading', { name: /Good morning, Judelyn/i })).toBeTruthy()
      expect(screen.getByText(/library operations/i)).toBeTruthy()
    })

    it('shows refresh and export action buttons', () => {
      render(<MemoryRouter><AdminDashboard /></MemoryRouter>)
      expect(screen.getByRole('button', { name: /refresh/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /export summary/i })).toBeTruthy()
    })

    it('displays KPI stat cards', () => {
      render(<MemoryRouter><AdminDashboard /></MemoryRouter>)
      expect(screen.getByText('Active borrowed')).toBeTruthy()
    })
  })

  describe('CatalogManagementPage', () => {
    it('renders the catalog management page', () => {
      render(<MemoryRouter><CatalogManagementPage /></MemoryRouter>)
      expect(screen.getByRole('heading', { name: /books and research management/i })).toBeTruthy()
    })

    it('displays stat cards with counts', () => {
      render(<MemoryRouter><CatalogManagementPage /></MemoryRouter>)
      expect(screen.getByText(/book titles/i)).toBeTruthy()
      expect(screen.getByText(/research papers/i)).toBeTruthy()
      expect(screen.getByText(/categories/i)).toBeTruthy()
    })

    it('shows search input', () => {
      render(<MemoryRouter><CatalogManagementPage /></MemoryRouter>)
      expect(screen.getByPlaceholderText(/search catalog/i)).toBeTruthy()
    })

    it('has add book button', () => {
      render(<MemoryRouter><CatalogManagementPage /></MemoryRouter>)
      expect(screen.getByRole('button', { name: /add book/i })).toBeTruthy()
    })
  })

  describe('CirculationPage', () => {
    it('renders circulation dashboard', () => {
      render(<MemoryRouter><CirculationPage /></MemoryRouter>)
      expect(screen.getByRole('heading', { name: /borrow and return monitoring/i })).toBeTruthy()
    })

    it('displays stat cards for circulation metrics', () => {
      render(<MemoryRouter><CirculationPage /></MemoryRouter>)
      expect(screen.getByText(/active borrows/i)).toBeTruthy()
      expect(screen.getByText(/due today/i)).toBeTruthy()
      expect(screen.getByText(/overdue/i)).toBeTruthy()
    })
  })

  describe('FinesPage', () => {
    it('renders fines management page', () => {
      render(<MemoryRouter><FinesPage /></MemoryRouter>)
      expect(screen.getByRole('heading', { name: /fines management/i })).toBeTruthy()
    })

    it('displays fine stat cards', () => {
      render(<MemoryRouter><FinesPage /></MemoryRouter>)
      expect(screen.getByText(/total fines/i)).toBeTruthy()
      expect(screen.getAllByText(/unpaid/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/paid/i).length).toBeGreaterThan(0)
    })

    it('has export PDF button', () => {
      render(<MemoryRouter><FinesPage /></MemoryRouter>)
      expect(screen.getByRole('button', { name: /export pdf/i })).toBeTruthy()
    })
  })

  describe('UsersPage', () => {
    it('renders users management page', () => {
      render(<MemoryRouter><UsersPage /></MemoryRouter>)
      expect(screen.getByRole('heading', { name: /library users/i })).toBeTruthy()
    })

    it('displays user stat cards', () => {
      render(<MemoryRouter><UsersPage /></MemoryRouter>)
      expect(screen.getByText(/active accounts/i)).toBeTruthy()
      expect(screen.getByText(/student accounts/i)).toBeTruthy()
    })

    it('shows add user button', () => {
      render(<MemoryRouter><UsersPage /></MemoryRouter>)
      expect(screen.getByRole('button', { name: /add user/i })).toBeTruthy()
    })
  })
})