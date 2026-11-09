import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminUsersPage } from './AdminUsersPage'
import { usersApi } from './users-api'

vi.mock('../auth/auth-storage', () => ({
  getCurrentIdentity: () => ({ role: 'Librarian' }),
}))
vi.mock('./users-api', () => ({
  usersApi: { directory: vi.fn(), programs: vi.fn(), summary: vi.fn(), detail: vi.fn(), createStaff: vi.fn() },
}))
afterEach(cleanup)

it('shows roster-only students without account actions when Not registered is selected', async () => {
  vi.mocked(usersApi.summary).mockResolvedValue({
    active_accounts: 1, deactivated_accounts: 0, archived_accounts: 0,
    student_accounts: 1, faculty_accounts: 0, staff_accounts: 0,
  })
  vi.mocked(usersApi.programs).mockResolvedValue(['BSIT'])
  vi.mocked(usersApi.directory).mockImplementation(async filters => ({
    rows: filters.status === 'Not registered' ? [{
      id: null, school_id: '00000123', role: 'Student', account_status: 'Not registered',
      full_name: 'Roster Student', email: '—', program: 'BSIT', year_or_unit: '1st Year', clearance_status: '—',
    }] : [],
    pagination: { page: 1, limit: 25, total: 1, total_pages: 1 },
  }))
  render(<AdminUsersPage />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Account status' }), { target: { value: 'Not registered' } })
  expect(await screen.findByText('Roster Student')).toBeTruthy()
  expect(screen.getByText('Account not created')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'View record' })).toBeNull()
  expect(usersApi.directory).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'Not registered', page: 1 }))
})

it('creates Staff accounts from official school details without asking Admin to set a password', async () => {
  vi.mocked(usersApi.createStaff).mockResolvedValue({ accountId: 42, schoolId: 'STAFF-QA' })
  render(<AdminUsersPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Set up Staff account' }))
  for (const [label, value] of [
    ['First name', 'Test'], ['Last name', 'Staff'], ['School ID', 'STAFF-QA'], ['Ormoc school email', 'staff-qa@ormoc.sti.edu.ph'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  expect(screen.queryByLabelText('Password')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Create Staff account' }))
  expect(await screen.findByText(/Staff account STAFF-QA created/)).toBeTruthy()
  expect(usersApi.createStaff).toHaveBeenCalledWith({
    first_name: 'Test', last_name: 'Staff', school_id: 'STAFF-QA', school_email: 'staff-qa@ormoc.sti.edu.ph',
  })
})
