import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import pg from 'pg'
import { handlePgConnectionErrors } from '../config/pg-pool.js'

test('an idle connection error does not terminate the API process', () => {
  const pool = new EventEmitter()
  let reports = 0
  handlePgConnectionErrors(pool, () => { reports++ })
  assert.doesNotThrow(() => pool.emit('error', new Error('Connection terminated unexpectedly')))
  assert.equal(reports, 1)
})

test('a checked-out pg client disconnect still rejects its query without an unhandled error event', async () => {
  const pool = new EventEmitter()
  let reports = 0
  handlePgConnectionErrors(pool, () => { reports++ })
  // Queue a query on a real pg Client without opening a network connection.
  // The dependency's disconnect handler rejects the query and emits the same
  // Client error seen in the local crash log.
  const client = new pg.Client()
  pool.emit('connect', client)
  const rejected = assert.rejects(client.query('SELECT 1'), /Connection terminated unexpectedly/)
  const disconnectedClient = client as unknown as { _handleErrorEvent(error: Error): void }
  assert.doesNotThrow(() => disconnectedClient._handleErrorEvent(new Error('Connection terminated unexpectedly')))
  await rejected
  assert.equal(reports, 1)
})

test('client/pool reporting is deduplicated and replacement clients are covered', () => {
  const pool = new EventEmitter()
  let reports = 0
  handlePgConnectionErrors(pool, () => { reports++ })
  const client = new EventEmitter()
  pool.emit('connect', client)
  const error = new Error('Disconnected')
  client.emit('error', error)
  pool.emit('error', error)
  assert.equal(reports, 1)
  const replacement = new EventEmitter()
  pool.emit('connect', replacement)
  assert.doesNotThrow(() => replacement.emit('error', new Error('Disconnected again')))
  assert.equal(reports, 2)
})
