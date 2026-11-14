import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { PortalLayout } from './PortalLayout'
import { ThemeProvider } from '../features/theme/ThemeProvider'

const auth = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('../features/auth/auth-api', () => ({ logout: auth.logout }))
vi.mock('../features/auth/auth-storage', () => ({ getCurrentIdentity: () => null }))
vi.mock('../features/auth/SessionActivity', () => ({ SessionActivity: () => null }))
vi.mock('../features/attendance/AttendanceFab', () => ({ AttendanceFab: () => null }))
vi.mock('../features/notifications/NotificationShortcut', () => ({ NotificationShortcut: ({ path }: { path: string }) => <a href={path}>Notification preview</a> }))

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals() })

function open(role: 'student' | 'faculty' | 'staff' | 'librarian' | 'admin') {
  return render(<MemoryRouter initialEntries={[`/${role}/dashboard`]}><ThemeProvider><Routes>
    <Route element={<PortalLayout role={role} />}><Route path={`/${role}/dashboard`} element={<h1>Dashboard content</h1>} />
      <Route path={`/${role}/notifications`} element={<h1>Notification content</h1>} /></Route>
    <Route path="/login" element={<h1>Login destination</h1>} />
  </Routes></ThemeProvider></MemoryRouter>)
}

it.each(['student', 'faculty', 'staff', 'librarian', 'admin'] as const)('retains %s navigation and current account controls', role => {
  open(role)
  expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe(`/${role}/dashboard`)
  expect(screen.getByRole('link', { name: 'Notifications' }).getAttribute('href')).toBe(`/${role}/notifications`)
  fireEvent.click(screen.getByRole('button', { name: /Account menu for/ }))
  expect(screen.getByRole('region', { name: 'Signed-in account' })).toBeTruthy()
  if (role === 'admin') expect(screen.queryByRole('menuitem', { name: 'Profile' })).toBeNull()
  else expect(screen.getByRole('menuitem', { name: 'Profile' }).getAttribute('href')).toBe(`/${role}/profile`)
  if (role !== 'admin') expect(screen.getByRole('link', { name: 'Notification preview' }).getAttribute('href')).toBe(`/${role}/notifications`)
  if (role === 'librarian') expect(screen.getByRole('link', { name: 'Account overview' }).getAttribute('href')).toBe('/librarian/accounts')
  if (role === 'staff') {
    expect(screen.getByRole('link', { name: 'Borrow & return' }).getAttribute('href')).toBe('/staff/circulation')
    expect(screen.queryByRole('link', { name: 'Maintenance' })).toBeNull()
  }
  expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).toBeNull()
  expect(screen.queryByRole('searchbox')).toBeNull()
})

it('keeps sign-out failure visible and retries without a new confirmation dialog', async () => {
  auth.logout.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined)
  open('staff')
  fireEvent.click(screen.getByRole('button', { name: /Account menu for/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sign out could not be confirmed. Check your connection and try again.')
  expect(screen.getByRole('heading', { name: 'Dashboard content' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Account menu for/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
  expect(await screen.findByRole('heading', { name: 'Login destination' })).toBeTruthy()
  expect(auth.logout).toHaveBeenCalledTimes(2)
})

it('keeps mobile background inert, restores scroll, and closes navigation with Escape', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  open('staff')
  const toggle = screen.getByRole('button', { name: 'Open navigation' })
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(document.querySelector('main')?.parentElement?.hasAttribute('inert')).toBe(true)
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(toggle.getAttribute('aria-expanded')).toBe('false'))
  expect(document.querySelector('main')?.parentElement?.hasAttribute('inert')).toBe(false)
  expect(document.body.style.overflow).not.toBe('hidden')
})
