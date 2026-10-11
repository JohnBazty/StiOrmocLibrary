import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProfileAvatarPage } from './ProfileAvatarPage'

const api = vi.hoisted(() => ({ myProfile: vi.fn(), saveMyProfile: vi.fn() }))
vi.mock('./users-api', () => ({ usersApi: api }))
vi.mock('../auth/auth-storage', () => ({ getAccessToken: () => 'test-token' }))

beforeEach(() => {
  api.myProfile.mockResolvedValue({ id: 9, role: 'Student', account_status: 'Active', school_id: 'STI-9', email: 'student@ormoc.sti.edu.ph', first_name: 'Test', last_name: 'Student', program_strand: 'BSIT', year_grade_level: '2nd Year' })
  api.saveMyProfile.mockResolvedValue({ changed_fields: ['year_grade_level'] })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { currentUrl: null, pending: null } }) })))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals() })

it('lets the owner edit academic details while school email and ID stay fixed', async () => {
  render(<ProfileAvatarPage />)
  expect((await screen.findByDisplayValue('student@ormoc.sti.edu.ph') as HTMLInputElement).readOnly).toBe(true)
  expect((screen.getByDisplayValue('STI-9') as HTMLInputElement).readOnly).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: 'Year / grade level' }), { target: { value: '3rd Year' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save my profile' }))
  await waitFor(() => expect(api.saveMyProfile).toHaveBeenCalledWith({ first_name: 'Test', last_name: 'Student', program_strand: 'BSIT', year_grade_level: '3rd Year' }))
})

it('previews a selected picture without replacing the approved photo and clears it after removal', async () => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:picture-preview') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { currentUrl: '/approved.jpg', pending: { id: 1, submittedAt: '2026-10-11' } } }) })))
  render(<ProfileAvatarPage />)
  expect((await screen.findByAltText('Your approved profile picture')).getAttribute('src')).toBe('/approved.jpg')
  fireEvent.change(screen.getByLabelText('New picture'), { target: { files: [new File(['image'], 'new-picture.png', { type: 'image/png' })] } })
  expect((await screen.findByAltText('New picture preview')).getAttribute('src')).toBe('blob:picture-preview')
  expect(screen.getByText(/awaiting Librarian review/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected picture' }))
  expect(screen.getByAltText('Your approved profile picture').getAttribute('src')).toBe('/approved.jpg')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:picture-preview')
  expect((screen.getByRole('button', { name: 'Submit for approval' }) as HTMLButtonElement).disabled).toBe(true)
})

it('rejects an unsupported image before it can be submitted', async () => {
  render(<ProfileAvatarPage />)
  await screen.findByDisplayValue('STI-9')
  fireEvent.change(screen.getByLabelText('New picture'), { target: { files: [new File(['document'], 'file.pdf', { type: 'application/pdf' })] } })
  expect(screen.getByRole('alert').textContent).toContain('Choose a PNG, JPEG, or WebP image up to 2 MB.')
  expect((screen.getByRole('button', { name: 'Submit for approval' }) as HTMLButtonElement).disabled).toBe(true)
})

it('submits the selected file for review and keeps the approved picture after upload', async () => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:picture-preview') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
  let uploaded = false
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { uploaded = true; return { ok: true, json: async () => ({ message: 'Submitted' }) } }
    return { ok: true, json: async () => ({ data: { currentUrl: '/approved.jpg', pending: uploaded ? { id: 1, submittedAt: '2026-10-11' } : null } }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<ProfileAvatarPage />)
  await screen.findByAltText('Your approved profile picture')
  const image = new File(['image'], 'new-picture.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('New picture'), { target: { files: [image] } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
  await screen.findByText('Awaiting approval')
  const upload = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  expect((upload?.[1]?.body as FormData).get('image')).toBe(image)
  expect(screen.getByAltText('Your approved profile picture').getAttribute('src')).toBe('/approved.jpg')
  expect(screen.queryByAltText('New picture preview')).toBeNull()
})
