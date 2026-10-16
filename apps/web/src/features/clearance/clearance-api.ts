import { getAccessToken } from '../auth/auth-storage'
import type { ClearanceList, ClearanceRecord, ClearanceSchedule } from './types'

export class ClearanceApiError extends Error {
  constructor(message: string, public code?: string) { super(message) }
}

async function request<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers); headers.set('Accept', 'application/json')
  const token = getAccessToken(); if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string; code?: string } | null
  if (!response.ok || !payload?.success) throw new ClearanceApiError(payload?.message ?? 'The clearance request failed.', payload?.code)
  return payload.data as T
}

export const clearanceApi = {
  schedule: (termId?: number, admin = false) => request<ClearanceSchedule>(`/api/v1/${admin ? 'admin/' : ''}clearance/schedule${termId ? `?termId=${termId}` : ''}`),
  terms: () => request<Array<{id:number;academic_year:string;term_name:string;is_active:number}>>('/api/v1/admin/clearance/schedule/terms'),
  saveSchedule: (input: {termId:number;deadlineAt:string|null;version:number}) => request<ClearanceSchedule>('/api/v1/admin/clearance/schedule', {method:'PUT',body:JSON.stringify(input)}),
  mine: () => request<ClearanceRecord>('/api/v1/clearance/me', { cache: 'no-store' }),
  list: (search = '', status = '', activeOnly = false) => request<ClearanceList>(`/api/v1/admin/clearance?limit=100&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&active=${activeOnly ? '1' : '0'}`),
  detail: (userId: number) => request<ClearanceRecord>(`/api/v1/admin/clearance/${userId}`),
  override: (userId: number, input: { status: string; reason: string; expiresAt?: string | null }) => request<{ clearance: ClearanceRecord }>(`/api/v1/admin/clearance/${userId}/overrides`, { method: 'POST', body: JSON.stringify(input) }),
  revoke: (userId: number, overrideId: number, reason: string) => request<ClearanceRecord>(`/api/v1/admin/clearance/${userId}/overrides/${overrideId}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),
  reportLost: (transactionId: number) => request(`/api/v1/clearance/lost-books/${transactionId}/report`, { method: 'POST' }),
  decideLost: (reportId: number, status: 'Confirmed' | 'Rejected') => request(`/api/v1/admin/clearance/lost-books/${reportId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  resolveLost: (reportId: number, action: 'Charge' | 'Waive', reason?: string) => request(`/api/v1/admin/clearance/lost-books/${reportId}/resolution`, { method: 'PATCH', body: JSON.stringify({ action, reason }) }),
  settleLost: (reportId: number) => request(`/api/v1/admin/clearance/lost-books/${reportId}/payment`, { method: 'PATCH' }),
}
