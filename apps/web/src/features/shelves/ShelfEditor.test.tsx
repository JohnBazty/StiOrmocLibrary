import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ShelfEditor } from './ShelfEditor'
import { ShelfPlacementFields, placementFits } from './ShelfPlacementFields'
import type { ManagedShelf } from './types'

afterEach(cleanup)
const shelf: ManagedShelf = { id: 1, label: 'Shelf A', columnCount: 2, rowCount: 1, defaultCapacity: 10, capacityConfigured: true, version: 2, status: 'Active', used: 14, capacity: 20, remaining: 6, compartments: [{ column: 1, row: 1, capacity: 10, used: 10, remaining: 0, status: 'Full' }, { column: 2, row: 1, capacity: 10, used: 4, remaining: 6, status: 'Available' }] }

it('saves dimensions and individual compartment capacities without inventing a limit', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<ShelfEditor shelf={shelf} saving={false} onSave={save} onCancel={vi.fn()} />)
  expect((screen.getByLabelText('Copies per compartment') as HTMLInputElement).value).toBe('10')
  fireEvent.change(screen.getByLabelText('Capacity for Column 2, Row 1'), { target: { value: '15' } })
  expect(screen.getByText('Total capacity: 25 copies')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save shelf' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith({ label: 'Shelf A', columnCount: 2, rowCount: 1, defaultCapacity: 10, overrides: [{ column: 2, row: 1, capacity: 15 }], version: 2, status: 'Active' }))
})

it('requires staff to enter a capacity for a new shelf', () => {
  render(<ShelfEditor shelf={null} saving={false} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect((screen.getByLabelText('Copies per compartment') as HTMLInputElement).value).toBe('')
  expect((screen.getByRole('button', { name: 'Save shelf' }) as HTMLButtonElement).disabled).toBe(true)
})

it('shows the shortage and permits staff to choose another compartment', () => {
  const change = vi.fn()
  render(<ShelfPlacementFields shelves={[shelf]} value={{ shelfLocation: 'Shelf A', locationId: 1, shelfColumn: 1, shelfRow: 1 }} quantity={2} onChange={change} />)
  expect(screen.getByText(/Only 0 spaces remain/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Column'), { target: { value: '2' } })
  expect(change).toHaveBeenCalledWith({ shelfLocation: 'Shelf A', locationId: 1, shelfColumn: 2, shelfRow: 1 })
  expect(placementFits([shelf], { shelfLocation: 'Shelf A', shelfColumn: 1, shelfRow: 1 }, 2)).toBe(false)
  expect(placementFits([shelf], { shelfLocation: 'Shelf A', shelfColumn: 2, shelfRow: 1 }, 6)).toBe(true)
})

it('opens shelf setup when capacity is not configured', () => {
  const unconfigured = { ...shelf, capacityConfigured: false, compartments: undefined }
  render(<MemoryRouter><ShelfPlacementFields shelves={[unconfigured]} value={{ shelfLocation: 'Shelf A', locationId: 1, shelfColumn: 1, shelfRow: 1 }} onChange={vi.fn()} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: /Capacity not configured/ }).getAttribute('href')).toBe('/librarian/maintenance?tab=locations&editShelf=1')
})
