import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import {
  parseCancelBody,
  parsePagedQuery,
  parseCreateStocktakeBody,
  parseResolveBody,
  parseScanBody,
} from './stocktake.validation.ts'

test('create body requires name, scope, and asset kind', () => {
  assert.throws(
    () => parseCreateStocktakeBody({ scopeKind: 'shelf', scopeId: '1', assetKind: 'book' }),
    (error: unknown) => error instanceof HttpError && error.code === 'STOCKTAKE_VALIDATION_FAILED',
  )
  assert.throws(
    () => parseCreateStocktakeBody({ name: 'Count', scopeKind: 'shelf', assetKind: 'book' }),
    (error: unknown) => error instanceof HttpError && error.message.includes('scopeId'),
  )
  const collection = parseCreateStocktakeBody({
    name: 'Whole library',
    scopeKind: 'collection',
    assetKind: 'both',
  })
  assert.equal(collection.scopeId, null)
  assert.equal(collection.assetKind, 'both')
})

test('scan body normalizes barcode and requires observed shelf', () => {
  assert.throws(
    () => parseScanBody({ requestKey: 'k1', barcode: '  bc-1  ' }),
    (error: unknown) => error instanceof HttpError && error.message.includes('observedShelfId'),
  )
  const scan = parseScanBody({
    requestKey: 'k1',
    barcode: '  bc-1  ',
    observedShelfId: 3,
    source: 'manual',
  })
  assert.equal(scan.barcode, 'BC-1')
  assert.equal(scan.observedShelfId, 3)
  assert.equal(scan.source, 'manual')
})

test('cancel and resolve bodies require reasons and supported actions', () => {
  assert.throws(
    () => parseCancelBody({}),
    (error: unknown) => error instanceof HttpError && error.message.includes('reason'),
  )
  assert.equal(parseCancelBody({ reason: 'Stopped early' }).reason, 'Stopped early')
  assert.throws(
    () => parseResolveBody({ expectedRowVersion: 1, action: 'delete', reason: 'nope' }),
    (error: unknown) => error instanceof HttpError && error.message.includes('Unsupported'),
  )
  const resolve = parseResolveBody({
    expectedRowVersion: 2,
    action: 'dismiss',
    reason: 'Already returned to shelf',
  })
  assert.equal(resolve.action, 'dismiss')
  assert.equal(resolve.expectedRowVersion, 2)
})

test('paged query rejects an oversized page and search text', () => {
  assert.equal(parsePagedQuery({ page: '10000', q: 'x'.repeat(100) }).page, 10000)
  for (const query of [{ page: '10001' }, { q: 'x'.repeat(101) }]) {
    assert.throws(() => parsePagedQuery(query), (error: unknown) => (
      error instanceof HttpError && error.status === 422 && error.code === 'STOCKTAKE_VALIDATION_FAILED'
    ))
  }
})
