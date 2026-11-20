import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConditionModal } from './InventoryDashboard'

afterEach(cleanup)
const copy = { barcode: 'BC-1', accession_number: 'ACC-1', item_title: 'Sample book', availability_status: 'Available', condition_status: 'Good' } as never
const water = { conditionId: 7, name: 'Water damage', behavesAs: 'Damaged' as const, description: 'Swollen pages.', isBase: false, isActive: true, sortOrder: 100, copies: 0, updatedAt: 'v' }

it('offers the library\'s own conditions and saves one by its id', async () => {
  const saveCondition = vi.fn(), saveCustom = vi.fn().mockResolvedValue({}), onSaved = vi.fn().mockResolvedValue(undefined)
  render(<ConditionModal copy={copy} onClose={() => {}} onSaved={onSaved} saveCondition={saveCondition} customConditions={[water]} saveCustom={saveCustom} />)
  fireEvent.click(screen.getByRole('radio', { name: /Water damage/ }))
  expect(screen.getByText(/behaves like Damaged/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Save condition|Update condition|Confirm/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
  await waitFor(() => expect(saveCustom).toHaveBeenCalledWith('BC-1', 7))
  expect(saveCondition).not.toHaveBeenCalled()
})
