import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchCatalog } from './ResearchCatalog'

const api = vi.hoisted(() => ({ fetchResearchCatalog: vi.fn(), fetchResearchOverview: vi.fn() }))
vi.mock('./research-catalog-api', () => api)

const paper = {
  titleId: 4, researchRecordId: 8, researchInventoryId: 12, researchCode: 'R-4',
  title: 'SmartLib Research', authors: 'A. Student, B. Student', adviser: 'Dr. Adviser',
  department: 'BS Information Technology', publicationYear: 2026, shelfLocation: 'Thesis A-1',
  abstract: 'This is the complete research abstract.', keywords: null,
  accessStatus: 'Available' as const, viewOnly: true as const,
}

describe('ResearchCatalog view-only UI', () => {
  it('renders the institutional ledger and never exposes borrow or cart actions', async () => {
    api.fetchResearchCatalog.mockResolvedValue({ items: [paper], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } })
    api.fetchResearchOverview.mockResolvedValue(paper)
    render(<ResearchCatalog />)

    expect(await screen.findByText('SmartLib Research')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search research...')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /borrow/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /add to cart/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(await screen.findByText('This is the complete research abstract.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /borrow/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /add to cart/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Generate APA reference' })).toBeTruthy()
  })

  it('keeps the drawer mounted and shows a localized error when detail loading fails', async () => {
    api.fetchResearchCatalog.mockResolvedValue({ items: [paper], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } })
    api.fetchResearchOverview.mockRejectedValue(new Error('Research details could not be loaded.'))
    render(<ResearchCatalog />)

    fireEvent.click(await screen.findByRole('button', { name: 'View' }))
    expect(await screen.findByText('Research details unavailable')).toBeTruthy()
    expect(screen.getByText('Research details could not be loaded.')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
