import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThesisInventorySection } from './ThesisInventorySection'

function json(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('ThesisInventorySection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/inventory/thesis/summary')) return json({ success: true, data: { total_thesis_materials: 0, damaged_thesis_count: 0, lost_thesis_count: 0 } })
      if (url.includes('/inventory/thesis?')) return json({ success: true, data: [], meta: { pagination: { page: 1, limit: 25, total: 0, total_pages: 0 } } })
      throw new Error(`Unexpected request: ${url}`)
    }))
  })

  it('shows Not recorded when a bound copy has no adviser', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/inventory/thesis/summary')) return json({ success: true, data: { total_thesis_materials: 1, damaged_thesis_count: 0, lost_thesis_count: 0 } })
      if (url.includes('/inventory/thesis?')) return json({ success: true, data: [
        { research_inventory_id: 12, item_title: 'No Adviser', title: 'No Adviser', authors: 'Researchers', adviser: '', publication_year: 2022, accession_number: 'BSHM-1', barcode: 'B-12', condition_state: 'good', availability_status: 'available', shelf_location: 'Research A', last_audited_at: null, row_version: 1 },
      ], meta: { pagination: { page: 1, limit: 25, total: 1, total_pages: 1 } } })
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<ThesisInventorySection />)
    expect(await screen.findByText('Not recorded')).toBeTruthy()
  })

  it('renders the empty state and the thesis PDF button', async () => {
    render(<ThesisInventorySection />)
    expect(await screen.findByText('No bound research papers found')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download Thesis PDF' })).toBeTruthy()
  })

  it('enables removal only for Lost research copies and opens the availability dialog', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/inventory/thesis/summary')) return json({ success: true, data: { total_thesis_materials: 2, damaged_thesis_count: 1, lost_thesis_count: 1 } })
      if (url.includes('/inventory/thesis?')) return json({ success: true, data: [
        { research_inventory_id: 10, item_title: 'Damaged Thesis', title: 'Damaged Thesis', authors: 'Researchers', adviser: 'Adviser', publication_year: 2026, accession_number: 'TH-10', barcode: 'THESIS-10', condition_state: 'damaged', availability_status: 'available', shelf_location: 'Research A', last_audited_at: null, row_version: 1 },
        { research_inventory_id: 11, item_title: 'Lost Thesis', title: 'Lost Thesis', authors: 'Researchers', adviser: 'Adviser', publication_year: 2026, accession_number: 'TH-11', barcode: 'THESIS-11', condition_state: 'lost', availability_status: 'unavailable', shelf_location: 'Research B', last_audited_at: null, row_version: 1 },
      ], meta: { pagination: { page: 1, limit: 25, total: 2, total_pages: 1 } } })
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<ThesisInventorySection />)

    async function openActions(accession: string) {
      const trigger = await screen.findByLabelText(`Actions for ${accession}`)
      const dropdown = trigger.closest('details')!
      fireEvent.click(trigger)
      expect(dropdown.open).toBe(true)
      return { trigger, dropdown, actions: within(dropdown) }
    }
    const damaged = await openActions('TH-10')
    const damagedDelete = damaged.actions.getByRole('button', { name: 'Delete TH-10' }) as HTMLButtonElement
    const lost = await openActions('TH-11')
    const lostDelete = lost.actions.getByRole('button', { name: 'Delete TH-11' }) as HTMLButtonElement
    expect(damagedDelete.disabled).toBe(true)
    expect(damagedDelete.title).toContain('Mark this research copy as Lost')
    expect(lostDelete.disabled).toBe(false)
    fireEvent.keyDown(lost.trigger, { key: 'Escape' })
    expect(lost.dropdown.open).toBe(false)
    fireEvent.click(damaged.actions.getByRole('button', { name: 'Make unavailable' }))
    expect(screen.getByRole('alertdialog', { name: 'Make copy unavailable?' })).toBeTruthy()
  })
})

afterEach(cleanup)
