import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PrintingPaperSettings } from './PrintingPaperSettings'

const api = vi.hoisted(() => ({ supplies: vi.fn() }))
vi.mock('./printing-api', () => ({ printingApi: api }))
vi.mock('./PaperSizesDialog', () => ({ PaperSizesDialog: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Paper sizes"><button onClick={onClose}>Close sizes</button></div> }))
vi.mock('./PaperStockDialog', () => ({ PaperStockDialog: ({ sizes, onSaved }: { sizes: Array<{ paper_size_dimension: string }>; onSaved: (message: string) => Promise<void> }) => <div role="dialog" aria-label="Paper stock and prices"><p>{sizes.map(size => size.paper_size_dimension).join(',')}</p><button onClick={() => void onSaved('A4 prices saved.')}>Save prices</button></div> }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('keeps paper sizes and brand prices editable in Printing settings after Print supplies is archived', async () => {
  api.supplies.mockResolvedValue({ ink: [], paper: [{ paper_stock_id: 1, paper_size_dimension: 'A4' }], summary: {} })
  render(<PrintingPaperSettings />)
  expect(await screen.findByRole('heading', { name: 'Paper sizes and prices' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Manage paper sizes' }))
  expect(screen.getByRole('dialog', { name: 'Paper sizes' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close sizes' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Paper stock and prices' }))
  expect(screen.getByRole('dialog', { name: 'Paper stock and prices' }).textContent).toContain('A4')
  fireEvent.click(screen.getByRole('button', { name: 'Save prices' }))
  expect(await screen.findByText('A4 prices saved.')).toBeTruthy()
  await waitFor(() => expect(api.supplies).toHaveBeenCalledTimes(2))
})
