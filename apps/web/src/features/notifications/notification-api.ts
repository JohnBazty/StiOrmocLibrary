import { getCsrfToken } from '../auth/auth-storage'
import type { Announcement, LibrarySchedule, ManagedLibrarySchedule, NotificationList } from './types'

async function request<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers); headers.set('Accept', 'application/json')
  const token = getCsrfToken(); if (token) headers.set('X-CSRF-Token', token)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string } | null
  if (!response.ok || !payload?.success) throw new Error(payload?.message ?? 'The notification request failed.')
  return payload.data as T
}

export const notificationApi = {
  librarySchedule: (signal?: AbortSignal) => request<ManagedLibrarySchedule>('/api/v1/library-schedule', { signal }),
  saveLibrarySchedule: (input: ManagedLibrarySchedule) => request<ManagedLibrarySchedule>('/api/v1/library-schedule', { method: 'PUT', body: JSON.stringify(input) }),
  pushStatus:(endpoint:string)=>request<{enabled:boolean}>('/api/v1/notifications/push/status',{method:'POST',body:JSON.stringify({endpoint})}),
  pushConfiguration:()=>request<{publicKey:string}>('/api/v1/notifications/push'),
  enablePush:(endpoint:string)=>request('/api/v1/notifications/push',{method:'POST',body:JSON.stringify({endpoint})}),
  disablePush:(endpoint:string)=>request('/api/v1/notifications/push',{method:'DELETE',body:JSON.stringify({endpoint})}),
  list: (signal?: AbortSignal, limit = 100) => request<NotificationList>(`/api/v1/notifications?limit=${limit}`, { signal }),
  schedule: () => request<LibrarySchedule>('/api/v1/notifications/schedule'),
  markRead: (id: number) => request(`/api/v1/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request('/api/v1/notifications/read-all', { method: 'PATCH' }),
  remove: (id: number) => request(`/api/v1/notifications/${id}`, { method: 'DELETE' }),
  removeAll: () => request('/api/v1/notifications', { method: 'DELETE' }),
  announcements: () => request<Announcement[]>('/api/v1/admin/announcements'),
  createAnnouncement: (input: { title: string; body: string; priority: string; publishAt?: string | null; expiresAt?: string | null }) => request('/api/v1/admin/announcements', { method: 'POST', body: JSON.stringify(input) }),
}
