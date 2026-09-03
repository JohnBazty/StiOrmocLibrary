import { getAccessToken } from '../auth/auth-storage'
import type { ResearchCatalogItem, ResearchPagination } from './research-catalog-types'

const BASE_URL = '/api/v1/catalog/research'

function headers(): Record<string, string> {
  const token = getAccessToken()
  return { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

async function json<T>(response: Response) {
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string } | null
  if (!response.ok || !payload?.success) throw new Error(payload?.message || 'The research repository is currently unavailable.')
  return payload.data as T
}

export async function fetchResearchCatalog(input: { query?: string; page?: number; signal?: AbortSignal } = {}) {
  const parameters = new URLSearchParams({ page: String(input.page ?? 1), limit: '25' })
  if (input.query) parameters.set('q', input.query)
  const response = await fetch(`${BASE_URL}?${parameters}`, { headers: headers(), credentials: 'include', signal: input.signal })
  const payload = await response.json().catch(() => null) as {
    success?: boolean; data?: ResearchCatalogItem[]; message?: string
    meta?: { pagination: ResearchPagination; viewOnly: true }
  } | null
  if (!response.ok || !payload?.success || !payload.data || !payload.meta) {
    throw new Error(payload?.message || 'The research repository is currently unavailable.')
  }
  return { items: payload.data, pagination: payload.meta.pagination }
}

export async function fetchResearchOverview(titleId: number, signal?: AbortSignal) {
  return json<ResearchCatalogItem>(await fetch(`${BASE_URL}/${titleId}`, {
    headers: headers(), credentials: 'include', signal,
  }))
}
