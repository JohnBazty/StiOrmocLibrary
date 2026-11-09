import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { EnrollmentPage } from './EnrollmentPage'
import { enrollmentApi, type Semester } from './enrollment-api'
import { RosterPreviewTable } from './RosterPreviewTable'

vi.mock('./enrollment-api', () => ({
  enrollmentApi: { overview: vi.fn(), roster: vi.fn(), end: vi.fn(), preview: vi.fn() },
}))
afterEach(cleanup)

it('counts students across the file, pages through all rows and filters issues', () => {
  render(<RosterPreviewTable preview={{ studentCount: 51, errorCount: 0, warningCount: 1, sheets: [{
    name: 'Students', headings: ['Student ID'],
    rows: Array.from({ length: 51 }, (_, i) => ({
      row: i + 2, cells: [`Test-${i + 1}`], errors: [], warnings: i === 50 ? ['Ormoc email needed.'] : [],
    })),
  }] }} />)
  expect(screen.getByText('51 students in the file.')).toBeTruthy()
  expect(screen.getByText('1 student needs an Ormoc school email')).toBeTruthy()
  expect(screen.getByText(/All 51 students can still be imported/)).toBeTruthy()
  expect(screen.queryByText('Test-51')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('Test-51')).toBeTruthy()
  fireEvent.click(screen.getByLabelText('Show rows that need attention'))
  expect(screen.getByText('Ormoc email needed.')).toBeTruthy()
  expect(screen.queryByText('Test-1')).toBeNull()
})

it.each([0, 1])('only blocks import when the preview has errors (%i)', async errorCount => {
  vi.mocked(enrollmentApi.overview).mockResolvedValue([{
    semester_id: 1, academic_year: '2026-2027', term_name: '1st Semester', end_date: '2026-12-18',
    manual_end_at: '2026-12-16T01:00:00Z', scheduled_end_at: '2026-12-18T16:00:00Z',
    started_at: null, ended_at: null, end_kind: null, status: 'Draft', can_end: false,
    has_complete: false, active_accounts: 0, latest_roster: null,
  }])
  vi.mocked(enrollmentApi.roster).mockResolvedValue({ rows: [], more: false, archived: false })
  vi.mocked(enrollmentApi.preview).mockResolvedValue({
    studentCount: 1, errorCount, warningCount: 1,
    sheets: [{ name: 'Students', headings: ['Student ID'], rows: [{
      row: 2, cells: ['00000123'], errors: errorCount ? ['Check Student ID.'] : [], warnings: ['Ormoc email needed.'],
    }] }],
  })
  render(<MemoryRouter><EnrollmentPage /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('Roster file'), {
    target: { files: [new File(['Student ID\n00000123'], 'roster.csv')] },
  })
  expect(await screen.findByText('1 student needs an Ormoc school email')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Import roster' }) as HTMLButtonElement).disabled).toBe(errorCount > 0)
  expect(Boolean(screen.queryByText(/can still be imported/))).toBe(errorCount === 0)
})

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
