import assert from 'node:assert/strict'
import test from 'node:test'
import { checkoutWindowBlocker, policyDueDate, requireLoanSlot } from './desk-circulation.policy.ts'

const policy = { checkout_opens_at: '14:00:00' }
const at = (time: string) => new Date(`2026-11-23T${time}+08:00`)

test('checkout before the opening time is refused with the time in the message', () => {
  assert.equal(checkoutWindowBlocker(at('13:59:00'), policy, 'TakeHome'), 'Checkout opens at 2:00 PM. You can read this book inside the library now.')
})

test('checkout from the opening time is allowed', () => {
  assert.equal(checkoutWindowBlocker(at('14:00:00'), policy, 'TakeHome'), null)
  assert.equal(checkoutWindowBlocker(at('16:30:00'), policy, 'TakeHome'), null)
})

test('in-library reading and online requests are not limited by the checkout time', () => {
  assert.equal(checkoutWindowBlocker(at('10:00:00'), policy, 'InLibrary'), null)
  assert.equal(checkoutWindowBlocker(at('10:00:00'), policy, 'Online'), null)
})

test('a policy row without the column uses 14:00', () => {
  assert.notEqual(checkoutWindowBlocker(at('13:00:00'), {}, 'TakeHome'), null)
  assert.equal(checkoutWindowBlocker(at('14:00:00'), {}, 'TakeHome'), null)
})

test('the configured time is used', () => {
  assert.equal(checkoutWindowBlocker(at('09:30:00'), { checkout_opens_at: '09:00:00' }, 'TakeHome'), null)
  assert.match(String(checkoutWindowBlocker(at('08:30:00'), { checkout_opens_at: '09:00:00' }, 'TakeHome')), /9:00 AM/)
})

test('policy due date uses the policy due time on the next open day', async () => {
  const q = { async execute(sql: string) {
    if (sql.includes('library_operating_schedule')) return [[1, 2, 3, 4, 5, 6].map((day) => ({ day_of_week: day, is_open: 1 })).concat({ day_of_week: 7, is_open: 0 })]
    if (sql.includes('library_closed_days')) return [[]]
    throw new Error(sql)
  } } as never
  const due = await policyDueDate(q, new Date('2026-11-21T15:10:00+08:00'), { borrowing_days: 1, due_time_cutoff: '08:00:00' } as never)
  assert.equal(due.toISOString(), '2026-11-23T00:00:00.000Z', 'Saturday 15:10 is due Monday 08:00 Manila')
})

test('the loan slot check refuses a sixth commitment when the faculty limit is 5', async () => {
  const withCommitments = (count: number) => ({ async execute() { return [[{ commitments: count }]] } }) as never
  await assert.rejects(requireLoanSlot(withCommitments(5), 9, 20, 5), /limit is 5/)
  await requireLoanSlot(withCommitments(4), 9, 20, 5)
  await requireLoanSlot(withCommitments(50), 9, 20, null)
})
