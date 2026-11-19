import type { ReservationFilters, ReservationQueueItem, ReservationStatus, RequestHistoryItem, SwapCandidate } from './types'
import { getCsrfToken } from '../auth/auth-storage'

export class ReservationApiError extends Error {
  constructor(message: string, public code: string) { super(message) }
}
export type ReservationSettingsView = { pickupWindowDays: number; pickupWindowChangedBy: string | null; pickupWindowChangedAt: string | null; waitingExpiryDays: number | null; waitingExpiryChangedBy: string | null; waitingExpiryChangedAt: string | null }
let csrfToken: string | null = null

export async function reservationRequest<T>(url: string, options: RequestInit = {}) {
  const method = options.method?.toUpperCase() ?? 'GET'
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  const accessToken = getCsrfToken()
  if (accessToken) headers.set('X-CSRF-Token', accessToken)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!accessToken && !csrfToken) {
      const response = await fetch('/api/auth/csrf', { credentials: 'include', headers: { Accept: 'application/json' } })
      const data = await response.json() as { csrfToken?: string; message?: string }
      if (!response.ok || !data.csrfToken) throw new ReservationApiError(data.message ?? 'Unable to start a secure request.', 'CSRF_UNAVAILABLE')
      csrfToken = data.csrfToken
    }
    headers.set('Content-Type', 'application/json'); if (csrfToken) headers.set('x-csrf-token', csrfToken)
  }
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new ReservationApiError('Your session has expired. Sign in again to manage reservations.', 'NON_JSON_RESPONSE')
  const payload = await response.json() as { data?: T; message?: string; code?: string }
  if (!response.ok) throw new ReservationApiError(payload.message ?? 'The reservation request failed.', payload.code ?? 'REQUEST_FAILED')
  return payload.data as T
}
const request=reservationRequest

function query(filters: ReservationFilters) {
  const parameters = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) parameters.set(key, value) })
  return parameters.toString()
}
export const reservationApi = {
  queue: (filters: ReservationFilters, page=1) => request<{ items: ReservationQueueItem[]; pagination: { total: number;pages:number } }>(`/api/v1/admin/reservations?${query(filters)}&page=${page}&limit=25`),
  adjustStatus: (reservationId: number, status: ReservationStatus) => request(`/api/v1/admin/reservations/${reservationId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  swapCandidates: (reservationId: number) => request<SwapCandidate[]>(`/api/v1/admin/reservations/${reservationId}/swap-candidates`),
  swapCopy: (reservationId: number, physicalCopyId: number) => request(`/api/v1/admin/reservations/${reservationId}/swap-copy`, { method: 'POST', body: JSON.stringify({ physicalCopyId }) }),
  moveInQueue: (reservationId: number, direction: 'up' | 'down', reason: string) => request(`/api/v1/admin/reservations/${reservationId}/move`, { method: 'POST', body: JSON.stringify({ direction, reason }) }),
  mine: () => request<RequestHistoryItem[]>('/api/v1/reservations'),
  settings: () => request<ReservationSettingsView>('/api/v1/admin/reservation-settings'),
  saveSettings: (body: { pickupWindowDays?: string; waitingExpiryDays?: string }) => request<ReservationSettingsView>('/api/v1/admin/reservation-settings', { method: 'PUT', body: JSON.stringify(body) }),
  cancelMine: (reservationId: number) => request(`/api/v1/reservations/${reservationId}/cancel`, { method: 'PUT' }),
}
