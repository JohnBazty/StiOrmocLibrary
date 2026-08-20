import type { Category, CategoryPayload } from './types'
import { getAccessToken } from '../auth/auth-storage'

export class CategoryApiError extends Error {
  constructor(message: string, public code: string, public errors: Record<string, string> = {}) { super(message) }
}

let csrfToken: string | null = null

async function decodeResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new CategoryApiError(
      response.redirected ? 'Your session has expired. Sign in again to manage categories.' : 'The server returned an unexpected response.',
      'NON_JSON_RESPONSE',
    )
  }
  const payload = await response.json() as { data?: T; message?: string; code?: string; details?: { errors?: Record<string, string> } }
  if (!response.ok) throw new CategoryApiError(payload.message ?? 'The request could not be completed.', payload.code ?? 'REQUEST_FAILED', payload.details?.errors)
  return payload.data as T
}

async function request<T>(url: string, options: RequestInit = {}) {
  const method = options.method?.toUpperCase() ?? 'GET'
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  const accessToken = getAccessToken()
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!accessToken && !csrfToken) {
      const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'include', headers: { Accept: 'application/json' } })
      const tokenPayload = await tokenResponse.json() as { csrfToken?: string; message?: string }
      if (!tokenResponse.ok || !tokenPayload.csrfToken) throw new CategoryApiError(tokenPayload.message ?? 'Unable to start a secure request.', 'CSRF_UNAVAILABLE')
      csrfToken = tokenPayload.csrfToken
    }
    headers.set('Content-Type', 'application/json')
    if (csrfToken) headers.set('x-csrf-token', csrfToken)
  }
  return decodeResponse<T>(await fetch(url, { ...options, headers, credentials: 'include' }))
}

export const categoryApi = {
  list: () => request<Category[]>('/api/categories'),
  create: (payload: CategoryPayload) => request<Category>('/api/categories', { method: 'POST', body: JSON.stringify(payload) }),
  update: (categoryId: number, payload: CategoryPayload) => request<Category>(`/api/categories/${categoryId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (categoryId: number) => request(`/api/categories/${categoryId}`, { method: 'DELETE' }),
  reassign: (oldCategoryId: number, targetCategoryId: number) => request('/api/categories/reassign', {
    method: 'POST', body: JSON.stringify({ oldCategoryId, targetCategoryId }),
  }),
}
