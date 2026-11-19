import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceNotificationsPage } from './WorkspaceNotificationsPage'

const api = vi.hoisted(() => ({ list: vi.fn(), schedule: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() }))
vi.mock('./notification-api', () => ({ notificationApi: api }))
vi.mock('./AdminNotificationsPage', () => ({ AdminNotificationsPage: () => <h1>Recent account activity</h1> }))
vi.mock('../auth/auth-storage', () => ({ getCurrentIdentity: () => ({ role: 'Staff' }) }))
const notice = { notificationId: 5, title: 'Print request ready', body: 'Review the print queue.', type: 'Printing Update', actionPath: '/admin/printing', priority: 'Normal', isRead: false, createdAt: '2026-11-18T01:00:00Z' }
beforeEach(() => { api.list.mockResolvedValue({ items: [notice], unreadCount: 1 }); api.markRead.mockResolvedValue({}); api.markAllRead.mockResolvedValue({}) })
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('opens the staff inbox, marks a notice read and follows the staff destination', async () => {
  render(<MemoryRouter initialEntries={['/staff/notifications']}><Routes><Route path="/staff/notifications" element={<WorkspaceNotificationsPage workspace="staff" />} /><Route path="/staff/printing" element={<h1>Staff print queue</h1>} /></Routes></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Staff notifications' })).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: /^Print request ready/ }))
  expect(await screen.findByRole('heading', { name: 'Staff print queue' })).toBeTruthy()
  expect(api.markRead).toHaveBeenCalledWith(5)
  expect(api.schedule).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Account activity' })).toBeNull()
})
it.each(['admin', 'librarian'] as const)('opens the %s inbox first and keeps account activity available separately', async workspace => {
  render(<MemoryRouter><WorkspaceNotificationsPage workspace={workspace} /></MemoryRouter>)
  expect(await screen.findByText(notice.title)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Notifications', pressed: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
  await waitFor(() => expect(api.markAllRead).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Account activity' }))
  expect(screen.getByRole('heading', { name: 'Recent account activity' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
  expect(await screen.findByText(notice.title)).toBeTruthy()
  expect(api.schedule).not.toHaveBeenCalled()
})
it('shows a loading message before an empty inbox is confirmed', async () => {
  api.list.mockReturnValue(new Promise(() => {}))
  render(<MemoryRouter><WorkspaceNotificationsPage workspace="staff" /></MemoryRouter>)
  expect(screen.getByText('Loading notifications…')).toBeTruthy()
  expect(screen.queryByText('No notifications yet.')).toBeNull()
})
it('shows an inbox error and retries without claiming there are no notifications', async () => {
  api.list.mockRejectedValueOnce(new Error('Notifications are temporarily unavailable.')).mockResolvedValue({ items: [], unreadCount: 0 })
  render(<MemoryRouter><WorkspaceNotificationsPage workspace="staff" /></MemoryRouter>)
  expect((await screen.findByRole('alert')).textContent).toContain('temporarily unavailable')
  expect(screen.queryByText('No notifications yet.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByText('No notifications yet.')).toBeTruthy()
})
