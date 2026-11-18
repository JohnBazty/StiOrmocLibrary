import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import { inventoryActor } from './inventory-actor.ts'

test('T2 a JWT-only Librarian is recorded by label with no user id', () => {
  const response = { locals: { authenticatedUser: { id: 7, role: 'Librarian', fullName: 'Lib Rarian' } } } as unknown as Response
  assert.deepEqual(inventoryActor({} as Request, response), { userId: null, label: 'Lib Rarian' })
})
