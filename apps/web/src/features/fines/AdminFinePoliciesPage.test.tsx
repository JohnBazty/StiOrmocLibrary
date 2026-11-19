import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminFinePoliciesPage } from './AdminFinePoliciesPage'
import { finePoliciesApi, FinePolicyError } from './fine-policies-api'

vi.mock('./fine-policies-api', async (original) => ({ ...(await original<typeof import('./fine-policies-api')>()), finePoliciesApi: { list: vi.fn(), publish: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const active = {
  versionId: 1, status: 'active' as const, hourlyRate: 2, dailyRate: 10, maximumPenalty: 500,
  effectiveFrom: '2025-12-31T16:00:00.000Z', effectiveUntil: null, changeReason: null, createdByUserId: null, createdAt: '2025-12-31T16:00:00.000Z',
}

async function openForm() {
  vi.mocked(finePoliciesApi.list).mockResolvedValue({ active, scheduled: [], history: [active] })
  render(<AdminFinePoliciesPage />)
  await screen.findByText(/PHP 2.00 per hour/)
  const opener = screen.getByRole('button', { name: /Change fine rules/ })
  opener.focus()
  fireEvent.click(opener)
  return { opener, dialog: screen.getByRole('dialog', { name: 'Change fine rules' }) }
}

it('shows the current rules in plain words and the history', async () => {
  vi.mocked(finePoliciesApi.list).mockResolvedValue({ active, scheduled: [], history: [active] })
  render(<AdminFinePoliciesPage />)
  expect(await screen.findByText(/PHP 2.00 per hour on the due date, PHP 10.00 per library day after, at most PHP 500.00/)).toBeTruthy()
  expect(screen.getByRole('table', { name: 'Fine rule history' })).toBeTruthy()
})

it('opens an accessible dialog that takes focus and closes on Escape, returning focus', async () => {
  const { opener, dialog } = await openForm()
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(dialog.contains(document.activeElement)).toBe(true)
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(opener)
})

it('reviews changes before saving, resets the review after an edit, and saves', async () => {
  vi.mocked(finePoliciesApi.publish).mockResolvedValue({ ...active, versionId: 2, dailyRate: 15 })
  const { dialog } = await openForm()
  fireEvent.change(within(dialog).getByLabelText('Daily rate (PHP)'), { target: { value: '15' } })
  fireEvent.change(within(dialog).getByLabelText('Reason for the change'), { target: { value: 'Committee raised the daily rate.' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Review changes' }))
  expect(within(dialog).getByText('Daily rate: PHP 10.00 → PHP 15.00')).toBeTruthy()
  fireEvent.change(within(dialog).getByLabelText('Hourly rate (PHP)'), { target: { value: '3' } })
  expect(within(dialog).queryByRole('button', { name: 'Save fine rules' })).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Review changes' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save fine rules' }))
  expect(await screen.findByText(/Fine rules saved/)).toBeTruthy()
  expect(vi.mocked(finePoliciesApi.publish).mock.calls[0][0]).toMatchObject({ hourlyRate: 3, dailyRate: 15, maximumPenalty: 500, changeReason: 'Committee raised the daily rate.' })
})

it('shows server field errors on their fields', async () => {
  vi.mocked(finePoliciesApi.publish).mockRejectedValue(new FinePolicyError('Maximum fine cannot be more than PHP 500.', { maximumPenalty: 'Maximum fine cannot be more than PHP 500.' }))
  const { dialog } = await openForm()
  fireEvent.change(within(dialog).getByLabelText('Reason for the change'), { target: { value: 'Testing the cap field error.' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Review changes' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save fine rules' }))
  const input = within(dialog).getByLabelText('Maximum fine (PHP)')
  expect(await within(dialog).findAllByText('Maximum fine cannot be more than PHP 500.')).toBeTruthy()
  expect(input.getAttribute('aria-invalid')).toBe('true')
})

it('lists every value for review when no rule is saved yet', async () => {
  vi.mocked(finePoliciesApi.list).mockResolvedValue({ active: null, scheduled: [], history: [] })
  render(<AdminFinePoliciesPage />)
  await screen.findByText(/No fine rule is saved/)
  fireEvent.click(screen.getByRole('button', { name: /Change fine rules/ }))
  const dialog = screen.getByRole('dialog', { name: 'Change fine rules' })
  fireEvent.change(within(dialog).getByLabelText('Reason for the change'), { target: { value: 'First rule for the library.' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Review changes' }))
  expect(within(dialog).getByText('Hourly rate: PHP 2.00')).toBeTruthy()
  expect(within(dialog).getByText('Maximum fine: PHP 500.00')).toBeTruthy()
})
