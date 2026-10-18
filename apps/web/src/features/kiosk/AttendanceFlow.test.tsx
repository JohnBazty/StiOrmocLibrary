import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AttendanceFlow } from './AttendanceFlow'
import { attendanceApi } from '../attendance/attendance-api'

vi.mock('../attendance/attendance-api', () => ({
  attendanceApi: { resolveScan: vi.fn(), checkIn: vi.fn(), checkOut: vi.fn() },
}))
// One-shot like the real scanner: it emits a single code per mount.
vi.mock('./KioskScanner', async () => {
  const { useRef } = await import('react')
  return {
    KioskScanner: ({ onScan }: { onScan: (v: string) => void }) => {
      const done = useRef(false)
      return <button onClick={() => { if (done.current) return; done.current = true; onScan('QR123') }}>scan</button>
    },
  }
})

afterEach(() => { vi.clearAllMocks(); cleanup() })

it('checks a visitor in when no open visit exists', async () => {
  vi.mocked(attendanceApi.resolveScan).mockResolvedValue({ visitor: { name: 'Juan Dela Cruz' }, openVisit: null } as never)
  vi.mocked(attendanceApi.checkIn).mockResolvedValue({ message: 'Checked in. Welcome!' } as never)
  render(<AttendanceFlow lang="en" onDone={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan' }))
  expect(await screen.findByText('Juan Dela Cruz')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm check-in' }))

  expect(await screen.findByText('Checked in. Welcome!')).toBeTruthy()
  expect(attendanceApi.checkIn).toHaveBeenCalledWith('QR123', 'Library Visit', expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/))
  expect(attendanceApi.checkOut).not.toHaveBeenCalled()
})

it('checks a visitor out when an open visit exists', async () => {
  vi.mocked(attendanceApi.resolveScan).mockResolvedValue({ visitor: { name: 'Maria Santos' }, openVisit: { log_id: 5 } } as never)
  vi.mocked(attendanceApi.checkOut).mockResolvedValue({ message: 'Checked out. See you!' } as never)
  render(<AttendanceFlow lang="en" onDone={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm check-out' }))

  expect(await screen.findByText('Checked out. See you!')).toBeTruthy()
  expect(attendanceApi.checkOut).toHaveBeenCalledWith('QR123')
  expect(attendanceApi.checkIn).not.toHaveBeenCalled()
})

it('gives the student a fresh scanner after a failed scan', async () => {
  vi.mocked(attendanceApi.resolveScan)
    .mockRejectedValueOnce(new Error('This attendance QR code is invalid or no longer recognized.'))
    .mockResolvedValueOnce({ visitor: { name: 'Juan Dela Cruz' }, openVisit: null } as never)
  render(<AttendanceFlow lang="en" onDone={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'scan' }))
  expect((await screen.findByRole('alert')).textContent).toBe('This attendance QR code is invalid or no longer recognized.')

  fireEvent.click(screen.getByRole('button', { name: 'scan' }))
  expect(await screen.findByText('Juan Dela Cruz')).toBeTruthy()
  expect(attendanceApi.resolveScan).toHaveBeenCalledTimes(2)
})
