import { getAccessToken } from '../auth/auth-storage'
import type { ClearanceList, ClearanceRecord } from './types'

async function request<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers); headers.set('Accept', 'application/json')
  const token = getAccessToken(); if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string } | null
  if (!response.ok || !payload?.success) throw new Error(payload?.message ?? 'The clearance request failed.')
  return payload.data as T
}

export const clearanceApi = {
  mine: () => request<ClearanceRecord>('/api/v1/clearance/me'),
  list: (search = '') => request<ClearanceList>(`/api/v1/admin/clearance?limit=100&search=${encodeURIComponent(search)}`),
  detail: (userId: number) => request<ClearanceRecord>(`/api/v1/admin/clearance/${userId}`),
  override: (userId: number, input: { status: string; reason: string; expiresAt?: string | null }) => request<{ clearance: ClearanceRecord }>(`/api/v1/admin/clearance/${userId}/overrides`, { method: 'POST', body: JSON.stringify(input) }),
  revoke: (userId: number, overrideId: number, reason: string) => request<ClearanceRecord>(`/api/v1/admin/clearance/${userId}/overrides/${overrideId}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),
  reportLost: (transactionId: number) => request(`/api/v1/clearance/lost-books/${transactionId}/report`, { method: 'POST' }),
  decideLost: (reportId: number, status: 'Confirmed' | 'Rejected', replacementCharge?: number) => request(`/api/v1/admin/clearance/lost-books/${reportId}`, { method: 'PATCH', body: JSON.stringify({ status, replacement_charge: replacementCharge }) }),
  settleLost: (reportId: number) => request(`/api/v1/admin/clearance/lost-books/${reportId}/payment`, { method: 'PATCH' }),
}
