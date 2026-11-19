import { expect, it } from 'vitest'
import { formatLoanDate, loanOverdueLabel } from './loan-time'

it('formats a UTC instant on its correct Manila calendar date', () => {
  const text = formatLoanDate('2026-11-15T16:05:00Z')
  expect(text).toContain('Nov 16, 2026')
  expect(text).toContain('12:05 AM')
  expect(formatLoanDate('2026-11-16 00:05:00')).toBe(text)
  expect(formatLoanDate('2026-11-16T00:05:00+08:00')).toBe(text)
})
it('counts a new Manila calendar day without waiting an extra 24 hours', () => {
  expect(loanOverdueLabel('2026-11-15T23:59:00+08:00', '2026-11-16T00:01:00+08:00')).toBe('1 calendar day past due')
  expect(loanOverdueLabel('2026-11-15T15:00:00+08:00', '2026-11-16T14:00:00+08:00')).toBe('1 calendar day past due')
  expect(loanOverdueLabel('2026-11-15T23:59:00+08:00', '2026-11-17T00:01:00+08:00')).toBe('2 calendar days past due')
})
it('uses hours or minutes for same-day lateness and never marks an on-time or future loan late', () => {
  const due = '2026-11-16T08:00:00+08:00'
  expect(loanOverdueLabel(due, '2026-11-16T10:01:00+08:00')).toBe('2 hours past due')
  expect(loanOverdueLabel(due, '2026-11-16T08:01:00+08:00')).toBe('1 minute past due')
  expect(loanOverdueLabel(due, '2026-11-16T08:00:01+08:00')).toBe('Less than a minute past due')
  expect(loanOverdueLabel(due, due)).toBeNull()
  expect(loanOverdueLabel(due, '2026-11-15T08:00:00+08:00')).toBeNull()
})
it('handles month, year and leap-day boundaries using the supplied server clock', () => {
  expect(loanOverdueLabel('2026-12-31T23:00:00+08:00', '2027-01-01T01:00:00+08:00')).toBe('1 calendar day past due')
  expect(loanOverdueLabel('2028-02-28T23:00:00+08:00', '2028-03-01T01:00:00+08:00')).toBe('2 calendar days past due')
  expect(loanOverdueLabel('2026-11-15 23:59:00', '2026-11-15T16:01:00Z')).toBe('1 calendar day past due')
})
it('keeps absent or invalid dates readable without fabricated lateness', () => {
  expect(formatLoanDate(null)).toBe('—')
  expect(formatLoanDate(null, 'Unavailable')).toBe('Unavailable')
  expect(formatLoanDate('invalid')).toBe('invalid')
  expect(loanOverdueLabel('invalid')).toBeNull()
})
