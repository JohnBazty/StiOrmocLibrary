import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StocktakePanel } from './StocktakePanel'

const api = vi.hoisted(() => ({
  stocktakeSessions: vi.fn(),
  stocktakeScopeOptions: vi.fn(),
  stocktakePreview: vi.fn(),
  createStocktake: vi.fn(),
  stocktakeSession: vi.fn(),
  stocktakeDiscrepancies: vi.fn(),
  stocktakeScan: vi.fn(),
  closeStocktake: vi.fn(),
  reviewStocktake: vi.fn(),
  resolveStocktakeFinding: vi.fn(),
  downloadStocktakeDiscrepancies: vi.fn(),
}))

vi.mock('./inventory-api', () => ({
  inventoryApi: api,
  InventoryApiError: class InventoryApiError extends Error {
    code: string
    constructor(message: string, code = 'STOCKTAKE_FAILED') {
      super(message)
      this.code = code
    }
  },
}))

vi.mock('./useDesktopScanner', () => ({
  useDesktopScanner: () => undefined,
}))

const scopeOptions = {
  shelves: [{ id: 5, label: 'Shelf A', columnCount: 4, rowCount: 5 }],
  categories: [{ id: 2, name: 'Programming' }],
  rooms: [{ id: 'room-1', name: 'Main floor' }],
}

const openSession = {
  stocktake_session_id: 11,
  session_name: 'Shelf A count',
  scope_kind: 'shelf',
  scope_id: '5',
  scope_label: 'Shelf A',
  asset_kind: 'book',
  status: 'in_progress',
  expected_count: 1,
  present_count: 0,
  missing_count: 0,
  exception_count: 0,
  open_discrepancy_count: 0,
  started_by_label: 'Admin',
  started_at: '2026-10-11T08:00:00+08:00',
  closed_at: null,
  closed_by_label: null,
  reviewed_at: null,
  reviewed_by_label: null,
  cancelled_at: null,
  cancel_reason: null,
  row_version: 1,
}

describe('StocktakePanel', () => {
  it('starts a stocktake, records a manual scan, and closes the count', async () => {
    api.stocktakeSessions.mockResolvedValue({ items: [], pagination: { page: 1, limit: 25, total: 0, total_pages: 0 } })
    api.stocktakeScopeOptions.mockResolvedValue(scopeOptions)
    api.stocktakePreview.mockResolvedValue({ expected_count: 1, book_count: 1, research_count: 0, unplaced_shelves: [] })
    api.createStocktake.mockResolvedValue({ ...openSession, expected_count: 1 })
    api.stocktakeSession.mockResolvedValue(openSession)
    api.stocktakeDiscrepancies.mockResolvedValue({ items: [], pagination: { page: 1, limit: 50, total: 0, total_pages: 0 } })
    api.stocktakeScan.mockResolvedValue({
      stocktake_scan_id: 71,
      duplicate_request: false,
      classification: 'present',
      classifications: [],
      entered_barcode: 'BOOK-1',
      resolved_asset_kind: 'book',
      resolved_source_item_id: 101,
      title: 'Clean Code',
      observed_shelf_label: 'Shelf A',
    })
    api.closeStocktake.mockResolvedValue({
      ...openSession,
      status: 'closed',
      missing_count: 0,
      present_count: 1,
      open_discrepancy_count: 0,
    })

    render(<StocktakePanel />)
    expect(await screen.findByText('No stocktake sessions yet.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Shelf A count' } })
    fireEvent.click(screen.getByRole('button', { name: /Start stocktake/i }))

    await waitFor(() => expect(api.createStocktake).toHaveBeenCalledWith({
      name: 'Shelf A count',
      scopeKind: 'shelf',
      scopeId: '5',
      assetKind: 'book',
    }))
    expect(await screen.findByText('Shelf A count')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close count' })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Manual barcode entry'), { target: { value: 'BOOK-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record scan' }))
    await waitFor(() => expect(api.stocktakeScan).toHaveBeenCalled())
    expect(api.stocktakeScan.mock.calls[0]?.[0]).toBe(11)
    expect(api.stocktakeScan.mock.calls[0]?.[1]?.barcode).toBe('BOOK-1')

    api.stocktakeSession.mockResolvedValue({
      ...openSession,
      status: 'closed',
      present_count: 1,
      open_discrepancy_count: 0,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close count' }))
    await waitFor(() => expect(api.closeStocktake).toHaveBeenCalledWith(11))
    expect(await screen.findByText(/Findings are frozen for review/)).toBeTruthy()
  })

  it('hides scan controls after close and requires dismiss reason for findings', async () => {
    api.stocktakeSessions.mockResolvedValue({
      items: [{ ...openSession, status: 'closed', open_discrepancy_count: 1, missing_count: 1 }],
      pagination: { page: 1, limit: 25, total: 1, total_pages: 1 },
    })
    api.stocktakeScopeOptions.mockResolvedValue(scopeOptions)
    api.stocktakePreview.mockResolvedValue({ expected_count: 1, book_count: 1, research_count: 0, unplaced_shelves: [] })
    api.stocktakeSession.mockResolvedValue({
      ...openSession,
      status: 'closed',
      missing_count: 1,
      open_discrepancy_count: 1,
    })
    api.stocktakeDiscrepancies.mockResolvedValue({
      items: [{
        stocktake_discrepancy_id: 33,
        finding_code: 'missing',
        status: 'open',
        title: 'Clean Code',
        accession_number: 'ACC-1',
        barcode: 'BOOK-1',
        home_shelf_label: 'Shelf A',
        row_version: 1,
      }],
      pagination: { page: 1, limit: 50, total: 1, total_pages: 1 },
    })
    api.resolveStocktakeFinding.mockResolvedValue({})
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Verified after recall')

    render(<StocktakePanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Shelf A count' }))
    expect(await screen.findByText('Missing')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Manual barcode entry')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(api.resolveStocktakeFinding).toHaveBeenCalledWith(11, 33, {
      expectedRowVersion: 1,
      action: 'dismiss',
      reason: 'Verified after recall',
    }))
    prompt.mockRestore()
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
