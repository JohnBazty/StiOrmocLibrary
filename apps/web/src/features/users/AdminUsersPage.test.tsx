import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminUsersPage } from './AdminUsersPage'

const api = vi.hoisted(() => ({ summary: vi.fn(), programs: vi.fn(), directory: vi.fn(), detail: vi.fn(), editProfile: vi.fn(), changeStatus: vi.fn() }))
const identity = vi.hoisted(() => ({ role: 'Admin' }))
vi.mock('./users-api', () => ({ usersApi: api }))
vi.mock('../auth/auth-storage', () => ({ getCurrentIdentity: () => identity }))

const student = { id: 8, school_id: '02000000008', role: 'Student', account_status: 'Active', full_name: 'Test Student', email: 'student@example.invalid', program: 'IT', year_or_unit: '4th Year', clearance_status: 'Cleared' }
const detail = { ...student, contact_number: '09123456789', user_id: 18, first_name: 'Test', last_name: 'Student', program_strand: 'IT', year_grade_level: '4th Year', events: [] }

beforeEach(() => {
  identity.role = 'Admin'
  api.summary.mockResolvedValue({ active_accounts: 1, deactivated_accounts: 0, archived_accounts: 0, student_accounts: 1, faculty_accounts: 0, staff_accounts: 0 })
  api.programs.mockResolvedValue(['IT'])
  api.directory.mockResolvedValue({ rows: [student], pagination: { page: 1, limit: 25, total: 1, total_pages: 1 } })
  api.detail.mockResolvedValue(detail)
  api.editProfile.mockResolvedValue({})
  api.changeStatus.mockResolvedValue({})
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AdminUsersPage', () => {
  it('requires a reason and sends only a deliberate lifecycle action', async () => {
    render(<AdminUsersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'View / manage' }))
    await screen.findByRole('dialog', { name: 'Account record' })
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    expect(screen.getByRole('button', { name: 'Confirm' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getAllByLabelText('Audit reason').at(-1)!, { target: { value: 'Term ended' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(api.changeStatus).toHaveBeenCalledWith(8, 'Deactivated', 'Term ended'))
  })

  it('keeps school ID and role outside editable profile fields', async () => {
    render(<AdminUsersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'View / manage' }))
    await screen.findByRole('dialog', { name: 'Account record' })
    fireEvent.change(screen.getByLabelText('Year / grade level'), { target: { value: '3rd Year' } })
    fireEvent.change(screen.getByLabelText('Audit reason'), { target: { value: 'Corrected enrollment' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(api.editProfile).toHaveBeenCalledWith(8, expect.objectContaining({ year_grade_level: '3rd Year', reason: 'Corrected enrollment' })))
    expect(screen.queryByLabelText('School ID')).toBeNull()
    expect(screen.queryByLabelText('Role')).toBeNull()
  })

  it('shows Librarians account records without management actions', async () => {
    identity.role = 'Librarian'
    render(<AdminUsersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'View' }))
    await screen.findByRole('dialog', { name: 'Account record' })
    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()
  })
})
