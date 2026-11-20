import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ViolationRulesPanel } from './ViolationRulesPanel'
import { describeCategory, ViolationCategoryError, violationCategoriesApi, type ViolationCategory } from './violation-categories-api'

vi.mock('./violation-categories-api', async original => ({
  ...(await original<typeof import('./violation-categories-api')>()),
  violationCategoriesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
}))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const noise: ViolationCategory = { categoryId: 1, name: 'Noise', description: 'Loud talking', warningsBeforeFine: 2, fineAmount: 50, isActive: true, sortOrder: 1, used: true, updatedAt: 'v-noise' }
const food: ViolationCategory = { categoryId: 2, name: 'Eating or food', description: null, warningsBeforeFine: 1, fineAmount: 75.5, isActive: false, sortOrder: 2, used: false, updatedAt: 'v-food' }
const api = vi.mocked(violationCategoriesApi)

it('describes each rule in plain words', () => {
  expect(describeCategory(noise)).toBe('2 warnings, then PHP 50.00 on the 3rd offense.')
  expect(describeCategory({ warningsBeforeFine: 1, fineAmount: 20 })).toBe('1 warning, then PHP 20.00 on the 2nd offense.')
  expect(describeCategory({ warningsBeforeFine: 0, fineAmount: 20 })).toBe('No warnings. PHP 20.00 on the 1st offense.')
})

it('shows one table of categories with status text and a single primary action', async () => {
  api.list.mockResolvedValue([noise, food])
  render(<ViolationRulesPanel />)
  const table = await screen.findByRole('table', { name: /Violation categories/ })
  expect(within(table).getByText('Noise')).toBeTruthy()
  expect(within(table).getByText('2 warnings, then PHP 50.00 on the 3rd offense.')).toBeTruthy()
  expect(within(table).getByText('Retired')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Add category' })).toHaveLength(1)
})

it('blocks a bad new category with inline messages, then saves a valid one', async () => {
  api.list.mockResolvedValue([noise])
  api.create.mockResolvedValue({ ...noise, categoryId: 3, name: 'Phone use', used: false })
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
  const dialog = screen.getByRole('dialog', { name: 'Add violation category' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save category' }))
  expect(within(dialog).getByText('Enter a category name of 2 to 80 characters.')).toBeTruthy()
  expect(within(dialog).getByText('Enter a peso amount above 0 with at most 2 decimals.')).toBeTruthy()
  expect(api.create).not.toHaveBeenCalled()

  fireEvent.change(within(dialog).getByLabelText('Category name'), { target: { value: 'Phone use' } })
  fireEvent.change(within(dialog).getByLabelText('Warnings before the fine'), { target: { value: '1' } })
  fireEvent.change(within(dialog).getByLabelText('Fine amount (PHP)'), { target: { value: '25' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save category' }))
  await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: 'Phone use', description: '', warningsBeforeFine: 1, fineAmount: '25' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(api.list).toHaveBeenCalledTimes(2)
})

it('shows a server error beside the field it belongs to', async () => {
  api.list.mockResolvedValue([noise])
  api.create.mockRejectedValue(new ViolationCategoryError('A category with this name already exists.', { name: 'A category with this name already exists.' }))
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Category name'), { target: { value: 'Noise' } })
  fireEvent.change(within(dialog).getByLabelText('Fine amount (PHP)'), { target: { value: '25' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save category' }))
  expect(await within(dialog).findByText('A category with this name already exists.')).toBeTruthy()
})

it('locks the name of a used category and retires it from the edit dialog', async () => {
  api.list.mockResolvedValue([noise])
  api.update.mockResolvedValue({ ...noise, isActive: false })
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  fireEvent.click(screen.getByRole('button', { name: 'Edit Noise' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit violation category' })
  expect((within(dialog).getByLabelText('Category name') as HTMLInputElement).disabled).toBe(true)
  expect(within(dialog).getByText(/name cannot change/i)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Retire category' }))
  await waitFor(() => expect(api.update).toHaveBeenCalledWith(1, { isActive: false, updatedAt: 'v-noise' }))
})

it('restores a retired category and sends only changed rule fields on save', async () => {
  api.list.mockResolvedValue([food])
  api.update.mockResolvedValue({ ...food, isActive: true })
  render(<ViolationRulesPanel />)
  await screen.findByText('Eating or food')
  fireEvent.click(screen.getByRole('button', { name: 'Edit Eating or food' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Restore category' }))
  await waitFor(() => expect(api.update).toHaveBeenCalledWith(2, { isActive: true, updatedAt: 'v-food' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit Eating or food' }))
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Fine amount (PHP)'), { target: { value: '80' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save category' }))
  await waitFor(() => expect(api.update).toHaveBeenLastCalledWith(2, { fineAmount: '80', updatedAt: 'v-food' }))
})

it('offers a retry when the list cannot load', async () => {
  api.list.mockRejectedValueOnce(new Error('Violation rules are unavailable.')).mockResolvedValue([noise])
  render(<ViolationRulesPanel />)
  expect(await screen.findByText('Violation rules are unavailable.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Noise')).toBeTruthy()
})

it('explains a change made by someone else and refreshes the table behind the dialog', async () => {
  api.list.mockResolvedValue([noise])
  api.update.mockRejectedValue(new ViolationCategoryError('This category was changed by someone else. Reload the rules and try again.'))
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  fireEvent.click(screen.getByRole('button', { name: 'Edit Noise' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retire category' }))
  expect(await screen.findByText(/changed by someone else/)).toBeTruthy()
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
})
