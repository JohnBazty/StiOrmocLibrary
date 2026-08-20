import type { CatalogFilters, CatalogItem, Category, PhysicalCopy } from './types'
import { getAccessToken } from '../auth/auth-storage'

export class ApiError extends Error {
  constructor(message: string, public code: string, public details?: { errors?: Record<string, string> }) { super(message) }
}

let csrfToken: string | null = null

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? 'GET'
  const headers = new Headers(options.headers)
  const accessToken = getAccessToken()
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!accessToken && !csrfToken) {
      const response = await fetch('/api/auth/csrf', { credentials: 'include' })
      const payload = await response.json() as { csrfToken?: string; message?: string }
      if (!response.ok || !payload.csrfToken) throw new ApiError(payload.message ?? 'Unable to start a secure request.', 'CSRF_UNAVAILABLE')
      csrfToken = payload.csrfToken
    }
    headers.set('Content-Type', 'application/json')
    if (csrfToken) headers.set('x-csrf-token', csrfToken)
  }
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json() as { success?: boolean; message?: string; code?: string; details?: { errors?: Record<string, string> }; data?: T }
  if (!response.ok) {
    if (payload.code === 'INVALID_CSRF_TOKEN') csrfToken = null
    throw new ApiError(payload.message ?? 'The request could not be completed.', payload.code ?? 'REQUEST_FAILED', payload.details)
  }
  return payload.data as T
}

export function filterQuery(filters: CatalogFilters) {
  const query = new URLSearchParams()
  if (filters.q) query.set('q', filters.q)
  if (filters.scope !== 'all') query.set('scope', filters.scope)
  if (filters.categoryId) query.set('categoryId', filters.categoryId)
  if (filters.author) query.set('author', filters.author)
  if (filters.publicationYear) query.set('publicationYear', filters.publicationYear)
  if (filters.availability) query.set('availability', filters.availability)
  return query.toString()
}

export const catalogApi = {
  async search(filters: CatalogFilters) {
    return request<{ items: CatalogItem[]; pagination: { total: number } }>(`/api/catalog/search?${filterQuery(filters)}`)
  },
  categories: () => request<Category[]>('/api/categories'),
  copies: () => request<PhysicalCopy[]>('/api/catalog/admin/copies?limit=150'),
  createBook: (body: unknown) => request('/api/catalog/books', { method: 'POST', body: JSON.stringify(body) }),
  createThesis: (body: unknown) => request('/api/catalog/research', { method: 'POST', body: JSON.stringify(body) }),
  parseRegistry: (value: string) => request<{ kind: string; normalizedValue: string; match: null | Record<string, unknown> }>('/api/catalog/registry/parse', {
    method: 'POST', body: JSON.stringify({ value, mode: 'auto' }),
  }),
  async downloadInventory(format: 'csv' | 'pdf', filters: CatalogFilters) {
    const accessToken = getAccessToken()
    const headers = new Headers({ Accept: format === 'csv' ? 'text/csv' : 'application/pdf' })
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    const query = filterQuery(filters)
    const response = await fetch(`/api/reports/catalog/inventory.${format}${query ? `?${query}` : ''}`, {
      headers, credentials: 'include',
    })
    if (!response.ok) {
      const isJson = (response.headers.get('content-type') ?? '').includes('application/json')
      const payload = isJson ? await response.json() as { message?: string; code?: string } : null
      throw new ApiError(payload?.message ?? `The ${format.toUpperCase()} report could not be generated.`, payload?.code ?? 'EXPORT_FAILED')
    }
    const expectedType = format === 'csv' ? 'text/csv' : 'application/pdf'
    if (!(response.headers.get('content-type') ?? '').includes(expectedType)) {
      throw new ApiError('The report server returned an unexpected file type.', 'INVALID_EXPORT_RESPONSE')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sti-library-inventory.${format}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  },
}
