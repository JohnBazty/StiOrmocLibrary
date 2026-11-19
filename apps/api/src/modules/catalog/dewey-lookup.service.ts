import { HttpError } from '../../core/http-error.ts'
import { isbnValidationMessage, normalizeIsbn } from './catalog.validation.ts'

export type DeweyCandidate = { code: string; source: 'open_library'; sourceUrl: string }
export type DeweyLookupResult = { isbn: string; status: 'matched' | 'multiple' | 'not_found' | 'unavailable'; candidates: DeweyCandidate[] }
export function deweyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim()
  return code.length <= 64 && /^\d{3}(\.\d+)?$/.test(code) ? code : null
}

export function createDeweyLookup(options: { fetcher?: typeof fetch; timeoutMs?: number; intervalMs?: number; clock?: () => number } = {}) {
  const fetcher = options.fetcher ?? fetch
  const now = options.clock ?? Date.now
  const cache = new Map<string, { expires: number; result: DeweyLookupResult }>()
  const pending = new Map<string, Promise<DeweyLookupResult>>()
  let nextStart = 0
  async function read(isbn: string): Promise<DeweyLookupResult> {
    const result: DeweyLookupResult = { isbn, status: 'not_found', candidates: [] }
    const delay = Math.max(0, nextStart - now())
    nextStart = Math.max(now(), nextStart) + (options.intervalMs ?? 1100)
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    try {
      const response = await fetcher(`https://openlibrary.org/isbn/${isbn}.json`, {
        headers: { Accept: 'application/json', 'User-Agent': 'STI-Ormoc-SmartLib/0.1' },
        signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      })
      if (response.status !== 404) {
        if (!response.ok) throw new Error('Dewey provider unavailable')
        const edition = await response.json() as Record<string, unknown>
        const identifiers = [...(Array.isArray(edition.isbn_10) ? edition.isbn_10 : []), ...(Array.isArray(edition.isbn_13) ? edition.isbn_13 : [])]
        if (identifiers.some(id => typeof id === 'string' && normalizeIsbn(id) === isbn)) {
          const codes = [...new Set((Array.isArray(edition.dewey_decimal_class) ? edition.dewey_decimal_class : []).map(deweyCode).filter((code): code is string => code !== null))]
          result.candidates = codes.map(code => ({ code, source: 'open_library', sourceUrl: `https://openlibrary.org/isbn/${isbn}` }))
          result.status = codes.length > 1 ? 'multiple' : codes.length === 1 ? 'matched' : 'not_found'
        }
      }
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!)
      cache.set(isbn, { expires: now() + 10 * 60 * 1000, result })
      return result
    } catch { return { ...result, status: 'unavailable', candidates: [] } }
  }
  return {
    async lookup(value: unknown): Promise<DeweyLookupResult> {
      const error = isbnValidationMessage(value)
      if (error) throw new HttpError(422, 'ISBN_INVALID', error)
      const isbn = normalizeIsbn(value)
      const cached = cache.get(isbn)
      if (cached && cached.expires > now()) return structuredClone(cached.result)
      if (!pending.has(isbn)) {
        if (pending.size >= 10) return { isbn, status: 'unavailable', candidates: [] }
        pending.set(isbn, read(isbn).finally(() => pending.delete(isbn)))
      }
      return structuredClone(await pending.get(isbn)!)
    },
  }
}
export const deweyLookup = createDeweyLookup()
