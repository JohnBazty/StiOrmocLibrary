import { describe, expect, it } from 'vitest'
import { BORROWING_CLOSED, ENTRANCE_CHECK_IN, checkoutBlockerLines } from './checkout-blockers'

describe('checkout blocker copy', () => {
  it('explains a closed library first and treats check-in as the next step', () => {
    const lines = checkoutBlockerLines([ENTRANCE_CHECK_IN, BORROWING_CLOSED], 'Closed')
    expect(lines).toEqual([
      'The library is closed. Checkout can continue when it opens.',
      'This borrower has no check-in for today. Record it once borrowing is open, then confirm the handover.',
    ])
  })

  it('asks for check-in on its own when borrowing is open', () => {
    expect(checkoutBlockerLines([ENTRANCE_CHECK_IN])).toEqual([
      'This borrower has not checked in today. Check them in before handing over the book.',
    ])
  })

  it('keeps other restrictions and names a scheduled event', () => {
    expect(checkoutBlockerLines(['Return overdue books before borrowing another material.', BORROWING_CLOSED], 'Scheduled event')).toEqual([
      'A scheduled event has borrowing turned off until it ends.',
      'Return overdue books before borrowing another material.',
    ])
  })
})
