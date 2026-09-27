import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProfileAvatarPage } from './ProfileAvatarPage'

const api = vi.hoisted(() => ({ myProfile: vi.fn(), saveMyProfile: vi.fn() }))
vi.mock('./users-api', () => ({ usersApi: api }))
vi.mock('../auth/auth-storage', () => ({ getAccessToken: () => 'test-token' }))

beforeEach(() => {
  api.myProfile.mockResolvedValue({ id: 9, role: 'Student', school_id: 'STI-9', email: 'student@ormoc.sti.edu.ph', first_name: 'Test', last_name: 'Student', program_strand: 'BSIT', year_grade_level: '2nd Year' })
  api.saveMyProfile.mockResolvedValue({ changed_fields: ['year_grade_level'] })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { currentUrl: null, pending: null } }) })))
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

it('lets the owner edit academic details while school email and ID stay fixed', async () => {
  render(<ProfileAvatarPage />)
  expect((await screen.findByDisplayValue('student@ormoc.sti.edu.ph') as HTMLInputElement).readOnly).toBe(true)
  expect((screen.getByDisplayValue('STI-9') as HTMLInputElement).readOnly).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: 'Year / grade level' }), { target: { value: '3rd Year' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save my profile' }))
  await waitFor(() => expect(api.saveMyProfile).toHaveBeenCalledWith({ first_name: 'Test', last_name: 'Student', program_strand: 'BSIT', year_grade_level: '3rd Year' }))
})
