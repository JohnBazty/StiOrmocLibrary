import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MoveCopiesDialog } from './MoveCopiesDialog'
import { RestoreCopiesDialog } from './RestoreCopiesDialog'

const api = vi.hoisted(() => ({ listShelves: vi.fn(), moveCopies: vi.fn(), restoreCopies: vi.fn() }))
vi.mock('../categories/category-api', () => ({ categoryApi: api }))
vi.mock('../catalog/enhanced-catalog-api', () => ({ enhancedCatalog: api }))
const shelves = [{ id: 2, label: 'Shelf B', status: 'Active', version: 1, columnCount: 1, rowCount: 1, defaultCapacity: 2, capacityConfigured: true, capacity: 2, used: 2, remaining: 0, compartments: [{ column: 1, row: 1, capacity: 2, used: 2, remaining: 0, status: 'Full' }] }]
beforeEach(() => { api.listShelves.mockResolvedValue(shelves); api.moveCopies.mockResolvedValue({moved:1}); api.restoreCopies.mockResolvedValue({restored:1}) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('moves selected copies only after confirmation and credits their existing reserved space', async () => {
  const moved = vi.fn().mockResolvedValue(undefined)
  render(<MoveCopiesDialog kind="Book" copies={[{ id: 7, accession: 'ACC-7', shelfLocation: 'Shelf B', shelfColumn: 1, shelfRow: 1 }]} onClose={vi.fn()} onMoved={moved}/>)
  const button = await screen.findByRole('button', {name:'Move 1 copy'})
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
  expect(api.moveCopies).not.toHaveBeenCalled()
  expect(screen.getByText(/1 spaces remaining/)).toBeTruthy()
  fireEvent.click(button)
  expect(api.moveCopies).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
  await waitFor(() => expect(api.moveCopies).toHaveBeenCalledWith({kind:'Book',copyIds:[7],locationId:2,shelfColumn:1,shelfRow:1}))
  expect(moved).toHaveBeenCalledTimes(1)
})

it('blocks a move into a full destination and keeps the copies unchanged', async () => {
  render(<MoveCopiesDialog kind="Research/Thesis" copies={[{ id: 7, accession: 'RES-7', shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 1 }]} onClose={vi.fn()} onMoved={vi.fn()}/>)
  await screen.findByRole('option',{name:'Shelf B (0 spaces free)'})
  fireEvent.change(screen.getByLabelText('Shelf location *'),{target:{value:'Shelf B'}})
  expect(screen.getByText(/Only 0 spaces remain/)).toBeTruthy()
  expect((screen.getByRole('button',{name:'Move 1 copy'}) as HTMLButtonElement).disabled).toBe(true)
  expect(api.moveCopies).not.toHaveBeenCalled()
})

it('keeps a failed restoration open and allows another compartment to be chosen', async () => {
  api.restoreCopies.mockRejectedValueOnce(new Error('Original shelf is full.'))
  render(<RestoreCopiesDialog title="Archived book" copyIds={[7]} quantity={1} onClose={vi.fn()} onRestored={vi.fn()}/>)
  fireEvent.click(screen.getByRole('button',{name:'Restore to inventory'}))
  fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(api.restoreCopies).toHaveBeenCalledWith({kind:'Book',copyIds:[7]})
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('dialog',{name:'Restore archived books'})).toBeTruthy()
  expect((screen.getByRole('button',{name:'Restore to inventory'}) as HTMLButtonElement).disabled).toBe(true)
})
