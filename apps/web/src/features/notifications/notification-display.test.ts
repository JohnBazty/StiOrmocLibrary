import { describe, expect, it } from 'vitest'
import { formatNotificationDate } from './notification-display'

describe('formatNotificationDate', () => {
  it('always shows campus (Manila) time, whatever the device time zone', () => {
    // 02:26 UTC is 10:26 AM in Manila.
    expect(formatNotificationDate('2026-11-20T02:26:00.000Z')).toBe('Nov 20, 2026, 10:26 AM')
  })
  it('keeps text it cannot read as a date', () => {
    expect(formatNotificationDate('soon')).toBe('soon')
  })
})
