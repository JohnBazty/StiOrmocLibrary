import assert from 'node:assert/strict'
import test from 'node:test'
import { createDeweyLookup, deweyCode } from './dewey-lookup.service.ts'

const isbn = '9780132350884'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
test('Dewey codes preserve zeroes and precision and reject nonstandard text', () => {
  assert.equal(deweyCode(' 005.100 '), '005.100')
  for (const value of [5.1, '5.1', '005.', '005/1', '005.1 MAR', '', '0000']) assert.equal(deweyCode(value), null)
})
test('exact edition lookup deduplicates valid candidates and coalesces/cache requests', async () => {
  let calls = 0
  const lookup = createDeweyLookup({ intervalMs: 0, fetcher: (async (url) => {
    calls++; assert.equal(String(url), `https://openlibrary.org/isbn/${isbn}.json`)
    return json({ key: '/books/OL1M', isbn_13: [isbn], dewey_decimal_class: ['005.100', '005.100', 5, 'bad', '005.1'] })
  }) as typeof fetch })
  const [first, second] = await Promise.all([lookup.lookup(isbn), lookup.lookup(isbn)])
  assert.deepEqual(first, second)
  assert.equal(first.status, 'multiple')
  assert.deepEqual(first.candidates.map(c => c.code), ['005.100', '005.1'])
  await lookup.lookup(isbn); assert.equal(calls, 1)
})
test('wrong edition, missing classification and absent ISBN do not invent numbers', async () => {
  for (const payload of [{ isbn_13: ['9780062638502'], dewey_decimal_class: ['005.1'] }, { isbn_13: [isbn] }]) {
    const service = createDeweyLookup({ intervalMs: 0, fetcher: (async () => json(payload)) as typeof fetch })
    assert.equal((await service.lookup(isbn)).status, 'not_found')
  }
  const service = createDeweyLookup({ intervalMs: 0, fetcher: (async () => json({}, 404)) as typeof fetch })
  assert.equal((await service.lookup(isbn)).status, 'not_found')
  await assert.rejects(service.lookup('bad'), { code: 'ISBN_INVALID' })
})
test('provider failures remain retryable and differ from no match', async () => {
  let calls = 0
  const service = createDeweyLookup({ intervalMs: 0, fetcher: (async () => { calls++; return json({}, 429) }) as typeof fetch })
  assert.equal((await service.lookup(isbn)).status, 'unavailable')
  await service.lookup(isbn); assert.equal(calls, 2)
})
test('a timed-out provider releases the request so a retry can succeed', async () => {
  let calls = 0
  const service = createDeweyLookup({ intervalMs:0,timeoutMs:10,fetcher:(async (_url,init)=>{
    if (++calls>1) return json({isbn_13:[isbn],dewey_decimal_class:['005.1']})
    return new Promise((_resolve,reject)=>{
      init!.signal!.addEventListener('abort',()=>reject(new Error('timeout')),{once:true})
      // Keep the test process alive while AbortSignal.timeout's unref timer runs.
      const timer=setTimeout(()=>reject(new Error('timeout failed')),100)
      init!.signal!.addEventListener('abort',()=>clearTimeout(timer),{once:true})
    })
  }) as typeof fetch })
  assert.equal((await service.lookup(isbn)).status,'unavailable')
  assert.equal((await service.lookup(isbn)).status,'matched')
})
