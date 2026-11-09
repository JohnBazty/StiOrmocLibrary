import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { EnrollmentPage } from './EnrollmentPage'
import { enrollmentApi, type Semester } from './enrollment-api'

vi.mock('./enrollment-api', () => ({
  enrollmentApi: { overview: vi.fn(), roster: vi.fn(), end: vi.fn() },
}))

it('blocks early closure and shows ended semesters and their records in the dedicated archive', async () => {
  const active: Semester = {
    semester_id: 1, academic_year: '2026-2027', term_name: '1st Semester',
    end_date: '2026-12-18', manual_end_at: '2026-12-16T01:00:00Z',
    scheduled_end_at: '2026-12-18T16:00:00Z', started_at: '2026-11-09T01:00:00Z',
    ended_at: null, end_kind: null, status: 'Active', can_end: false,
    has_complete: true, active_accounts: 1, latest_roster: null,
  }
  vi.mocked(enrollmentApi.overview).mockResolvedValue([active, {
    ...active, semester_id: 2, academic_year: '2025-2026',
    ended_at: '2025-12-18T16:00:00Z', end_kind: 'Scheduled', status: 'Ended',
  }])
  vi.mocked(enrollmentApi.roster).mockImplementation(async id => ({
    archived: id === 2, more: false, rows: id === 2 ? [{
      school_id: '00000123', student_name: 'Test Student', program: 'BSIT', year_level: '1st Year',
      closed_status: 'Deactivated', account_id: 42, deactivated_at_end: true, email_mismatch: false,
    }] : [],
  }))
  render(<MemoryRouter><EnrollmentPage /></MemoryRouter>)
  const endButton = await screen.findByRole('button', { name: 'End Semester' })
  expect((endButton as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/Can be ended from/)).toBeTruthy()
  fireEvent.click(endButton)
  expect(enrollmentApi.end).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Semester Archive' }))
  expect(await screen.findByText('Test Student')).toBeTruthy()
  expect(screen.getByText('Deactivated when semester ended')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'View saved records' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'End Semester' })).toBeNull()
})
