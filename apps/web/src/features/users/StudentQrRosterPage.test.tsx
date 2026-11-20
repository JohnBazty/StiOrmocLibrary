import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StudentQrRosterPage } from './StudentQrRosterPage'
import { enrollmentApi, facultyEnrollmentApi } from './enrollment-api'

vi.mock('./enrollment-api', () => ({
  enrollmentApi: { qrSemesters: vi.fn(), qrRoster: vi.fn() },
  facultyEnrollmentApi: { qrSemesters: vi.fn(), qrRoster: vi.fn() },
}))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows roster students with their QR or a clear registration message', async () => {
  vi.mocked(enrollmentApi.qrSemesters).mockResolvedValue([{ semester_id: 1, academic_year: '2026–2027', term_name: 'First semester', status: 'Active' }] as never)
  vi.mocked(enrollmentApi.qrRoster).mockResolvedValue({ rows: [
    { school_id: 'TEST-001', student_name: 'Example Student', program: 'BSIT', year_level: '1', qr_image: 'data:image/png;base64,test', qr_status: 'Ready' },
    { school_id: 'TEST-002', student_name: 'Example New Student', program: null, year_level: null, qr_image: null, qr_status: 'Registration needed' },
  ], more: true })
  render(<StudentQrRosterPage />)
  expect(screen.getByRole('heading', { name: 'QR Roster' })).toBeTruthy()
  expect(await screen.findByRole('img', { name: 'Library QR for Example Student' })).toBeTruthy()
  expect(screen.getByText('Registration needed')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(enrollmentApi.qrRoster).toHaveBeenLastCalledWith(1, 2, '', expect.any(AbortSignal), '')
})

it('switches to the Faculty QR roster using facultyEnrollmentApi', async () => {
  vi.mocked(enrollmentApi.qrSemesters).mockResolvedValue([{ semester_id: 1, academic_year: '2026–2027', term_name: 'First semester', status: 'Active' }] as never)
  vi.mocked(enrollmentApi.qrRoster).mockResolvedValue({ rows: [], more: false })
  vi.mocked(facultyEnrollmentApi.qrSemesters).mockResolvedValue([{ semester_id: 1, academic_year: '2026–2027', term_name: 'First semester', status: 'Active' }] as never)
  vi.mocked(facultyEnrollmentApi.qrRoster).mockResolvedValue({ rows: [
    { school_id: 'FAC-101', student_name: 'Example Faculty', program: 'Computer Studies', year_level: null, qr_image: 'data:image/png;base64,fac', qr_status: 'Ready' },
  ], more: false })
  render(<StudentQrRosterPage />)
  await screen.findByRole('tab', { name: 'Faculty' })
  fireEvent.click(screen.getByRole('tab', { name: 'Faculty' }))
  expect(await screen.findByRole('img', { name: 'Library QR for Example Faculty' })).toBeTruthy()
  expect(facultyEnrollmentApi.qrRoster).toHaveBeenCalled()
})

it('shows load errors with a retry action', async () => {
  vi.mocked(enrollmentApi.qrSemesters).mockRejectedValue(new Error('Unable to load semesters.'))
  render(<StudentQrRosterPage />)
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load semesters.')
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
})
