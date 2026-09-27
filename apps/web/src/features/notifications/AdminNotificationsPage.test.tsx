import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminNotificationsPage } from './AdminNotificationsPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows Admin review work and profile changes with links to the permitted pages', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: {
    pendingCount: 1,
    pending: [{ id: 'registration-1', kind: 'registration', title: 'Account registration awaiting approval', body: 'Example User (ST-1) requested Student access.', createdAt: '2026-09-28T08:00:00Z', actionPath: '/admin/approvals' }],
    activity: [{ id: 'event-2', kind: 'profile', title: 'User updated their profile', body: 'Other User (ST-2) changed first name.', createdAt: '2026-09-28T09:00:00Z', actionPath: '/admin/users' }],
  } }) })))
  render(<MemoryRouter><AdminNotificationsPage /></MemoryRouter>)
  expect(await screen.findByText('Account registration awaiting approval')).toBeTruthy()
  expect(screen.getByText('User updated their profile')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/admin/approvals')
  expect(screen.getByRole('link', { name: 'View users' }).getAttribute('href')).toBe('/admin/users')
})
