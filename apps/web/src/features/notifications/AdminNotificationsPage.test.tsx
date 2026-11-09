import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminNotificationsPage } from './AdminNotificationsPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows Admin account activity and profile changes with links to the permitted pages', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: {
    activity: [{ id: 'event-2', kind: 'profile', title: 'User updated their profile', body: 'Other User (ST-2) changed first name.', createdAt: '2026-09-28T09:00:00Z', actionPath: '/admin/users' }],
  } }) })))
  render(<MemoryRouter><AdminNotificationsPage /></MemoryRouter>)
  expect(await screen.findByText('User updated their profile')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View users' }).getAttribute('href')).toBe('/admin/users')
})

it('shows an access error without falsely reporting an empty inbox', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ message: 'Your role cannot access this resource.' }) })))
  render(<MemoryRouter><AdminNotificationsPage /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Your role cannot access this resource.')
  expect(screen.queryByText('No recent account changes.')).toBeNull()
})
