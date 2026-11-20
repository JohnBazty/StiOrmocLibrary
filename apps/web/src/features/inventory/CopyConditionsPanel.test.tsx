import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CopyConditionsPanel } from './CopyConditionsPanel'

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('./copy-conditions-api', async original => ({ ...(await original<typeof import('./copy-conditions-api')>()), copyConditionsApi: api }))

const row = (over: Record<string, unknown>) => ({ conditionId: 1, name: 'Good', behavesAs: 'Good', description: 'No damage.', isBase: true, isActive: true, sortOrder: 10, copies: 0, updatedAt: 'v1', ...over })
const conditions = [
  row({}),
  row({ conditionId: 2, name: 'Damaged', behavesAs: 'Damaged', sortOrder: 40 }),
  row({ conditionId: 7, name: 'Water damage', behavesAs: 'Damaged', isBase: false, copies: 3, description: 'Swollen pages.' }),
  row({ conditionId: 8, name: 'Spine loose', behavesAs: 'For Repair', isBase: false, copies: 0, description: null }),
]
beforeEach(() => { api.list.mockResolvedValue(conditions) })
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('lists base and library conditions with how each behaves and how many copies use it', async () => {
  render(<CopyConditionsPanel />)
  const water = (await screen.findByText('Water damage')).closest('tr')!
  expect(within(water).getByText('Damaged')).toBeTruthy()
  expect(within(water).getByText('3')).toBeTruthy()
  const good = screen.getByText('Good', { selector: 'td *, td' }).closest('tr')!
  expect(within(good).getByText('Base')).toBeTruthy()
  expect(within(good).queryByRole('button', { name: /Delete/ })).toBeNull()
  expect(within(good).queryByRole('button', { name: /Retire/ })).toBeNull()
  expect(within(water).queryByRole('button', { name: /Delete/ })).toBeNull()
  expect(within(water).getByRole('button', { name: 'Retire Water damage' })).toBeTruthy()
  expect(within(screen.getByText('Spine loose').closest('tr')!).getByRole('button', { name: 'Delete Spine loose' })).toBeTruthy()
})

it('adds a library condition that behaves like a base condition', async () => {
  api.create.mockResolvedValue(row({ conditionId: 9, name: 'Torn cover', behavesAs: 'Fair', isBase: false }))
  render(<CopyConditionsPanel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add condition' }))
  fireEvent.change(screen.getByLabelText('Condition name'), { target: { value: 'Torn cover' } })
  fireEvent.change(screen.getByLabelText('Behaves like'), { target: { value: 'Fair' } })
  fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'Cover torn, pages fine.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save condition' }))
  await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: 'Torn cover', behavesAs: 'Fair', description: 'Cover torn, pages fine.' }))
  expect(await screen.findByText('Torn cover saved.')).toBeTruthy()
})

it('retires a used condition after confirming and deletes an unused one', async () => {
  api.update.mockResolvedValue(row({ conditionId: 7, name: 'Water damage', isBase: false, isActive: false }))
  api.remove.mockResolvedValue({ conditionId: 8 })
  render(<CopyConditionsPanel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retire Water damage' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
  await waitFor(() => expect(api.update).toHaveBeenCalledWith(7, { isActive: false, updatedAt: 'v1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete Spine loose' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Yes, save' }))
  await waitFor(() => expect(api.remove).toHaveBeenCalledWith(8))
})
