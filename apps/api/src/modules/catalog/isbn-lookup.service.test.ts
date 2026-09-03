import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { createIsbnLookupService } from './isbn-lookup.service.ts'

const validIsbn = '9780132350884'

test('returns the existing SmartLib title before calling an external provider', async () => {
  let fetchCalls = 0
  const service = createIsbnLookupService({
    repository: { findLocalByIsbn: async () => ({ isbn: validIsbn, title: 'Clean Code', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, source: 'local_catalog' as const }) } as never,
    fetcher: (async () => { fetchCalls += 1; throw new Error('should not run') }) as typeof fetch,
  })
  const result = await service.lookup(validIsbn)
  assert.equal(result.source, 'local_catalog')
  assert.equal(result.title, 'Clean Code')
  assert.equal(fetchCalls, 0)
})

test('maps exact Google Books ISBN metadata into the four autofill fields', async () => {
  const service = createIsbnLookupService({
    repository: { findLocalByIsbn: async () => null } as never,
    googleApiKey: 'configured-test-key',
    fetcher: (async () => new Response(JSON.stringify({ items: [{ volumeInfo: { title: 'Clean Code', authors: ['Robert C. Martin'], publisher: 'Prentice Hall', publishedDate: '2008-08-01', industryIdentifiers: [{ type: 'ISBN_13', identifier: validIsbn }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
  })
  const result = await service.lookup(validIsbn)
  assert.deepEqual(result, { isbn: validIsbn, title: 'Clean Code', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, source: 'google_books' })
})

test('uses Open Library first when no Google Books API key is configured', async () => {
  const requestedHosts: string[] = []
  const service = createIsbnLookupService({
    repository: { findLocalByIsbn: async () => null } as never,
    googleApiKey: '',
    fetcher: (async (input) => {
      const url = new URL(String(input))
      requestedHosts.push(url.hostname)
      return new Response(JSON.stringify({ docs: [{ title: 'Clean Code', author_name: ['Robert C. Martin'], publisher: ['Prentice Hall'], first_publish_year: 2008, isbn: [validIsbn] }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch,
  })

  const result = await service.lookup(validIsbn)
  assert.equal(result.source, 'open_library')
  assert.deepEqual(requestedHosts, ['openlibrary.org'])
})

test('rejects an invalid ISBN before database or provider lookup', async () => {
  let repositoryCalls = 0
  const service = createIsbnLookupService({ repository: { findLocalByIsbn: async () => { repositoryCalls += 1; return null } } as never })
  await assert.rejects(() => service.lookup('9780062638500'), (error: unknown) => error instanceof HttpError && error.status === 422 && error.code === 'ISBN_INVALID')
  assert.equal(repositoryCalls, 0)
})
