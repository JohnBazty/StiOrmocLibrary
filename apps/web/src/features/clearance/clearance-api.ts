import { getCsrfToken } from '../auth/auth-storage'
import type { ClearanceList, ClearanceRecord, ClearanceSchedule, ClearanceScheduleInput } from './types'

export class ClearanceApiError extends Error {
  constructor(message: string, public code?: string) { super(message) }
}

async function request<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers); headers.set('Accept', 'application/json')
  const token = getCsrfToken(); if (token) headers.set('X-CSRF-Token', token)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string; code?: string } | null
  if (!response.ok || !payload?.success) throw new ClearanceApiError(payload?.message ?? 'The clearance request failed.', payload?.code)
  return payload.data as T
}

export const clearanceApi = {
  schedule: (termId?: number, admin = false) => request<ClearanceSchedule>(`/api/v1/${admin ? 'admin/' : ''}clearance/schedule${termId ? `?termId=${termId}` : ''}`),
  terms: () => request<Array<{id:number;academic_year:string;term_name:string;is_active:number}>>('/api/v1/admin/clearance/schedule/terms'),
  saveSchedule: (input: ClearanceScheduleInput) => request<ClearanceSchedule>('/api/v1/admin/clearance/schedule', {method:'PUT',body:JSON.stringify(input)}),
  cancelSchedule: (id: number, termId: number, version: number) => request<ClearanceSchedule>(`/api/v1/admin/clearance/schedule/${id}/cancel`, {method:'POST',body:JSON.stringify({termId,version})}),
  mine: () => request<ClearanceRecord>('/api/v1/clearance/me', { cache: 'no-store' }),
  list: (search = '', status = '', activeOnly = false) => request<ClearanceList>(`/api/v1/admin/clearance?limit=100&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&active=${activeOnly ? '1' : '0'}`),
  detail: (userId: number) => request<ClearanceRecord>(`/api/v1/admin/clearance/${userId}`),
  override: (userId: number, input: { status: string; reason: string; expiresAt?: string | null }) => request<{ clearance: ClearanceRecord }>(`/api/v1/admin/clearance/${userId}/overrides`, { method: 'POST', body: JSON.stringify(input) }),
  revoke: (userId: number, overrideId: number, reason: string) => request<ClearanceRecord>(`/api/v1/admin/clearance/${userId}/overrides/${overrideId}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),
  reportLost: (transactionId: number) => request(`/api/v1/clearance/lost-books/${transactionId}/report`, { method: 'POST' }),
  // The confirmed amount is sent so the server refuses the charge if the price changed after the page loaded.
  /** Confirming a loss says how it is settled: pay the (entered) book price or replace the copy. */
  decideLost: (reportId: number, status: 'Confirmed' | 'Rejected', choice?: { resolution: 'Pay' | 'Replace'; bookPrice: number | null }) => request(`/api/v1/admin/clearance/lost-books/${reportId}`, { method: 'PATCH', body: JSON.stringify({ status, ...(choice ? { resolution: choice.resolution, ...(choice.bookPrice ? { book_price: choice.bookPrice } : {}) } : {}) }) }),
  replaceLost: (reportId: number) => request(`/api/v1/admin/clearance/lost-books/${reportId}/replacement`, { method: 'PATCH' }),
  resolveLost: (reportId: number, action: 'Charge' | 'Waive', reason?: string) => request(`/api/v1/admin/clearance/lost-books/${reportId}/resolution`, { method: 'PATCH', body: JSON.stringify({ action, reason }) }),
  settleLost: (reportId: number) => request(`/api/v1/admin/clearance/lost-books/${reportId}/payment`, { method: 'PATCH' }),
}
