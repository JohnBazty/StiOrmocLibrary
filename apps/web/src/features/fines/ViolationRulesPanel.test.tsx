import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ViolationRulesPanel } from './ViolationRulesPanel'
import { describeAllowedLevels, describeSharedWarningRule, STUDENT_LEVELS, ViolationCategoryError, violationCategoriesApi, type ViolationCategory } from './violation-categories-api'

vi.mock('./violation-categories-api', async original => ({
  ...(await original<typeof import('./violation-categories-api')>()),
  violationCategoriesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), getSettings: vi.fn(), saveSettings: vi.fn() },
}))
afterEach(() => { cleanup(); vi.clearAllMocks() })
beforeEach(() => {
  vi.mocked(violationCategoriesApi.getSettings).mockResolvedValue({ maxFine: 9999.99, warningsBeforeFine: 2, levelWarnings: {}, updatedAt: 's1' })
})

const allLevels = [...STUDENT_LEVELS]
const noise: ViolationCategory = { categoryId: 1, name: 'Noise', description: 'Loud talking', warningsBeforeFine: 2, fineAmount: 50, allowedLevels: allLevels, isActive: true, sortOrder: 1, used: true, updatedAt: 'v-noise' }
const food: ViolationCategory = { categoryId: 2, name: 'Eating or food', description: null, warningsBeforeFine: 2, fineAmount: 75.5, allowedLevels: ['Grade 11', '1st Year'], isActive: false, sortOrder: 2, used: false, updatedAt: 'v-food' }
const api = vi.mocked(violationCategoriesApi)

it('describes shared warning rules and allowed levels in plain words', () => {
  expect(describeSharedWarningRule({ warningsBeforeFine: 2, levelWarnings: {} })).toBe('2 warnings across all violations — fine starts on the 3rd offense. Applies to all year & grade levels.')
  expect(describeSharedWarningRule({ warningsBeforeFine: 1, levelWarnings: { '1st Year': 2, 'Grade 11': 0 } })).toBe('1 warning across all violations — fine starts on the 2nd offense. Custom limits: Grade 11: 0 · 1st Year: 2.')
  expect(describeSharedWarningRule({ warningsBeforeFine: 0, levelWarnings: {} })).toBe('0 warnings across all violations — fine starts on the 1st offense. Applies to all year & grade levels.')
  expect(describeAllowedLevels(allLevels)).toBe('All levels')
  expect(describeAllowedLevels(['Grade 11', '1st Year'])).toBe('Grade 11, 1st Year')
})

it('shows shared warning rule bar and one table of categories with Applies to and Fine amount', async () => {
  api.list.mockResolvedValue([noise, food])
  render(<ViolationRulesPanel />)
  const table = await screen.findByRole('table', { name: /Violation categories/ })
  expect(screen.getByText('Shared warnings before fine')).toBeTruthy()
  expect(screen.getByText(/2 warnings across all violations/)).toBeTruthy()
  expect(within(table).getByText('Noise')).toBeTruthy()
  expect(within(table).getByText('All levels')).toBeTruthy()
  expect(within(table).getByText('Grade 11, 1st Year')).toBeTruthy()
  expect(within(table).getByText('Retired')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Add category' })).toHaveLength(1)
})

it('blocks a bad new category with inline messages, then saves a valid one with chosen levels', async () => {
  api.list.mockResolvedValue([noise])
  api.create.mockResolvedValue({ ...noise, categoryId: 3, name: 'Phone use', allowedLevels: ['1st Year', 'Grade 11'], used: false })
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
  const dialog = screen.getByRole('dialog', { name: 'Add violation category' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save category' }))
  expect(within(dialog).getByText('Enter a category name of 2 to 80 characters.')).toBeTruthy()
  expect(within(dialog).getByText('Enter a peso amount above 0 and up to 9,999.99, with at most 2 decimals.')).toBeTruthy()
  expect(api.create).not.toHaveBeenCalled()

  fireEvent.change(within(dialog).getByLabelText('Category name'), { target: { value: 'Phone use' } })
  fireEvent.change(within(dialog).getByLabelText('Fine amount (PHP)'), { target: { value: '25' } })
  fireEvent.click(within(dialog).getByLabelText('All year & grade levels'))
  for (const level of ['Grade 12', '2nd Year', '3rd Year', '4th Year']) {
    fireEvent.click(within(dialog).getByLabelText(level))
  }
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save category' }))
  await waitFor(() => expect(api.create).toHaveBeenCalledWith({
    name: 'Phone use',
    description: '',
    fineAmount: '25',
    allowedLevels: ['Grade 11', '1st Year'],
  }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(api.list).toHaveBeenCalledTimes(2)
})

it('lets the librarian customize shared warning limits by year and grade level with numeric inputs above 3', async () => {
  api.list.mockResolvedValue([noise])
  api.saveSettings.mockResolvedValue({ maxFine: 9999.99, warningsBeforeFine: 5, levelWarnings: { '1st Year': 10, 'Grade 11': 4 }, updatedAt: 's2' })
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  fireEvent.click(screen.getByRole('button', { name: 'Change warning rules' }))
  const dialog = screen.getByRole('dialog', { name: 'Shared warning rules' })
  fireEvent.change(within(dialog).getByLabelText('Default warnings before fine'), { target: { value: '5' } })
  fireEvent.click(within(dialog).getByLabelText('Customize by year / grade level'))
  fireEvent.change(within(dialog).getByLabelText('Grade 11'), { target: { value: '4' } })
  fireEvent.change(within(dialog).getByLabelText('1st Year'), { target: { value: '10' } })
  fireEvent.change(within(dialog).getByLabelText('Grade 12'), { target: { value: '5' } })
  fireEvent.change(within(dialog).getByLabelText('2nd Year'), { target: { value: '5' } })
  fireEvent.change(within(dialog).getByLabelText('3rd Year'), { target: { value: '5' } })
  fireEvent.change(within(dialog).getByLabelText('4th Year'), { target: { value: '5' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save warning rules' }))
  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({
    warningsBeforeFine: 5,
    levelWarnings: { 'Grade 11': 4, '1st Year': 10 },
    updatedAt: 's1',
  }))
  expect(await screen.findByText(/Custom limits: Grade 11: 4 · 1st Year: 10/)).toBeTruthy()
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

it('limits the fine to four digits, before saving', async () => {
  api.list.mockResolvedValue([noise])
  api.create.mockResolvedValue({ ...noise, categoryId: 3, name: 'Phone use', used: false })
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
  const dialog = screen.getByRole('dialog', { name: 'Add violation category' })
  expect(within(dialog).getByText('Up to PHP 9,999.99')).toBeTruthy()
  fireEvent.change(within(dialog).getByLabelText('Category name'), { target: { value: 'Phone use' } })
  for (const tooMuch of ['10000', '12345.50', '99999']) {
    fireEvent.change(within(dialog).getByLabelText('Fine amount (PHP)'), { target: { value: tooMuch } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save category' }))
    expect(within(dialog).getByText('Enter a peso amount above 0 and up to 9,999.99, with at most 2 decimals.')).toBeTruthy()
  }
  expect(api.create).not.toHaveBeenCalled()
  fireEvent.change(within(dialog).getByLabelText('Fine amount (PHP)'), { target: { value: '9999.99' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save category' }))
  await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: 'Phone use', description: '', fineAmount: '9999.99', allowedLevels: allLevels }))
})

it('lets the library change the highest fine, and the category form follows the new limit', async () => {
  api.list.mockResolvedValue([noise])
  api.saveSettings.mockResolvedValue({ maxFine: 10000, warningsBeforeFine: 2, levelWarnings: {}, updatedAt: 's2' })
  api.create.mockResolvedValue({ ...noise, categoryId: 3, name: 'Theft', used: false })
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  expect(screen.getByText('Highest fine allowed: PHP 9,999.99')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Change limit' }))
  const dialog = screen.getByRole('dialog', { name: 'Highest fine allowed' })
  const input = within(dialog).getByLabelText('Highest fine (PHP)')
  for (const bad of ['0', '1000000', 'abc']) {
    fireEvent.change(input, { target: { value: bad } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save limit' }))
    expect(within(dialog).getByText('Enter a peso amount above 0 and up to 999,999.99, with at most 2 decimals.')).toBeTruthy()
  }
  expect(api.saveSettings).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '10000' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save limit' }))
  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ maxFine: '10000', updatedAt: 's1' }))
  expect(await screen.findByText('Highest fine allowed: PHP 10,000.00')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
  const add = screen.getByRole('dialog', { name: 'Add violation category' })
  expect(within(add).getByText('Up to PHP 10,000.00')).toBeTruthy()
  fireEvent.change(within(add).getByLabelText('Category name'), { target: { value: 'Theft' } })
  fireEvent.change(within(add).getByLabelText('Fine amount (PHP)'), { target: { value: '10000' } })
  fireEvent.click(within(add).getByRole('button', { name: 'Save category' }))
  await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: 'Theft', description: '', fineAmount: '10000', allowedLevels: allLevels }))
})

it('shows the server reason when the limit cannot go that low', async () => {
  api.list.mockResolvedValue([noise])
  api.saveSettings.mockRejectedValue(new ViolationCategoryError('Noise is set to PHP 9,000.00, above PHP 5,000.00. Lower that fine first.', { maxFine: 'Noise is set to PHP 9,000.00, above PHP 5,000.00. Lower that fine first.' }))
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  fireEvent.click(screen.getByRole('button', { name: 'Change limit' }))
  const dialog = screen.getByRole('dialog', { name: 'Highest fine allowed' })
  fireEvent.change(within(dialog).getByLabelText('Highest fine (PHP)'), { target: { value: '5000' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save limit' }))
  expect(await within(dialog).findByText(/Lower that fine first/)).toBeTruthy()
})

it('deletes an unused category only after a plain confirmation', async () => {
  api.list.mockResolvedValue([noise, food])
  api.remove.mockResolvedValue({ deleted: true })
  render(<ViolationRulesPanel />)
  await screen.findByText('Eating or food')
  fireEvent.click(screen.getByRole('button', { name: 'Edit Eating or food' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete category' }))
  expect(api.remove).not.toHaveBeenCalled()
  const confirm = screen.getByRole('dialog', { name: 'Delete this category?' })
  expect(within(confirm).getByText('Eating or food', { selector: 'strong' })).toBeTruthy()
  expect(within(confirm).getByText(/cannot be undone/)).toBeTruthy()
  fireEvent.click(within(confirm).getByRole('button', { name: 'Keep category' }))
  expect(api.remove).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Edit violation category' })).toBeTruthy()

  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete category' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Eating or food' }))
  await waitFor(() => expect(api.remove).toHaveBeenCalledWith(2))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByText('Eating or food deleted.')).toBeTruthy()
  expect(api.list).toHaveBeenCalledTimes(2)
})

it('does not offer to delete a category that has records and points to Retire instead', async () => {
  api.list.mockResolvedValue([noise])
  render(<ViolationRulesPanel />)
  await screen.findByText('Noise')
  fireEvent.click(screen.getByRole('button', { name: 'Edit Noise' }))
  const dialog = screen.getByRole('dialog')
  const remove = within(dialog).getByRole('button', { name: 'Delete category' }) as HTMLButtonElement
  expect(remove.disabled).toBe(true)
  expect(within(dialog).getByText('Noise has violation records, so it cannot be deleted. Retire it instead.')).toBeTruthy()
  fireEvent.click(remove)
  expect(api.remove).not.toHaveBeenCalled()
})

it('explains a failed delete and refreshes the table', async () => {
  api.list.mockResolvedValue([food])
  api.remove.mockRejectedValue(new ViolationCategoryError('This category already has violation records, so it cannot be deleted. Retire it instead.'))
  render(<ViolationRulesPanel />)
  await screen.findByText('Eating or food')
  fireEvent.click(screen.getByRole('button', { name: 'Edit Eating or food' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete category' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Eating or food' }))
  expect(await screen.findByText(/already has violation records/)).toBeTruthy()
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
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
