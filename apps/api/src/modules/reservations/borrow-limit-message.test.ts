import assert from 'node:assert/strict'
import test from 'node:test'
import { borrowLimitMessage } from './book-request.service.ts'

test('borrowing limit message names the active loan and book request', () => {
  const message = borrowLimitMessage(2, { total: 2, loans: 1, requests: 1 }, 1)
  assert.equal(message, 'You have 1 active loan and 1 book request. That fills the limit of 2. Return a borrowed book or cancel a request, then try again.')
})

test('borrowing limit message explains a cart that would pass the remaining room', () => {
  const message = borrowLimitMessage(2, { total: 1, loans: 1, requests: 0 }, 2)
  assert.equal(message, 'You have 1 active loan. This cart has 2 books, which would make 3. The limit is 2. Remove a book from the cart or return a borrowed book, then try again.')
})
