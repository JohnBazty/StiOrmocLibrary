import type { ReservationFilters, ReservationQueueItem, ReservationStatus } from './types'
import { getAccessToken } from '../auth/auth-storage'

export class ReservationApiError extends Error {
  constructor(message: string, public code: string) { super(message) }
}
let csrfToken: string | null = null

async function request<T>(url: string, options: RequestInit = {}) {
  const method = options.method?.toUpperCase() ?? 'GET'
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  const accessToken = getAccessToken()
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
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

function query(filters: ReservationFilters) {
  const parameters = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) parameters.set(key, value) })
  return parameters.toString()
}
export const reservationApi = {
  queue: (filters: ReservationFilters) => request<{ items: ReservationQueueItem[]; pagination: { total: number } }>(`/api/v1/admin/reservations?${query(filters)}`),
  adjustStatus: (reservationId: number, status: ReservationStatus) => request(`/api/v1/admin/reservations/${reservationId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  mine: () => request<Array<{ reservationId: number; title: string; coverImagePath: string | null; queuePosition: number; status: ReservationStatus; reservedAt: string; pickupDeadline: string | null; accessionNumber: string | null; barcode: string | null; conditionStatus: string | null }>>('/api/v1/reservations'),
  cancelMine: (reservationId: number) => request(`/api/v1/reservations/${reservationId}/cancel`, { method: 'PUT' }),
}
