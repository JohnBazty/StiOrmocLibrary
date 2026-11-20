import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { deskWindowMessage } from './borrowing-windows.ts'
import { validatePublishBorrowingPolicy } from './borrowing-policy.validation.ts'

const body = {
  effectiveOn: '2026-12-01', studentMaxActiveBooks: 2, facultyMaxActiveBooks: null, borrowingDays: 1,
  dueTimeCutoff: '08:59', maxRenewals: 1, renewalExtensionDays: 1, studentMaxActiveReservations: 2,
  facultyMaxActiveReservations: null, blockRenewalIfOverdue: true, blockRenewalIfUnpaidFines: true,
  blockRenewalIfReserved: true, longOverdueAfterDays: 14, changeReason: 'Desk hours changed this term.',
  materialRules: [{ materialType: 'Book', isBorrowable: true }, { materialType: 'Thesis/Manuscript', isBorrowable: false }],
}

test('borrowing and returning windows are optional 12-hour times, both ends or neither', () => {
  const none = validatePublishBorrowingPolicy(body)
  assert.deepEqual([none.borrowOpensAt, none.borrowClosesAt, none.returnOpensAt, none.returnClosesAt], [null, null, null, null])
  const timed = validatePublishBorrowingPolicy({ ...body, borrowOpensAt: '8:00 AM', borrowClosesAt: '4:30 PM', returnOpensAt: '7:30 AM', returnClosesAt: '5:00 PM' })
  assert.deepEqual([timed.borrowOpensAt, timed.borrowClosesAt, timed.returnOpensAt, timed.returnClosesAt], ['08:00', '16:30', '07:30', '17:00'])
  const fails = (patch: Record<string, unknown>) => assert.throws(() => validatePublishBorrowingPolicy({ ...body, ...patch }), (error: unknown) => error instanceof HttpError && !/1[3-9]:|2[0-3]:/.test(error.message))
  fails({ borrowOpensAt: '8:00 AM' })
  fails({ returnOpensAt: '5:00 PM', returnClosesAt: '7:30 AM' })
  fails({ borrowOpensAt: '25:00', borrowClosesAt: '4:00 PM' })
})

test('the desk explains a closed window in 12-hour time, and an unset window never blocks', () => {
  const at = (time: string) => new Date(`2026-11-18T${time}:00+08:00`)
  assert.equal(deskWindowMessage('Borrowing', '08:00:00', '16:30:00', at('16:30')), 'Borrowing is allowed from 8:00 AM to 4:30 PM.')
  assert.equal(deskWindowMessage('Borrowing', '08:00:00', '16:30:00', at('07:59')), 'Borrowing is allowed from 8:00 AM to 4:30 PM.')
  assert.equal(deskWindowMessage('Borrowing', '08:00:00', '16:30:00', at('08:00')), null)
  assert.equal(deskWindowMessage('Returning', null, null, at('23:00')), null)
})

test('the desk refuses a return outside the returning window and allows it inside', async () => {
  const { requireReturnWindow } = await import('./desk-circulation.policy.ts')
  const q = { execute: async () => [[{ borrowing_policy_version_id: 1, return_opens_at: '07:30:00', return_closes_at: '17:00:00' }]] } as never
  await assert.rejects(requireReturnWindow(q, new Date('2026-11-18T17:05:00+08:00')), (error: unknown) => error instanceof HttpError && error.code === 'RETURN_OUTSIDE_HOURS' && error.message === 'Returning is allowed from 7:30 AM to 5:00 PM.')
  await requireReturnWindow(q, new Date('2026-11-18T09:00:00+08:00'))
})
