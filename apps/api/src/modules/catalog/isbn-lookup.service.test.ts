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

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const titleRepository = (isbns: string[] = [], local: unknown[] = []) => ({
  findLocalByIsbn: async () => null,
  findLocalIsbns: async (list: string[]) => new Set(list.filter((isbn) => isbns.includes(isbn))),
  findLocalByTitle: async () => local,
}) as never

test('title lookup returns up to 10 candidates and marks ones already in the catalog', async () => {
  const urls: URL[] = []
  const service = createIsbnLookupService({
    repository: titleRepository([validIsbn], [{ titleId: 4, title: 'Clean Code', author: 'Robert C. Martin', isbn: validIsbn }]),
    googleApiKey: '',
    fetcher: (async (input) => {
      urls.push(new URL(String(input)))
      return json({ docs: [
        { title: 'Clean Code', subtitle: 'A Handbook of Agile Software Craftsmanship', author_name: ['Robert C. Martin'], publisher: ['Prentice Hall'], first_publish_year: 2008, isbn: ['0132350882', validIsbn] },
        { title: 'Clean Architecture', author_name: ['Robert C. Martin'], isbn: ['not-an-isbn'] },
        { author_name: ['No Title'] },
      ] })
    }) as typeof fetch,
  })
  const result = await service.searchTitles({ title: ' Clean  code ', author: 'Martin' })
  assert.equal(urls[0].hostname, 'openlibrary.org')
  assert.equal(urls[0].searchParams.get('title'), 'Clean code')
  assert.equal(urls[0].searchParams.get('author'), 'Martin')
  assert.equal(result.source, 'open_library')
  assert.deepEqual(result.candidates, [
    { title: 'Clean Code: A Handbook of Agile Software Craftsmanship', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, isbn: validIsbn, inCatalog: true },
    { title: 'Clean Architecture', author: 'Robert C. Martin', publisher: null, publicationYear: null, isbn: null, inCatalog: false },
  ])
  assert.equal(result.localMatches.length, 1)
})

test('title lookup builds a Google Books intitle/inauthor query when a key is set', async () => {
  let url: URL | null = null
  const service = createIsbnLookupService({
    repository: titleRepository(), googleApiKey: 'k',
    fetcher: (async (input) => { url = new URL(String(input)); return json({ items: [{ volumeInfo: { title: 'Clean Code', authors: ['Robert C. Martin'], publishedDate: '2008-08-01', industryIdentifiers: [{ type: 'ISBN_10', identifier: '0132350882' }, { type: 'ISBN_13', identifier: validIsbn }] } }] }) }) as typeof fetch,
  })
  const result = await service.searchTitles({ title: 'Clean Code', author: 'Martin' })
  assert.equal(url!.searchParams.get('q'), 'intitle:Clean intitle:Code inauthor:Martin')
  assert.equal(result.candidates[0].isbn, validIsbn)
  assert.equal(result.candidates[0].publicationYear, 2008)
})

test('title lookup refuses short or long input before any call, and reports both providers down', async () => {
  let calls = 0
  const down = createIsbnLookupService({ repository: titleRepository(), googleApiKey: '', fetcher: (async () => { calls += 1; throw new Error('offline') }) as typeof fetch })
  for (const query of [{ title: 'a' }, { title: 'x'.repeat(201) }, { title: 'Clean', author: 'y'.repeat(201) }, {}]) {
    await assert.rejects(down.searchTitles(query), (error: unknown) => error instanceof HttpError && error.status === 422)
  }
  assert.equal(calls, 0)
  await assert.rejects(down.searchTitles({ title: 'Clean Code' }), (error: unknown) => error instanceof HttpError && error.status === 503)
})
