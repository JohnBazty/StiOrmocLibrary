import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SidebarAccountCard } from './SidebarAccountCard'
import { PROFILE_UPDATED_EVENT } from '../features/users/profile-events'

const api = vi.hoisted(() => ({ myProfile: vi.fn(), myAvatar: vi.fn() }))
vi.mock('../features/users/users-api', () => ({ usersApi: api }))
const identity = { userId: 9, schoolId: 'STI-9', role: 'Student' as const, source: 'jwt' as const }
beforeEach(() => {
  api.myProfile.mockResolvedValue({ full_name: 'Alex Rivera', school_id: 'STI-9', role: 'Student', first_name: 'Alex', last_name: 'Rivera' })
  api.myAvatar.mockResolvedValue({ currentUrl: '/approved.png', pending: { id: 10, submittedAt: '2026-10-11' } })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
function setup() { render(<MemoryRouter><SidebarAccountCard identity={identity} /></MemoryRouter>) }

it('shows the approved picture, full name and school ID while a replacement awaits review', async () => {
  setup()
  expect(await screen.findByText('Alex Rivera')).toBeTruthy()
  expect(screen.getByText('STI-9')).toBeTruthy()
  expect(screen.getByAltText('Your approved profile picture').getAttribute('src')).toBe('/approved.png')
  fireEvent.error(screen.getByAltText('Your approved profile picture'))
  expect(screen.getByLabelText('Profile initials').textContent).toBe('AR')
})

it('keeps the name and ID visible when the avatar service is unavailable', async () => {
  api.myAvatar.mockRejectedValue(new Error('Storage unavailable'))
  setup()
  expect(await screen.findByText('Alex Rivera')).toBeTruthy()
  expect(screen.getByText('STI-9')).toBeTruthy()
  expect(screen.getByLabelText('Profile initials').textContent).toBe('AR')
})

it('updates the account display after the owner saves a profile', async () => {
  setup()
  await screen.findByText('Alex Rivera')
  api.myProfile.mockResolvedValue({ full_name: 'Alex Santos', school_id: 'STI-9', role: 'Student' })
  api.myAvatar.mockResolvedValue({ currentUrl: '/new-approved.png', pending: null })
  fireEvent(window, new Event(PROFILE_UPDATED_EVENT))
  expect(await screen.findByText('Alex Santos')).toBeTruthy()
  expect(screen.getByAltText('Your approved profile picture').getAttribute('src')).toBe('/new-approved.png')
})

it('uses initials when there is only a pending picture', async () => {
  api.myAvatar.mockResolvedValue({ currentUrl: null, pending: { id: 10, submittedAt: '2026-10-11' } })
  setup()
  await screen.findByText('Alex Rivera')
  expect(screen.queryByAltText('Your approved profile picture')).toBeNull()
  expect(screen.getByLabelText('Profile initials').textContent).toBe('AR')
})
