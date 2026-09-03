import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminClearancePage } from './AdminClearancePage'
import type { ClearanceRecord } from './types'

const api = vi.hoisted(() => ({
  list: vi.fn(), detail: vi.fn(), override: vi.fn(), revoke: vi.fn(),
  decideLost: vi.fn(), settleLost: vi.fn(),
}))
vi.mock('./clearance-api', () => ({ clearanceApi: api }))

const blocked: ClearanceRecord = {
  student: { userId: 7, schoolId: '02000871654', name: 'Buentheo Nathaniel Noval', program: 'BS Information Technology', section: null, accountStatus: 'Active' },
  status: 'Not Cleared', computedStatus: 'Not Cleared', reason: 'PHP 28.00 unpaid overdue fines', checkedAt: '2026-09-03T01:00:00.000Z',
  summary: { activeLoans: 0, unpaidOverdueFines: 28, unpaidReplacementCharges: 0, totalOutstanding: 28, blockCount: 1 },
  loans: [], fines: [], lostBooks: [], activeOverride: null, overrideHistory: [],
}

function listWith(item: ClearanceRecord) {
  return {
    summary: { totalStudents: 1, cleared: item.status === 'Cleared' ? 1 : 0, pending: item.status === 'Not Cleared' ? 1 : 0, activeOverrides: item.activeOverride ? 1 : 0 },
    items: [item], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  }
}

describe('AdminClearancePage simplified exceptions', () => {
  it('uses one reason field and automatically grants a cleared exception', async () => {
    const overridden: ClearanceRecord = {
      ...blocked,
      status: 'Cleared',
      activeOverride: { overrideId: 4, status: 'Cleared', reason: 'Approved while payment is being verified.', appliedAt: '2026-09-03T02:00:00.000Z', expiresAt: null, appliedBy: 'Head Librarian' },
      overrideHistory: [],
    }
    api.list.mockResolvedValue(listWith(blocked))
    api.detail.mockResolvedValue(blocked)
    api.override.mockResolvedValue({ clearance: overridden })
    render(<AdminClearancePage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('button', { name: 'Clear student as an exception' })).toBeTruthy()
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Clear student as an exception' }))
    fireEvent.change(screen.getByLabelText('Reason for exception'), { target: { value: 'Approved while payment is being verified.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm exception' }))

    await waitFor(() => expect(api.override).toHaveBeenCalledWith(7, {
      status: 'Cleared', reason: 'Approved while payment is being verified.', expiresAt: null,
    }))
  })

  it('does not offer an override when the computed standing is already cleared', async () => {
    const cleared: ClearanceRecord = { ...blocked, status: 'Cleared', computedStatus: 'Cleared', reason: 'No library obligations', summary: { ...blocked.summary, unpaidOverdueFines: 0, totalOutstanding: 0, blockCount: 0 } }
    api.list.mockResolvedValue(listWith(cleared))
    api.detail.mockResolvedValue(cleared)
    render(<AdminClearancePage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByText('No exception is needed because the student is already cleared by the system.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear student as an exception' })).toBeNull()
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
