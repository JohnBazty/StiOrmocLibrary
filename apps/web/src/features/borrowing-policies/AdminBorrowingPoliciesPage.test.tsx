import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminBorrowingPoliciesPage } from './AdminBorrowingPoliciesPage'
import { borrowingPoliciesApi } from './borrowing-policies-api'

vi.mock('./borrowing-policies-api', () => ({ borrowingPoliciesApi: { list: vi.fn(), publish: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('does not claim policies are missing while the first request is still loading', () => {
  vi.mocked(borrowingPoliciesApi.list).mockReturnValue(new Promise(() => {}))
  render(<AdminBorrowingPoliciesPage />)
  expect(screen.getByRole('status').textContent).toContain('Loading borrowing policies')
  expect(screen.queryByText('No active policy is configured.')).toBeNull()
  expect(screen.queryByText('No policy versions yet.')).toBeNull()
  expect((screen.getByRole('button', { name: 'Create new version' }) as HTMLButtonElement).disabled).toBe(true)
})

it('shows a failed first read without presenting an empty policy history', async () => {
  vi.mocked(borrowingPoliciesApi.list).mockRejectedValue(new Error('Policies could not be loaded.'))
  render(<AdminBorrowingPoliciesPage />)
  expect((await screen.findByRole('alert')).textContent).toContain('Policies could not be loaded.')
  expect(screen.queryByText('No policy versions yet.')).toBeNull()
  expect((screen.getByRole('button', { name: 'Create new version' }) as HTMLButtonElement).disabled).toBe(true)
})

const active = {
  versionId: 1, displayName: 'Policy v1', status: 'active' as const, effectiveOn: '2026-10-01', studentMaxActiveBooks: 2,
  facultyMaxActiveBooks: null, borrowingDays: 1, dueTimeCutoff: '08:59:00', dueCutoffLabel: '8:59 AM', maxRenewals: 1,
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

it('sets borrowing and returning hours and the due cutoff in 12-hour time', async () => {
  vi.mocked(borrowingPoliciesApi.publish).mockResolvedValue({ displayName: 'Policy 2', status: 'scheduled' } as never)
  const { dialog } = await openForm()
  const form = within(dialog)
  expect((form.getByLabelText('Due cutoff AM or PM') as HTMLSelectElement).value).toBe('AM')
  fireEvent.change(form.getByLabelText('Borrowing opens hour'), { target: { value: '8' } })
  fireEvent.change(form.getByLabelText('Borrowing closes hour'), { target: { value: '4' } })
  fireEvent.change(form.getByLabelText('Borrowing closes minute'), { target: { value: '30' } })
  fireEvent.change(form.getByLabelText('Borrowing closes AM or PM'), { target: { value: 'PM' } })
  fireEvent.change(form.getByLabelText('Change reason'), { target: { value: 'Desk lends only in desk hours.' } })
  fireEvent.click(form.getByRole('button', { name: 'Review and continue' }))
  expect(form.getByText('Borrowing hours: Any time → 8:00 AM to 4:30 PM')).toBeTruthy()
  expect(dialog.textContent).not.toMatch(/\b(1[3-9]|2[0-3]):\d\d\b/)
  fireEvent.click(form.getByRole('button', { name: 'Confirm publish' }))
  await waitFor(() => expect(borrowingPoliciesApi.publish).toHaveBeenCalled())
  expect(vi.mocked(borrowingPoliciesApi.publish).mock.calls[0][0]).toMatchObject({ borrowOpensAt: '08:00', borrowClosesAt: '16:30', returnOpensAt: null, returnClosesAt: null })
})

it('separates Student and Faculty tabs in the policy editor and publishes faculty renewal rules', async () => {
  vi.mocked(borrowingPoliciesApi.publish).mockResolvedValue({ ...active, versionId: 2, displayName: 'Policy v2', facultyMaxRenewals: 5, facultyRenewalExtensionDays: 7 })
  const { dialog } = await openForm()
  const form = within(dialog)
  fireEvent.click(form.getByRole('tab', { name: 'Faculty' }))
  fireEvent.change(form.getByLabelText(/Faculty max renewals/i), { target: { value: '5' } })
  fireEvent.change(form.getByLabelText(/Faculty extra days per renewal/i), { target: { value: '7' } })
  fireEvent.change(form.getByLabelText('Change reason'), { target: { value: 'Set separate faculty renewal rules for next term' } })
  fireEvent.click(form.getByRole('button', { name: 'Review and continue' }))
  expect(form.getByText('Faculty max renewals: Unlimited → 5')).toBeTruthy()
  expect(form.getByText('Faculty renewal extension: Same as students → 7')).toBeTruthy()
  fireEvent.click(form.getByRole('button', { name: 'Confirm publish' }))
  await screen.findByText(/Policy v2 published/)
  expect(borrowingPoliciesApi.publish).toHaveBeenCalledWith(expect.objectContaining({
    facultyMaxRenewals: 5,
    facultyRenewalExtensionDays: 7,
    facultyMaxActiveBooks: null,
  }))
})
