import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminBorrowingPoliciesPage } from './AdminBorrowingPoliciesPage'
import { borrowingPoliciesApi } from './borrowing-policies-api'

vi.mock('./borrowing-policies-api', () => ({ borrowingPoliciesApi: { list: vi.fn(), publish: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const active = {
  versionId: 1, displayName: 'Policy v1', status: 'active' as const, effectiveOn: '2026-10-01', studentMaxActiveBooks: 2,
  facultyMaxActiveBooks: null, borrowingDays: 1, dueTimeCutoff: '08:59:00', dueCutoffLabel: '8:59 AM', checkoutOpensAt: '14:00:00', checkoutOpensLabel: '2:00 PM', maxRenewals: 1,
  renewalExtensionDays: 1, studentMaxActiveReservations: 2, facultyMaxActiveReservations: null, blockRenewalIfOverdue: true,
  blockRenewalIfUnpaidFines: true, blockRenewalIfReserved: true, longOverdueAfterDays: null, changeReason: 'Initial policy',
  createdByUserId: 1, createdAt: '2026-10-01T00:00:00Z',
  materialRules: [{ materialType: 'Book' as const, isBorrowable: true }, { materialType: 'Thesis/Manuscript' as const, isBorrowable: false }],
}

async function openForm() {
  vi.mocked(borrowingPoliciesApi.list).mockResolvedValue({ active, scheduled: [], history: [active] })
  render(<AdminBorrowingPoliciesPage />)
  await screen.findByText(/Policy v1 · Effective/)
  const opener = screen.getByRole('button', { name: /Create new version/ })
  opener.focus()
  fireEvent.click(opener)
  return { opener, dialog: screen.getByRole('dialog', { name: 'Publish new borrowing policy' }) }
}

it('opens an accessible dialog that takes focus and closes on Escape, returning focus', async () => {
  const { opener, dialog } = await openForm()
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(dialog.contains(document.activeElement)).toBe(true)
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(opener)
})

it('shows a publish error inside the dialog and leaves confirm mode when a field changes', async () => {
  vi.mocked(borrowingPoliciesApi.publish).mockRejectedValue(new Error('Effective date cannot be in the past.'))
  const { dialog } = await openForm()
  const form = within(dialog)
  fireEvent.change(form.getByLabelText('Change reason'), { target: { value: 'Testing a new policy version' } })
  fireEvent.click(form.getByRole('button', { name: 'Review and continue' }))
  expect(form.getByText('Long overdue days: Disabled → 14')).toBeTruthy()
  fireEvent.change(form.getByLabelText('Borrowing days'), { target: { value: '3' } })
  expect(form.queryByRole('button', { name: 'Confirm publish' })).toBeNull()
  fireEvent.click(form.getByRole('button', { name: 'Review and continue' }))
  fireEvent.click(form.getByRole('button', { name: 'Confirm publish' }))
  expect((await form.findByRole('alert')).textContent).toContain('Effective date cannot be in the past.')
})

it('sends the checkout opening time and lists it in the review', async () => {
  vi.mocked(borrowingPoliciesApi.publish).mockResolvedValue(active)
  const { dialog } = await openForm()
  const form = within(dialog)
  fireEvent.change(form.getByLabelText('Checkout opens at'), { target: { value: '13:00' } })
  fireEvent.change(form.getByLabelText('Due time (next open day)'), { target: { value: '08:00' } })
  fireEvent.change(form.getByLabelText('Change reason'), { target: { value: 'Librarian rules from 2026-11-19' } })
  fireEvent.click(form.getByRole('button', { name: 'Review and continue' }))
  expect(form.getByText('Checkout opens at: 14:00 → 13:00')).toBeTruthy()
  fireEvent.click(form.getByRole('button', { name: 'Confirm publish' }))
  await vi.waitFor(() => expect(borrowingPoliciesApi.publish).toHaveBeenCalledWith(expect.objectContaining({ checkoutOpensAt: '13:00:00', dueTimeCutoff: '08:00:00' })))
})

it('limits the checkout opening time to library hours', async () => {
  const { dialog } = await openForm()
  const input = within(dialog).getByLabelText('Checkout opens at')
  expect(input.getAttribute('min')).toBe('08:00')
  expect(input.getAttribute('max')).toBe('16:59')
})

it('shows the active checkout time and due time in plain words', async () => {
  vi.mocked(borrowingPoliciesApi.list).mockResolvedValue({ active, scheduled: [], history: [active] })
  render(<AdminBorrowingPoliciesPage />)
  expect(await screen.findByText('From 2:00 PM')).toBeTruthy()
  expect(screen.getByText('Due 8:59 AM, 1 open day after checkout')).toBeTruthy()
})

it('shows the fine rules as read-only text', async () => {
  vi.mocked(borrowingPoliciesApi.list).mockResolvedValue({ active, scheduled: [], history: [active] })
  render(<AdminBorrowingPoliciesPage />)
  const rules = await screen.findByRole('region', { name: 'Fine rules' })
  expect(rules.textContent).toContain('PHP 2 per open hour on the due date, up to PHP 10')
  expect(rules.textContent).toContain('PHP 10 per open library day after the due date')
  expect(rules.textContent).toContain('PHP 500')
  expect(rules.textContent).toContain('Faculty pay no overdue fines')
  expect(within(rules).queryByRole('textbox')).toBeNull()
  expect(within(rules).queryByRole('spinbutton')).toBeNull()
})
