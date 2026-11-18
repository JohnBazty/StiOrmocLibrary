import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminAttendancePage } from './AdminAttendancePage'
import { StaffAttendancePage } from './StaffAttendancePage'
import { attendanceApi } from './attendance-api'

vi.mock('./attendance-api', () => ({ attendanceApi: {
  summary: vi.fn(), logs: vi.fn(), analytics: vi.fn(), capacity: vi.fn(), terms: vi.fn(),
} }))
vi.mock('./LibraryOperationsPanel', () => ({ LibraryOperationsPanel: () => null }))
vi.mock('./AttendanceScannerModal', () => ({ AttendanceScannerModal: () => null }))

const pagination = { page: 1, limit: 25, total: 0, total_pages: 0 }
const range = { from: '2026-11-10', to: '2026-11-10', label: 'Today' }

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers() })

it('refreshes attendance reports, term options, and the displayed seat capacity', async () => {
  vi.mocked(attendanceApi.logs).mockResolvedValue({ rows: [], pagination })
  vi.mocked(attendanceApi.terms).mockResolvedValue([])
  vi.mocked(attendanceApi.summary).mockResolvedValue({ range, total_visits: 0, unique_visitors: 0, currently_inside: 0, average_visit: null, peak_hour: null, purpose_breakdown: [], role_breakdown: [] })
  vi.mocked(attendanceApi.analytics).mockResolvedValue({ range, hourly: [], heatmap: [], daily: [] })
  const capacity = { current: 20, capacity: 80, available: 60, percentage: 25, overCapacity: false }
  vi.mocked(attendanceApi.capacity).mockResolvedValue(capacity)
  render(<AdminAttendancePage />)
  await screen.findByText('No attendance records match these filters.')
  const occupiedSeats = screen.getByText('Occupied seats').nextElementSibling
  expect(occupiedSeats?.textContent).toBe('20')

  vi.mocked(attendanceApi.capacity).mockResolvedValue({ ...capacity, current: 25, available: 55 })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(occupiedSeats?.textContent).toBe('25'))
  for (const request of [attendanceApi.logs, attendanceApi.summary, attendanceApi.analytics, attendanceApi.terms, attendanceApi.capacity]) {
    expect(request).toHaveBeenCalledTimes(2)
  }
})

it('refreshes Staff Attendance using the new Manila date after midnight', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T15:59:00Z'))
  vi.mocked(attendanceApi.logs).mockResolvedValue({ rows: [], pagination })
  render(<StaffAttendancePage />)
  expect(attendanceApi.logs).toHaveBeenLastCalledWith(expect.objectContaining({ date: '2026-11-10' }))

  vi.setSystemTime(new Date('2026-11-10T16:01:00Z'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(attendanceApi.logs).toHaveBeenLastCalledWith(expect.objectContaining({ date: '2026-11-11' })))
})
