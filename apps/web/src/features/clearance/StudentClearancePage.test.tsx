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
