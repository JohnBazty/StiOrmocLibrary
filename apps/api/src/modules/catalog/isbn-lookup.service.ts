import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { isbnValidationMessage, normalizeIsbn } from './catalog.validation.ts'
import { isbnLookupRepository, type IsbnLookupRepository, type IsbnMetadata } from './isbn-lookup.repository.ts'

type Fetcher = typeof fetch
type GoogleVolume = { volumeInfo?: { title?: unknown; authors?: unknown; publisher?: unknown; publishedDate?: unknown; industryIdentifiers?: unknown } }
type OpenLibraryDocument = { title?: unknown; author_name?: unknown; publisher?: unknown; first_publish_year?: unknown; publish_year?: unknown; isbn?: unknown }

const CACHE_TTL_MS = 10 * 60 * 1000

function text(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : ''
}

function joined(value: unknown, maximum: number) {
  if (!Array.isArray(value)) return ''
  return value.map((item) => text(item, maximum)).filter(Boolean).join('; ').slice(0, maximum)
}

function year(value: unknown) {
  const match = String(value ?? '').match(/(?:^|\D)(\d{4})(?:\D|$)/)
  const parsed = match ? Number(match[1]) : null
  return parsed && parsed >= 1000 && parsed <= new Date().getFullYear() ? parsed : null
}

function exactIsbn(values: unknown, isbn: string) {
  if (!Array.isArray(values)) return false
  return values.some((value) => {
    if (typeof value === 'string') return normalizeIsbn(value) === isbn
    if (!value || typeof value !== 'object') return false
    return normalizeIsbn((value as { identifier?: unknown }).identifier) === isbn
  })
}

async function fetchJson(fetcher: Fetcher, url: URL, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'STI-Ormoc-SmartLib/0.1' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Metadata provider returned ${response.status}.`)
    return await response.json() as unknown
  } finally { clearTimeout(timeout) }
}

export function createIsbnLookupService(options: {
  repository?: IsbnLookupRepository
  fetcher?: Fetcher
  timeoutMs?: number
  googleApiKey?: string
} = {}) {
  const repository = options.repository ?? isbnLookupRepository
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? env.isbnLookup.timeoutMs
  const googleApiKey = options.googleApiKey ?? env.isbnLookup.googleBooksApiKey
  const cache = new Map<string, { expiresAt: number; data: IsbnMetadata }>()

  async function google(isbn: string): Promise<IsbnMetadata | null> {
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    url.searchParams.set('q', `isbn:${isbn}`)
    url.searchParams.set('maxResults', '5')
    url.searchParams.set('printType', 'books')
    if (googleApiKey) url.searchParams.set('key', googleApiKey)
    const payload = await fetchJson(fetcher, url, timeoutMs) as { items?: GoogleVolume[] }
    const volume = payload.items?.find((item) => exactIsbn(item.volumeInfo?.industryIdentifiers, isbn))
    const info = volume?.volumeInfo
    const title = text(info?.title, 255)
    const author = joined(info?.authors, 255)
    if (!title || !author) return null
    return { isbn, title, author, publisher: text(info?.publisher, 255) || null, publicationYear: year(info?.publishedDate), source: 'google_books' }
  }

  async function openLibrary(isbn: string): Promise<IsbnMetadata | null> {
    const url = new URL('https://openlibrary.org/search.json')
    url.searchParams.set('isbn', isbn)
    url.searchParams.set('fields', 'title,author_name,publisher,first_publish_year,publish_year,isbn')
    url.searchParams.set('limit', '5')
    const payload = await fetchJson(fetcher, url, timeoutMs) as { docs?: OpenLibraryDocument[] }
    const document = payload.docs?.find((item) => exactIsbn(item.isbn, isbn))
    const title = text(document?.title, 255)
    const author = joined(document?.author_name, 255)
    if (!title || !author) return null
    const publisher = Array.isArray(document?.publisher) ? text(document.publisher[0], 255) : text(document?.publisher, 255)
    const publicationYear = year(document?.first_publish_year) ?? (Array.isArray(document?.publish_year) ? year(document.publish_year[0]) : year(document?.publish_year))
    return { isbn, title, author, publisher: publisher || null, publicationYear, source: 'open_library' }
  }

  return {
    async lookup(rawIsbn: unknown): Promise<IsbnMetadata> {
      const isbn = normalizeIsbn(rawIsbn)
      const validation = isbnValidationMessage(rawIsbn)
      if (validation) throw new HttpError(422, 'ISBN_INVALID', validation, { errors: { isbn: validation } })

      const local = await repository.findLocalByIsbn(isbn)
      if (local) return local
      const cached = cache.get(isbn)
      if (cached && cached.expiresAt > Date.now()) return cached.data

      let providerFailures = 0
      // Google Books applies a small unauthenticated quota. Prefer the public
      // Open Library lookup unless an installation has configured a Google key.
      const providers = googleApiKey ? [google, openLibrary] : [openLibrary, google]
      for (const provider of providers) {
        try {
          const data = await provider(isbn)
          if (data) { cache.set(isbn, { expiresAt: Date.now() + CACHE_TTL_MS, data }); return data }
        } catch { providerFailures += 1 }
      }
      if (providerFailures === 2) throw new HttpError(503, 'ISBN_LOOKUP_UNAVAILABLE', 'Book metadata lookup is temporarily unavailable. Enter the details manually or try again.')
      throw new HttpError(404, 'ISBN_METADATA_NOT_FOUND', 'No book metadata was found for this ISBN. Enter the details manually.')
    },
  }
}

export const isbnLookupService = createIsbnLookupService()
