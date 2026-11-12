import assert from 'node:assert/strict'
import test from 'node:test'
import { PassThrough } from 'node:stream'
import type { Response } from 'express'
import { db } from '../../config/db.js'
import { exportStocktakeDiscrepanciesCsv, exportStocktakeDiscrepanciesPdf } from './stocktake-export.service.ts'

const filters = { page: 1, limit: 50, query: null, status: null, findingCode: null, assetKind: null }
const sessionRow = {
  stocktake_session_id: 3, session_name: 'S', scope_kind: 'shelf', scope_label: 'Shelf A', asset_kind: 'book', status: 'closed',
}

function fakeResponse() {
  const stream = new PassThrough() as PassThrough & { set: () => void; destroyedWith?: unknown }
  stream.set = () => {}
  const originalDestroy = stream.destroy.bind(stream)
  stream.destroy = ((error?: Error) => { stream.destroyedWith = error; return originalDestroy() }) as typeof stream.destroy
  return stream
}

function fakeDb(pages: Array<Record<string, unknown>[] | Error>) {
  let call = 0
  ;(db as unknown as { execute: unknown }).execute = async (sql: string) => {
    if (sql.includes('FROM stocktake_sessions')) return [[sessionRow]]
    if (sql.includes('COUNT(*) AS total')) return [[{ total: pages.length * 200 }]]
    const page = pages[Math.min(call, pages.length - 1)]
    call += 1
    if (page instanceof Error) throw page
    return [page]
  }
}

const row = (title: string) => ({
  stocktake_discrepancy_id: 1, finding_key: 'k', finding_code: 'missing', status: 'open', title, barcode: 'B1',
  created_at: '2026-11-12',
})

async function drain(stream: PassThrough) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

test('M1 CSV guards cells that start with a tab, carriage return or formula character', async () => {
  fakeDb([[row('\t=cmd'), row('\r=cmd'), row('=1+1'), row('safe')]])
  const response = fakeResponse()
  await exportStocktakeDiscrepanciesCsv(3, filters, response as unknown as Response)
  const body = await drain(response)
  assert.ok(body.includes('"\'\t=cmd"'))
  assert.ok(body.includes('"\'\r=cmd"'))
  assert.ok(body.includes('"\'=1+1"'))
  assert.ok(body.includes('"safe"'))
})

test('H3 a generator failure mid CSV stream destroys the response instead of crashing', async () => {
  fakeDb([[row('first')], new Error('database went away')])
  const response = fakeResponse()
  response.resume()
  const closed = new Promise((resolve) => response.once('close', resolve))
  await exportStocktakeDiscrepanciesCsv(3, filters, response as unknown as Response)
  await closed
  assert.match(String((response.destroyedWith as Error).message), /database went away/)
})

test('H3 a generator failure while building the PDF destroys the response instead of crashing', async () => {
  fakeDb([new Error('database went away')])
  const response = fakeResponse()
  const closed = new Promise((resolve) => response.once('close', resolve))
  await exportStocktakeDiscrepanciesPdf(3, filters, response as unknown as Response)
  await closed
  assert.match(String((response.destroyedWith as Error).message), /database went away/)
})
