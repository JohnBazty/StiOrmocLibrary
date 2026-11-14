import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AccountMenu } from './AccountMenu'
import { ThemeProvider } from '../features/theme/ThemeProvider'
import { PROFILE_UPDATED_EVENT } from '../features/users/profile-events'

const api = vi.hoisted(() => ({ myProfile: vi.fn(), myAvatar: vi.fn() }))
vi.mock('../features/users/users-api', () => ({ usersApi: api }))
const identity = { userId: 9, schoolId: 'STI-9', role: 'Student' as const, source: 'jwt' as const }
beforeEach(() => {
  localStorage.clear(); document.documentElement.classList.remove('dark')
  api.myProfile.mockResolvedValue({ full_name: 'Alex Rivera', school_id: 'STI-9', role: 'Student', first_name: 'Alex', last_name: 'Rivera' })
  api.myAvatar.mockResolvedValue({ currentUrl: '/approved.png', pending: { id: 10, submittedAt: '2026-10-11' } })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
const signOut = vi.fn()
function setup(profilePath: string | undefined = '/student/profile') { render(<MemoryRouter><ThemeProvider><AccountMenu identity={identity} profilePath={profilePath} onSignOut={signOut} /></ThemeProvider></MemoryRouter>) }
async function openMenu() { fireEvent.click(await screen.findByRole('button', { name: 'Account menu for Alex Rivera' })) }

it('shows the approved picture, full name and school ID while a replacement awaits review', async () => {
  setup()
  await openMenu()
  expect(await screen.findByText('Alex Rivera')).toBeTruthy()
  expect(screen.getByText('STI-9')).toBeTruthy()
  expect(screen.getByAltText('Your profile picture').getAttribute('src')).toBe('/approved.png')
  fireEvent.error(screen.getByAltText('Your profile picture'))
  expect(screen.getByLabelText('Profile initials').textContent).toBe('AR')
})

it('keeps the name and ID visible when the avatar service is unavailable', async () => {
  api.myAvatar.mockRejectedValue(new Error('Storage unavailable'))
  setup()
  await openMenu()
  expect(await screen.findByText('Alex Rivera')).toBeTruthy()
  expect(screen.getByText('STI-9')).toBeTruthy()
  expect(screen.getByLabelText('Profile initials').textContent).toBe('AR')
})

it('updates the account display after the owner saves a profile', async () => {
  setup()
  await openMenu()
  await screen.findByText('Alex Rivera')
  api.myProfile.mockResolvedValue({ full_name: 'Alex Santos', school_id: 'STI-9', role: 'Student' })
  api.myAvatar.mockResolvedValue({ currentUrl: '/new-approved.png', pending: null })
  fireEvent(window, new Event(PROFILE_UPDATED_EVENT))
  expect(await screen.findByText('Alex Santos')).toBeTruthy()
  expect(screen.getByAltText('Your profile picture').getAttribute('src')).toBe('/new-approved.png')
})

it('uses initials when there is only a pending picture', async () => {
  api.myAvatar.mockResolvedValue({ currentUrl: null, pending: { id: 10, submittedAt: '2026-10-11' } })
  setup()
  await openMenu()
  await screen.findByText('Alex Rivera')
  expect(screen.queryByAltText('Your profile picture')).toBeNull()
  expect(screen.getByLabelText('Profile initials').textContent).toBe('AR')
})

it('offers one Profile destination, a working theme toggle and the current sign-out callback', async () => {
  setup()
  await openMenu()
  expect(screen.getAllByRole('menuitem')).toHaveLength(3)
  expect(screen.getByRole('menuitem',{name:'Profile'}).getAttribute('href')).toBe('/student/profile')
  expect(screen.queryByText('Personal details')).toBeNull()
  expect(screen.queryByText('School details')).toBeNull()
  expect(screen.queryByText('Profile photo')).toBeNull()
  fireEvent.click(screen.getByRole('menuitem',{name:'Dark mode'}))
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  fireEvent.click(screen.getByRole('menuitem',{name:'Sign out'}))
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).toBeNull()
})

it('supports arrow navigation, Escape focus restoration and outside dismissal', async () => {
  setup()
  const trigger=await screen.findByRole('button',{name:'Account menu for Alex Rivera'})
  fireEvent.keyDown(trigger,{key:'ArrowDown'})
  expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Profile'}))
  fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'})
  expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Dark mode'}))
  fireEvent.keyDown(document.activeElement!,{key:'Escape'})
  expect(document.activeElement).toBe(trigger)
  expect(screen.queryByRole('menu')).toBeNull()
  fireEvent.click(trigger)
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
})

it('omits Profile when no existing profile destination was supplied', async () => {
  render(<MemoryRouter><ThemeProvider><AccountMenu identity={identity} onSignOut={signOut} /></ThemeProvider></MemoryRouter>)
  await openMenu()
  expect(screen.queryByRole('menuitem',{name:'Profile'})).toBeNull()
  expect(screen.getAllByRole('menuitem')).toHaveLength(2)
})
