import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LibraryCirculationSetupPanel } from './LibraryCirculationSetupPanel'
import { borrowingPoliciesApi } from '../borrowing-policies/borrowing-policies-api'
import { circulationApi } from '../circulation/circulation-api'
import { reservationApi } from './reservation-api'

vi.mock('../borrowing-policies/borrowing-policies-api', () => ({
  borrowingPoliciesApi: { list: vi.fn(), publish: vi.fn() },
}))
vi.mock('../circulation/circulation-api', () => ({
  circulationApi: { monitor: vi.fn(), preflightRenewal: vi.fn(), staffRenewal: vi.fn() },
}))
vi.mock('./reservation-api', () => ({
  reservationApi: { settings: vi.fn(), saveSettings: vi.fn() },
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const activePolicy = {
  versionId: 1, displayName: 'Policy v1', status: 'active' as const, effectiveOn: '2026-10-01',
  studentMaxActiveBooks: 2, facultyMaxActiveBooks: null, borrowingDays: 1,
  dueTimeCutoff: '08:59:00', dueCutoffLabel: '8:59 AM', maxRenewals: 1, renewalExtensionDays: 1,
  facultyMaxRenewals: null, facultyRenewalExtensionDays: null,
  studentMaxActiveReservations: 2, facultyMaxActiveReservations: null,
  blockRenewalIfOverdue: true, blockRenewalIfUnpaidFines: true, blockRenewalIfReserved: true,
  longOverdueAfterDays: 14, changeReason: 'Initial policy', createdByUserId: 1,
  createdAt: '2026-10-01T00:00:00Z',
  materialRules: [
    { materialType: 'Book' as const, isBorrowable: true },
    { materialType: 'Thesis/Manuscript' as const, isBorrowable: false },
  ],
}

it('separates Student and Faculty tabs for waitlist and renewal rules and preserves both on save', async () => {
  vi.mocked(borrowingPoliciesApi.list).mockResolvedValue({ active: activePolicy, scheduled: [], history: [activePolicy] })
  vi.mocked(borrowingPoliciesApi.publish).mockResolvedValue({ ...activePolicy, versionId: 2, displayName: 'Policy v2', facultyMaxRenewals: 4, facultyRenewalExtensionDays: 5 })
  vi.mocked(circulationApi.monitor).mockResolvedValue({ items: [], summary: { active: 0, overdue: 0, pending: 0, total: 0 }, pagination: { page: 1, limit: 25, total: 0, pages: 1 } } as never)
  vi.mocked(reservationApi.settings).mockResolvedValue({
    pickupWindowDays: 1, pickupWindowChangedBy: null, pickupWindowChangedAt: null,
    waitingExpiryDays: null, waitingExpiryChangedBy: null, waitingExpiryChangedAt: null,
    facultyWaitingExpiryDays: null,
  })

  render(<LibraryCirculationSetupPanel />)
  await screen.findByLabelText(/Student waitlist & reservation limit/i)

  const facultyTabs = screen.getAllByRole('tab', { name: 'Faculty' })
  fireEvent.click(facultyTabs[facultyTabs.length - 1])

  fireEvent.change(screen.getByLabelText(/Faculty max renewals/i), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText(/Faculty renewal extension days/i), { target: { value: '5' } })
  fireEvent.change(screen.getByLabelText(/Reason for waitlist \/ renewal policy change/i), { target: { value: 'Separate faculty renewal rules for semester' } })

  fireEvent.click(screen.getByRole('button', { name: /Review & save waitlist\/renewal rules/i }))
  fireEvent.click(screen.getByRole('button', { name: /Confirm & publish waitlist\/renewal rules/i }))

  await waitFor(() => expect(borrowingPoliciesApi.publish).toHaveBeenCalledWith(expect.objectContaining({
    studentMaxActiveReservations: 2,
    maxRenewals: 1,
    renewalExtensionDays: 1,
    facultyMaxRenewals: 4,
    facultyRenewalExtensionDays: 5,
  })))
})
