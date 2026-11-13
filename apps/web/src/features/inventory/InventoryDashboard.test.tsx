import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { InventoryDashboard } from './InventoryDashboard'

function json(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('InventoryDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/summary')) return json({ success: true, data: { total_catalog_materials: 0, total_physical_copies: 0, damaged_copies_count: 0, lost_copies_count: 0 } })
      if (url.includes('/copies?')) return json({ success: true, data: [], meta: { pagination: { page: 1, limit: 25, total: 0, total_pages: 0 } } })
      throw new Error(`Unexpected request: ${url}`)
    }))
  })

  it('renders zero metrics and the explicit empty state from a live empty response', async () => {
    render(<MemoryRouter><InventoryDashboard /></MemoryRouter>)
    expect(await screen.findByText('No physical copies found')).toBeTruthy()
    expect(screen.getByText('0 physical copies')).toBeTruthy()
    expect(screen.getByText('Scanner listening')).toBeTruthy()
    expect(screen.queryByText('CSV')).toBeNull()
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy()
    expect(screen.queryByText('Research and thesis inventory')).toBeNull()
    expect(screen.getByRole('link', { name: 'Research maintenance' }).getAttribute('href')).toBe('/librarian/research-maintenance')
  })

  it('opens row actions and enables removal only for Lost copies with no active allocation', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/copies?')) return json({ success: true, data: [
        { physical_copy_id: 1, title_id: 1, item_title: 'Borrowed Book', authors: ['Author'], category_name: 'Books', accession_number: 'ACC-1', barcode: 'BOOK-1', shelf_location: 'Shelf A', condition_status: 'Good', availability_status: 'Borrowed', last_verified_at: null, row_version: 1 },
        { physical_copy_id: 2, title_id: 2, item_title: 'Available Book', authors: ['Author'], category_name: 'Books', accession_number: 'ACC-2', barcode: 'BOOK-2', shelf_location: 'Shelf B', condition_status: 'Good', availability_status: 'Available', last_verified_at: null, row_version: 1 },
        { physical_copy_id: 3, title_id: 3, item_title: 'Lost Book', authors: ['Author'], category_name: 'Books', accession_number: 'ACC-3', barcode: 'BOOK-3', shelf_location: 'Shelf C', condition_status: 'Lost', availability_status: 'Unavailable', last_verified_at: null, row_version: 1 },
      ], meta: { pagination: { page: 1, limit: 25, total: 3, total_pages: 1 } } })
      if (url.includes('/summary')) return json({ success: true, data: { total_catalog_materials: 3, total_physical_copies: 3, damaged_copies_count: 0, lost_copies_count: 1 } })
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(<MemoryRouter><InventoryDashboard /></MemoryRouter>)

    async function openActions(accession: string) {
      const trigger = await screen.findByLabelText(`Actions for ${accession}`)
      const dropdown = trigger.closest('details')!
      expect(dropdown.open).toBe(false)
      fireEvent.click(trigger)
      expect(dropdown.open).toBe(true)
      return { trigger, dropdown, actions: within(dropdown) }
    }

    const borrowed = await openActions('ACC-1')
    const borrowedDelete = borrowed.actions.getByRole('button', { name: 'Delete ACC-1' }) as HTMLButtonElement
    expect((borrowed.actions.getByRole('button', { name: 'Report lost' }) as HTMLButtonElement).disabled).toBe(true)
    const available = await openActions('ACC-2')
    const availableDelete = available.actions.getByRole('button', { name: 'Delete ACC-2' }) as HTMLButtonElement
    const lost = await openActions('ACC-3')
    const lostDelete = lost.actions.getByRole('button', { name: 'Delete ACC-3' }) as HTMLButtonElement
    expect(borrowedDelete.disabled).toBe(true)
    expect(borrowedDelete.title).toContain('Process the return')
    expect(availableDelete.disabled).toBe(true)
    expect(availableDelete.title).toContain('Mark this copy as Lost')
    expect(lostDelete.disabled).toBe(false)

    fireEvent.keyDown(lost.trigger, { key: 'Escape' })
    expect(lost.dropdown.open).toBe(false)
    available.dropdown.open = true
    fireEvent.click(available.actions.getByRole('button', { name: 'Make unavailable' }))
    expect(available.dropdown.open).toBe(false)
    expect(screen.getByRole('alertdialog', { name: 'Make copy unavailable?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(available.trigger)
    fireEvent.click(available.actions.getByRole('button', { name: 'Report lost' }))
    const reportLost = within(screen.getByRole('dialog', { name: 'Update physical condition' }))
    expect((reportLost.getByRole('radio', { name: 'lost' }) as HTMLInputElement).checked).toBe(true)
  })
})

afterEach(cleanup)
