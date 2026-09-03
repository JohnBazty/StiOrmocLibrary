import { getAccessToken } from '../auth/auth-storage'
import type { Announcement, LibrarySchedule, NotificationList } from './types'

async function request<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers); headers.set('Accept', 'application/json')
  const token = getAccessToken(); if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string } | null
  if (!response.ok || !payload?.success) throw new Error(payload?.message ?? 'The notification request failed.')
  return payload.data as T
}

export const notificationApi = {
  list: () => request<NotificationList>('/api/v1/notifications?limit=100'),
  schedule: () => request<LibrarySchedule>('/api/v1/notifications/schedule'),
  markRead: (id: number) => request(`/api/v1/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request('/api/v1/notifications/read-all', { method: 'PATCH' }),
  announcements: () => request<Announcement[]>('/api/v1/admin/announcements'),
  createAnnouncement: (input: { title: string; body: string; priority: string; publishAt?: string | null; expiresAt?: string | null }) => request('/api/v1/admin/announcements', { method: 'POST', body: JSON.stringify(input) }),
}
