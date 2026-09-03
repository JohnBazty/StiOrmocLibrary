import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryDashboard } from './InventoryDashboard'

function json(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('InventoryDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/inventory/thesis/summary')) return json({ success: true, data: { total_thesis_materials: 0, damaged_thesis_count: 0, lost_thesis_count: 0 } })
      if (url.includes('/inventory/thesis?')) return json({ success: true, data: [], meta: { pagination: { page: 1, limit: 25, total: 0, total_pages: 0 } } })
      if (url.includes('/summary')) return json({ success: true, data: { total_catalog_materials: 0, total_physical_copies: 0, damaged_copies_count: 0, lost_copies_count: 0 } })
      if (url.includes('/copies?')) return json({ success: true, data: [], meta: { pagination: { page: 1, limit: 25, total: 0, total_pages: 0 } } })
      throw new Error(`Unexpected request: ${url}`)
    }))
  })

  it('renders zero metrics and the explicit empty state from a live empty response', async () => {
    render(<InventoryDashboard />)
    expect(await screen.findByText('No physical copies found')).toBeTruthy()
    expect(screen.getByText('0 physical copies')).toBeTruthy()
    expect(screen.getByText('Scanner listening')).toBeTruthy()
    expect(screen.queryByText('CSV')).toBeNull()
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download Thesis PDF' })).toBeTruthy()
  })

  it('enables book and thesis removal only for Lost copies with no active allocation', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/inventory/thesis/summary')) return json({ success: true, data: { total_thesis_materials: 2, damaged_thesis_count: 1, lost_thesis_count: 1 } })
      if (url.includes('/inventory/thesis?')) return json({ success: true, data: [
        { research_inventory_id: 10, item_title: 'Damaged Thesis', title: 'Damaged Thesis', authors: 'Researchers', adviser: 'Adviser', publication_year: 2026, accession_number: 'TH-10', barcode: 'THESIS-10', condition_state: 'damaged', availability_status: 'available', shelf_location: 'Research A', last_audited_at: null, row_version: 1 },
        { research_inventory_id: 11, item_title: 'Lost Thesis', title: 'Lost Thesis', authors: 'Researchers', adviser: 'Adviser', publication_year: 2026, accession_number: 'TH-11', barcode: 'THESIS-11', condition_state: 'lost', availability_status: 'unavailable', shelf_location: 'Research B', last_audited_at: null, row_version: 1 },
      ], meta: { pagination: { page: 1, limit: 25, total: 2, total_pages: 1 } } })
      if (url.includes('/copies?')) return json({ success: true, data: [
        { physical_copy_id: 1, title_id: 1, item_title: 'Borrowed Book', authors: ['Author'], category_name: 'Books', accession_number: 'ACC-1', barcode: 'BOOK-1', shelf_location: 'Shelf A', condition_status: 'Good', availability_status: 'Borrowed', last_verified_at: null, row_version: 1 },
        { physical_copy_id: 2, title_id: 2, item_title: 'Available Book', authors: ['Author'], category_name: 'Books', accession_number: 'ACC-2', barcode: 'BOOK-2', shelf_location: 'Shelf B', condition_status: 'Good', availability_status: 'Available', last_verified_at: null, row_version: 1 },
        { physical_copy_id: 3, title_id: 3, item_title: 'Lost Book', authors: ['Author'], category_name: 'Books', accession_number: 'ACC-3', barcode: 'BOOK-3', shelf_location: 'Shelf C', condition_status: 'Lost', availability_status: 'Unavailable', last_verified_at: null, row_version: 1 },
      ], meta: { pagination: { page: 1, limit: 25, total: 3, total_pages: 1 } } })
      if (url.includes('/summary')) return json({ success: true, data: { total_catalog_materials: 3, total_physical_copies: 3, damaged_copies_count: 0, lost_copies_count: 1 } })
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(<InventoryDashboard />)

    const borrowedDelete = await screen.findByRole('button', { name: 'Delete ACC-1' }) as HTMLButtonElement
    const availableDelete = screen.getByRole('button', { name: 'Delete ACC-2' }) as HTMLButtonElement
    const lostDelete = screen.getByRole('button', { name: 'Delete ACC-3' }) as HTMLButtonElement
    expect(borrowedDelete.disabled).toBe(true)
    expect(borrowedDelete.title).toContain('Process the return')
    expect(availableDelete.disabled).toBe(true)
    expect(availableDelete.title).toContain('Mark this copy as Lost')
    expect(lostDelete.disabled).toBe(false)
    const damagedThesisDelete = await screen.findByRole('button', { name: 'Delete TH-10' }) as HTMLButtonElement
    const lostThesisDelete = screen.getByRole('button', { name: 'Delete TH-11' }) as HTMLButtonElement
    expect(damagedThesisDelete.disabled).toBe(true)
    expect(damagedThesisDelete.title).toContain('Mark this research copy as Lost')
    expect(lostThesisDelete.disabled).toBe(false)
  })
})

afterEach(cleanup)
