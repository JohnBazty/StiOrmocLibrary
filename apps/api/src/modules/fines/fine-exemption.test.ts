import assert from 'node:assert/strict'
import test from 'node:test'
import { isFineExemptRole, isFineExemptUser } from './fine-exemption.ts'

test('only faculty are exempt from fines', async () => {
  assert.equal(isFineExemptRole('Faculty'), true)
  for (const role of ['Student', 'Staff', 'Librarian', undefined]) assert.equal(isFineExemptRole(role), false)
  const db = (role: string | null) => ({ execute: async () => [role ? [{ user_role: role }] : []] }) as never
  assert.equal(await isFineExemptUser(db('Faculty'), 5), true)
  assert.equal(await isFineExemptUser(db('Student'), 5), false)
  assert.equal(await isFineExemptUser(db(null), 5), false)
})
