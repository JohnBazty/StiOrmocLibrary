import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { isbnValidationMessage, isValidIsbn, normalizeIsbn } from './catalog.validation.ts'
import { COVER_MAX_BYTES, coverSignatureMatches } from './cover-image.storage.ts'
import { isbnLookupRepository, type IsbnLookupRepository, type IsbnMetadata } from './isbn-lookup.repository.ts'

type Fetcher = typeof fetch
type GoogleVolume = { volumeInfo?: { title?: unknown; authors?: unknown; publisher?: unknown; publishedDate?: unknown; industryIdentifiers?: unknown } }
type OpenLibraryDocument = { title?: unknown; author_name?: unknown; publisher?: unknown; first_publish_year?: unknown; publish_year?: unknown; isbn?: unknown }

const CACHE_TTL_MS = 10 * 60 * 1000
const TITLE_SEARCH_LIMIT = 10

/** Title lookup (ported from STI ILMS REA): one provider result a staff member can pick to fill the form. */
export type TitleCandidate = { title: string; author: string; publisher: string | null; publicationYear: number | null; isbn: string | null; inCatalog: boolean }
type RawCandidate = Omit<TitleCandidate, 'inCatalog'>

/** The first valid ISBN-13 in a provider list, else the first valid ISBN-10, else null. */
function bestIsbn(values: unknown[]) {
  const valid = values.map((value) => normalizeIsbn(value)).filter((isbn) => isbn && isValidIsbn(isbn))
  return valid.find((isbn) => isbn.length === 13) ?? valid[0] ?? null
}

function titleWithSubtitle(title: unknown, subtitle: unknown) {
  const main = text(title, 255), sub = text(subtitle, 255)
  if (!main) return ''
  return (sub ? `${main}${/\p{P}$/u.test(main) ? ' ' : ': '}${sub}` : main).slice(0, 255)
}

function titleQueryOf(query: { title?: unknown; author?: unknown }) {
  const title = text(query.title, 1000), author = text(query.author, 1000)
  const errors: Record<string, string> = {}
  if ([...title].length < 2 || [...title].length > 200) errors.title = 'Enter a title of 2 to 200 characters.'
  if ([...author].length > 200) errors.author = 'Author must not exceed 200 characters.'
  if (Object.keys(errors).length) throw new HttpError(422, 'TITLE_LOOKUP_INVALID', Object.values(errors)[0], { errors })
  return { title, author }
}

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

  async function googleTitles(title: string, author: string): Promise<RawCandidate[]> {
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    const words = (value: string, prefix: string) => value.split(' ').filter(Boolean).map((word) => `${prefix}:${word}`)
    url.searchParams.set('q', [...words(title, 'intitle'), ...words(author, 'inauthor')].join(' '))
    url.searchParams.set('maxResults', String(TITLE_SEARCH_LIMIT))
    url.searchParams.set('printType', 'books')
    if (googleApiKey) url.searchParams.set('key', googleApiKey)
    const payload = await fetchJson(fetcher, url, timeoutMs) as { items?: Array<{ volumeInfo?: GoogleVolume['volumeInfo'] & { subtitle?: unknown } }> }
    return (Array.isArray(payload.items) ? payload.items : []).flatMap((item) => {
      const info = item?.volumeInfo
      const found = titleWithSubtitle(info?.title, info?.subtitle)
      if (!found) return []
      const ids = Array.isArray(info?.industryIdentifiers) ? info.industryIdentifiers as Array<{ identifier?: unknown } | null> : []
      return [{ title: found, author: joined(info?.authors, 255), publisher: text(info?.publisher, 255) || null, publicationYear: year(info?.publishedDate), isbn: bestIsbn(ids.map((id) => id?.identifier)) }]
    })
  }

  async function openLibraryTitles(title: string, author: string): Promise<RawCandidate[]> {
    const url = new URL('https://openlibrary.org/search.json')
    url.searchParams.set('title', title)
    if (author) url.searchParams.set('author', author)
    url.searchParams.set('fields', 'title,subtitle,author_name,publisher,first_publish_year,isbn')
    url.searchParams.set('limit', String(TITLE_SEARCH_LIMIT))
    const payload = await fetchJson(fetcher, url, timeoutMs) as { docs?: Array<OpenLibraryDocument & { subtitle?: unknown }> }
    return (Array.isArray(payload.docs) ? payload.docs : []).flatMap((doc) => {
      const found = titleWithSubtitle(doc?.title, doc?.subtitle)
      if (!found) return []
      const publisher = Array.isArray(doc.publisher) ? text(doc.publisher[0], 255) : text(doc.publisher, 255)
      return [{ title: found, author: joined(doc.author_name, 255), publisher: publisher || null, publicationYear: year(doc.first_publish_year), isbn: bestIsbn(Array.isArray(doc.isbn) ? doc.isbn : []) }]
    })
  }

  /** Reads one cover image; null unless it is a real JPEG, PNG or WebP within the cover size limit. */
  async function readCover(url: URL) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetcher(url, { headers: { Accept: 'image/jpeg,image/png,image/webp', 'User-Agent': 'STI-Ormoc-SmartLib/0.1' }, signal: controller.signal })
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (response.status !== 200 || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || Number(response.headers.get('content-length') ?? 0) > COVER_MAX_BYTES) {
        void response.body?.cancel().catch(() => undefined)
        return null
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      return bytes.length && bytes.length <= COVER_MAX_BYTES && coverSignatureMatches(contentType, bytes) ? { contentType, bytes } : null
    } finally { clearTimeout(timeout) }
  }

  async function openLibraryCover(isbn: string) {
    return readCover(new URL(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`))
  }

  async function googleCover(isbn: string) {
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    url.searchParams.set('q', `isbn:${isbn}`)
    url.searchParams.set('maxResults', '5')
    if (googleApiKey) url.searchParams.set('key', googleApiKey)
    const payload = await fetchJson(fetcher, url, timeoutMs) as { items?: Array<GoogleVolume & { volumeInfo?: { imageLinks?: { thumbnail?: unknown } } }> }
    const volume = (Array.isArray(payload.items) ? payload.items : []).find((item) => exactIsbn(item?.volumeInfo?.industryIdentifiers, isbn))
    const thumbnail = volume?.volumeInfo?.imageLinks?.thumbnail
    if (typeof thumbnail !== 'string') return null
    let image: URL
    try { image = new URL(thumbnail) } catch { return null }
    // Only Google's own cover host; never a URL that points anywhere else.
    if (image.hostname !== 'books.google.com' || image.username || image.password) return null
    image.protocol = 'https:'
    image.port = ''
    image.searchParams.delete('edge')
    return readCover(image)
  }

  return {
    /** The cover for an ISBN from Open Library or Google Books, for the add-book form to attach; saves nothing. */
    async cover(rawIsbn: unknown) {
      const validation = isbnValidationMessage(rawIsbn)
      if (validation) throw new HttpError(422, 'ISBN_INVALID', validation, { errors: { isbn: validation } })
      const isbn = normalizeIsbn(rawIsbn)
      for (const provider of googleApiKey ? [googleCover, openLibraryCover] : [openLibraryCover, googleCover]) {
        try {
          const found = await provider(isbn)
          if (found) return found
        } catch { /* try the next provider; a missing cover is never an error the form must show */ }
      }
      throw new HttpError(404, 'COVER_NOT_FOUND', 'No cover image was found for this ISBN.')
    },

    /** Searches outside catalogs by title (and author); saves nothing. */
    async searchTitles(query: { title?: unknown; author?: unknown }) {
      const { title, author } = titleQueryOf(query)
      const localMatches = await repository.findLocalByTitle(title)
      const providers: Array<[(t: string, a: string) => Promise<RawCandidate[]>, IsbnMetadata['source']]> = googleApiKey
        ? [[googleTitles, 'google_books'], [openLibraryTitles, 'open_library']]
        : [[openLibraryTitles, 'open_library'], [googleTitles, 'google_books']]
      let failures = 0
      for (const [provider, source] of providers) {
        let found: RawCandidate[]
        try { found = (await provider(title, author)).slice(0, TITLE_SEARCH_LIMIT) } catch { failures += 1; continue }
        if (!found.length) continue
        const inCatalog = await repository.findLocalIsbns(found.flatMap((candidate) => (candidate.isbn ? [candidate.isbn] : [])))
        return { source, localMatches, candidates: found.map((candidate) => ({ ...candidate, inCatalog: candidate.isbn !== null && inCatalog.has(candidate.isbn) })) }
      }
      if (failures === providers.length) throw new HttpError(503, 'TITLE_LOOKUP_UNAVAILABLE', 'Book search is temporarily unavailable. Enter the details manually or try again.')
      return { source: null, localMatches, candidates: [] as TitleCandidate[] }
    },

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
