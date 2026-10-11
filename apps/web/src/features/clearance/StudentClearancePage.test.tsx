import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StudentClearancePage } from './StudentClearancePage'

const api = vi.hoisted(() => ({ mine: vi.fn() }))
vi.mock('./clearance-api', () => ({ clearanceApi: api }))

const base = {
  status: 'Cleared', reason: 'No library obligations', checkedAt: '2026-09-25T10:00:00+08:00',
  summary: { activeLoans: 0, unpaidOverdueFines: 0, unpaidReplacementCharges: 0, totalOutstanding: 0 },
  loans: [], fines: [], lostBooks: [], activeOverride: null,
}

it('does not show blocked clearance or zero balances during an outage and recovers on Refresh', async () => {
  api.mine.mockRejectedValueOnce(new Error('The library database is temporarily unavailable. Please try again.')).mockResolvedValueOnce(base)
  render(<StudentClearancePage />)
  await screen.findByRole('alert')
  expect(screen.getByText('Clearance status is temporarily unavailable.')).toBeTruthy()
  expect(screen.queryByText('Your clearance is currently blocked.')).toBeNull()
  expect(screen.queryByText('No unreturned books.')).toBeNull()
  expect(screen.queryByText('No unpaid charges.')).toBeNull()
  expect(screen.queryByText('₱0.00')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('You have no library obligations.')
  expect(screen.getByText('No unreturned books.')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('refreshes clearance from current records and confirms the update', async () => {
  api.mine.mockResolvedValueOnce(base).mockResolvedValueOnce({
    ...base, status: 'Not Cleared', reason: 'One unreturned book', checkedAt: '2026-09-25T10:01:00+08:00',
    summary: { ...base.summary, activeLoans: 1 },
  })
  render(<StudentClearancePage />)
  expect(await screen.findByText('You have no library obligations.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByText('Your clearance is currently blocked.')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('Clearance updated')
  await waitFor(() => expect(api.mine).toHaveBeenCalledTimes(2))
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
