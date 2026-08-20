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
  })
})

afterEach(cleanup)
