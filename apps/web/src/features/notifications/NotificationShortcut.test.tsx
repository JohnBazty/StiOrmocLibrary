import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { NotificationShortcut } from './NotificationShortcut'
const api = vi.hoisted(() => ({ list: vi.fn(), markAllRead: vi.fn(), markRead: vi.fn() }))
vi.mock('./notification-api', () => ({ notificationApi: api }))
vi.mock('../auth/auth-storage', () => ({ getCsrfToken: () => 'fixture-token' }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it.each(['admin', 'librarian', 'staff', 'student', 'faculty'])('marks all %s notices read from the dropdown without leaving the page', async role => {
  let unread = 20
  api.list.mockImplementation(async () => ({ unreadCount: unread, items: [{ notificationId: 5, title: 'Library update', body: 'Review the details.', type: 'Announcement', isRead: unread === 0, createdAt: '2026-11-18T01:00:00Z' }] }))
  api.markAllRead.mockImplementation(async () => { unread = 0 })
  render(<MemoryRouter><NotificationShortcut path={`/${role}/notifications`} /></MemoryRouter>)
  await screen.findByLabelText('20 unread notifications')
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
  const preview = within(screen.getByRole('region', { name: 'Recent notifications' }))
  await preview.findByText('Library update')
  fireEvent.click(preview.getByRole('button', { name: 'Mark all as read' }))
  await waitFor(() => expect(api.markAllRead).toHaveBeenCalledOnce())
  await preview.findByText('0 unread')
  expect(preview.getByRole('link', { name: 'See all' }).getAttribute('href')).toBe(`/${role}/notifications`)
  expect(preview.getByRole('button', { name: 'Mark all as read' }).hasAttribute('disabled')).toBe(true)
  expect(api.markRead).not.toHaveBeenCalled()
})
it('retains unread notices and permits retry after a failed update', async () => {
  api.list.mockResolvedValue({ unreadCount: 2, items: [] })
  api.markAllRead.mockRejectedValue(new Error('Connection interrupted. Try again.'))
  render(<MemoryRouter><NotificationShortcut path="/staff/notifications" /></MemoryRouter>)
  await screen.findByLabelText('2 unread notifications')
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Connection interrupted')
  expect(screen.getByLabelText('2 unread notifications')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Mark all as read' }).hasAttribute('disabled')).toBe(false)
})
