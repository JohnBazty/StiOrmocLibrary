import { getCsrfToken } from '../auth/auth-storage'

export type AdminNotice = { id: string; kind: 'profile' | 'status'; title: string; body: string; createdAt: string; actionPath: string }
export type AdminInbox = { activity: AdminNotice[] }

export async function fetchAdminNotifications(signal?: AbortSignal): Promise<AdminInbox> {
  const response = await fetch('/api/v1/admin/notifications', { signal, credentials:'include', headers:{Accept:'application/json','X-CSRF-Token': getCsrfToken() ?? ''} })
  const payload = await response.json() as { data?: AdminInbox; message?: string }
  if (!response.ok || !payload.data) throw new Error(payload.message ?? 'Unable to load Admin notifications.')
  return payload.data
}
