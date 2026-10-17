import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminPrintingQueuePage } from './AdminPrintingQueuePage'

const api = vi.hoisted(() => ({ summary: vi.fn(), queue: vi.fn(), setServiceStatus: vi.fn() }))
vi.mock('./printing-api', () => ({ printingApi: api }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('does not report paused/zero/empty data after a failed request and recovers with Refresh', async () => {
  api.summary.mockRejectedValueOnce(new Error('The printing service request failed.')).mockResolvedValue({
    pending_jobs: 2, printing_jobs: 0, ready_jobs: 0, unpaid_jobs: 0, revenue_today: 10,
    service_status: { accepting_requests: 1, unavailable_reason: null },
  })
  api.queue.mockResolvedValue({ rows: [] })
  render(<AdminPrintingQueuePage />)
  await screen.findByRole('alert')
  expect(screen.getByText('Printing service status unavailable.')).toBeTruthy()
  expect(screen.queryByText('Print requests are paused')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Resume requests' })).toBeNull()
  expect(screen.queryByText('₱0.00')).toBeNull()
  expect(screen.queryByText('No print requests match these filters.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('Accepting print requests')
  expect(screen.getByRole('button', { name: 'Pause requests' })).toBeTruthy()
  expect(screen.getByText('₱10.00')).toBeTruthy()
  expect(screen.getByText('No print requests match these filters.')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(api.setServiceStatus).not.toHaveBeenCalled()
})
