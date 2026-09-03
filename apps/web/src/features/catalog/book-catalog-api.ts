import { getAccessToken } from '../auth/auth-storage'
import type { BookCatalogItem, BookCatalogViewer, BookCategory, CatalogCopyAsset, Pagination } from './book-catalog-types'

const BASE_URL = '/api/v1/catalog/books'
const CATEGORY_URL = '/api/v1/catalog/categories'

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as { success?: boolean; message?: string; data?: T } | null
  if (!response.ok || !payload?.success) throw new Error(payload?.message || 'The catalog request could not be completed.')
  return payload.data as T
}

function authorizationHeaders(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type BookCatalogRequest = {
  query?: string
  categoryName?: string
  categoryId?: number
  title?: string
  author?: string
  isbn?: string
  publicationYear?: number
  page?: number
  signal?: AbortSignal
}

export async function fetchBookCategories(signal?: AbortSignal) {
  const response = await fetch(CATEGORY_URL, {
    headers: { Accept: 'application/json', ...authorizationHeaders() },
    credentials: 'include',
    signal,
  })
  return parseResponse<BookCategory[]>(response)
}

export async function fetchBookCatalog(request: BookCatalogRequest = {}) {
  const parameters = new URLSearchParams()
  if (request.query) parameters.set('q', request.query)
  if (request.categoryName) parameters.set('category_name', request.categoryName)
  if (request.categoryId) parameters.set('category_id', String(request.categoryId))
  if (request.title) parameters.set('title', request.title)
  if (request.author) parameters.set('author', request.author)
  if (request.isbn) parameters.set('isbn', request.isbn)
  if (request.publicationYear) parameters.set('publication_year', String(request.publicationYear))
  parameters.set('page', String(request.page ?? 1))
  parameters.set('limit', '24')

  const response = await fetch(`${BASE_URL}?${parameters}`, {
    headers: { Accept: 'application/json', ...authorizationHeaders() },
    credentials: 'include',
    signal: request.signal,
  })
  const payload = await response.json().catch(() => null) as {
    success?: boolean
    message?: string
    data?: BookCatalogItem[]
    meta?: { pagination: Pagination; viewer: BookCatalogViewer }
  } | null
  if (!response.ok || !payload?.success || !payload.data || !payload.meta) {
    throw new Error(payload?.message || 'The book catalog is currently unavailable.')
  }
  return { items: payload.data, ...payload.meta }
}

export async function fetchBookOverview(titleId: number, signal?: AbortSignal) {
  const response = await fetch(`${BASE_URL}/${titleId}`, {
    headers: { Accept: 'application/json', ...authorizationHeaders() },
    credentials: 'include',
    signal,
  })
  return parseResponse<BookCatalogItem>(response)
}

export async function fetchCatalogCopyAsset(barcode: string, signal?: AbortSignal) {
  const response = await fetch(`/api/v1/catalog/copies/${encodeURIComponent(barcode)}`, {
    headers: { Accept: 'application/json', ...authorizationHeaders() },
    credentials: 'include',
    signal,
  })
  return parseResponse<CatalogCopyAsset>(response)
}

export async function reserveBookTitle(titleId: number) {
  const response = await fetch(`${BASE_URL}/${titleId}/reservations`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authorizationHeaders() },
    credentials: 'include',
    body: '{}',
  })
  return parseResponse<{ reservationId: number; queuePosition: number; status: string }>(response)
}
