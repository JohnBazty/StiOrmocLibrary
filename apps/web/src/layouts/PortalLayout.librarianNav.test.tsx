import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { PortalLayout } from './PortalLayout'
import { ThemeProvider } from '../features/theme/ThemeProvider'
vi.mock('../features/auth/auth-storage', () => ({ getAccessToken: () => 'fixture-token', getCurrentIdentity: () => ({ role: 'Librarian', schoolId: 'EXAMPLE', userId: 999002 }) }))
vi.mock('../features/auth/SessionActivity', () => ({ SessionActivity: () => null }))
vi.mock('./SidebarAccountCard', () => ({ SidebarAccountCard: () => null }))
vi.mock('../features/attendance/AttendanceFab', () => ({ AttendanceFab: () => null }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows Research maintenance in the librarian sidebar', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, data: { items: [], unreadCount: 0, weekly: [], upcomingClosures: [] } })))
  render(<MemoryRouter initialEntries={['/librarian/dashboard']}><ThemeProvider><Routes><Route element={<PortalLayout role="librarian" />}><Route path="/librarian/dashboard" element={<h1>Dashboard</h1>} /></Route></Routes></ThemeProvider></MemoryRouter>)
  const links = await screen.findAllByRole('link', { name: 'Research maintenance' })
  expect(links[0].getAttribute('href')).toBe('/librarian/research-maintenance')
})
