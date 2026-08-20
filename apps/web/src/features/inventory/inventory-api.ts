import { getAccessToken } from '../auth/auth-storage'
import type { InventoryCopy, InventoryFilters, InventoryPagination, InventorySummary } from './types'

export class InventoryApiError extends Error {
  constructor(message: string, public code: string, public errors: Record<string, string> = {}) { super(message) }
}

let csrfToken: string | null = null

function headersFor(method: string, accept = 'application/json') {
  const headers = new Headers({ Accept: accept })
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('Content-Type', 'application/json')
  return headers
}

async function ensureCsrf() {
  if (getAccessToken() || csrfToken) return
  const response = await fetch('/api/auth/csrf', { credentials: 'include', headers: { Accept: 'application/json' } })
  const payload = await response.json() as { csrfToken?: string; message?: string }
  if (!response.ok || !payload.csrfToken) throw new InventoryApiError(payload.message ?? 'Unable to start a secure request.', 'CSRF_UNAVAILABLE')
  csrfToken = payload.csrfToken
}

async function request<T>(url: string, options: RequestInit = {}) {
  const method = options.method?.toUpperCase() ?? 'GET'
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) await ensureCsrf()
  const headers = headersFor(method)
  if (csrfToken && !getAccessToken()) headers.set('x-csrf-token', csrfToken)
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json')
  const payload = isJson ? await response.json() as {
    data?: T
    message?: string
    code?: string
    details?: { errors?: Record<string, string> }
  } : null
  if (!response.ok || !payload) {
    if (payload?.code === 'INVALID_CSRF_TOKEN') csrfToken = null
    throw new InventoryApiError(payload?.message ?? 'The inventory request could not be completed.', payload?.code ?? 'INVENTORY_REQUEST_FAILED', payload?.details?.errors)
  }
  return payload.data as T
}

function filterQuery(filters: InventoryFilters) {
  const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) })
  if (filters.query) query.set('q', filters.query)
  if (filters.conditionState) query.set('condition_state', filters.conditionState)
  if (filters.availabilityStatus) query.set('availability_status', filters.availabilityStatus)
  return query.toString()
}

async function download(format: 'csv' | 'pdf') {
  const response = await fetch(`/api/inventory/export.${format}`, {
    credentials: 'include',
    headers: headersFor('GET', format === 'csv' ? 'text/csv' : 'application/pdf'),
  })
  if (!response.ok) {
    const isJson = (response.headers.get('content-type') ?? '').includes('application/json')
    const payload = isJson ? await response.json() as { message?: string; code?: string } : null
    throw new InventoryApiError(payload?.message ?? `Unable to generate the ${format.toUpperCase()} report.`, payload?.code ?? 'INVENTORY_EXPORT_FAILED')
  }
  const expected = format === 'csv' ? 'text/csv' : 'application/pdf'
  if (!(response.headers.get('content-type') ?? '').includes(expected)) {
    throw new InventoryApiError('The report server returned an unexpected file type.', 'INVALID_INVENTORY_EXPORT')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `smartlib-physical-inventory.${format}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export const inventoryApi = {
  summary: () => request<InventorySummary>('/api/inventory/summary'),
  async copies(filters: InventoryFilters) {
    const response = await fetch(`/api/inventory/copies?${filterQuery(filters)}`, {
      credentials: 'include', headers: headersFor('GET'),
    })
    const payload = await response.json() as {
      data?: InventoryCopy[]
      meta?: { pagination?: InventoryPagination }
      message?: string
      code?: string
    }
    if (!response.ok || !payload.data || !payload.meta?.pagination) {
      throw new InventoryApiError(payload.message ?? 'Unable to load physical copies.', payload.code ?? 'INVENTORY_REQUEST_FAILED')
    }
    return { items: payload.data, pagination: payload.meta.pagination }
  },
  scan: (barcode: string) => request<InventoryCopy>('/api/inventory/scans', { method: 'POST', body: JSON.stringify({ barcode }) }),
  changeCondition: (barcode: string, conditionState: 'damaged' | 'lost') => request<InventoryCopy>('/api/inventory/copies/condition', {
    method: 'PATCH', body: JSON.stringify({ barcode, condition_state: conditionState }),
  }),
  download,
}
