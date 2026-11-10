import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationCenterPage } from './NotificationCenterPage'

const api = vi.hoisted(() => ({
  list: vi.fn(), schedule: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), remove: vi.fn(), removeAll: vi.fn(),
}))
vi.mock('./notification-api', () => ({ notificationApi: api }))

const notification = {
  notificationId: 12, title: 'Book ready for pickup', body: 'Your reserved book is ready.',
  type: 'Reservation Arrival', sourceType: 'Reservation', sourceId: 5, actionPath: '/student/reservations',
  priority: 'Urgent' as const, isRead: false, createdAt: '2026-09-05T08:00:00.000Z', readAt: null, expiresAt: null,
}
const schedule = { timezone: 'Asia/Manila', weekly: [], upcomingClosures: [] }

describe('notification center', () => {
  it('keeps the inbox and unread state when marking notifications read fails', async () => {
    api.list.mockResolvedValue({ items:[notification],unreadCount:1,pagination:{page:1,limit:100,total:1,totalPages:1} })
    api.markAllRead.mockRejectedValue(new Error('Connection interrupted. Try again.'))
    render(<MemoryRouter><NotificationCenterPage/></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button',{name:'Mark all read'}))
    expect((await screen.findByRole('alert')).textContent).toContain('Connection interrupted')
    expect(screen.getByText('Book ready for pickup')).toBeTruthy()
    expect((screen.getByRole('button',{name:'Mark all read'}) as HTMLButtonElement).disabled).toBe(false)
  })
  beforeEach(() => { vi.clearAllMocks(); api.schedule.mockResolvedValue(schedule); api.remove.mockResolvedValue({ deleted: true }); api.removeAll.mockResolvedValue({ deletedCount: 1 }) })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('lets the signed-in user delete a notification from the inbox', async () => {
    api.list
      .mockResolvedValueOnce({ items: [notification], unreadCount: 1, pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })
      .mockResolvedValueOnce({ items: [], unreadCount: 0, pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } })
    render(<MemoryRouter><NotificationCenterPage /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Book ready for pickup' }))

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(12))
    expect(await screen.findByText('No notifications yet.')).toBeTruthy()
  })

  it('uses a custom confirmation dialog before deleting all delivered notifications', async () => {
    api.list
      .mockResolvedValueOnce({ items: [notification], unreadCount: 1, pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })
      .mockResolvedValueOnce({ items: [], unreadCount: 0, pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } })
    render(<MemoryRouter><NotificationCenterPage /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete all' }))
    expect(await screen.findByRole('alertdialog', { name: 'Delete all notifications?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete notifications' }))

    await waitFor(() => expect(api.removeAll).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('No notifications yet.')).toBeTruthy()
  })
})
