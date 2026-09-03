import { getAccessToken } from '../auth/auth-storage'
import type { BorrowingHistoryData, CirculationMonitorData } from './types'

export class CirculationApiError extends Error {
  constructor(message: string, public code: string) { super(message) }
}

async function request<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers); headers.set('Accept', 'application/json')
  const token = getAccessToken(); if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string; code?: string } | null
  if (!response.ok || !payload?.success) throw new CirculationApiError(payload?.message ?? 'The circulation request failed.', payload?.code ?? 'CIRCULATION_REQUEST_FAILED')
  return payload.data as T
}

export const circulationApi = {
  history: (page = 1) => request<BorrowingHistoryData>(`/api/v1/borrowing/history?page=${page}&limit=25`),
  cancelRequest: (transactionId: number, reason?: string) => request<{ transactionId: number; status: 'Cancelled'; copyAvailability: string }>(`/api/v1/circulation/requests/${transactionId}/cancel`, {
    method: 'PUT', body: JSON.stringify({ reason }),
  }),
  monitor: (page = 1) => request<CirculationMonitorData>(`/api/v1/admin/borrowing/monitor?page=${page}&limit=100`),
  confirmCheckout: (barcode: string, schoolId: string) => request('/api/v1/admin/borrowing/confirm-checkout', {
    method: 'POST', body: JSON.stringify({ barcode, school_id: schoolId }),
  }),
  fulfillClaim: (barcode: string, schoolId: string) => request('/api/v1/circulation/fulfill-claim', {
    method: 'POST', body: JSON.stringify({ barcode, school_id: schoolId }),
  }),
  returnBook: (transactionId: number) => request(`/api/v1/admin/borrowing/${transactionId}/return`, { method: 'PUT' }),
  calculatePenalty: (transactionId: number) => request<{ amount: number; currency: string }>(`/api/v1/admin/borrowing/${transactionId}/calculate-penalty`, { method: 'POST' }),
}
