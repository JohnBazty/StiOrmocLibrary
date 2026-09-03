import assert from 'node:assert/strict'
import test from 'node:test'
import { nextOperatingDueDate } from './due-date.ts'

test('next operating due date is fixed at 8:59 AM and skips Sunday', () => {
  const saturday = new Date(2026, 7, 22, 15, 30)
  const due = nextOperatingDueDate(saturday)
  assert.equal(due.getDay(), 1)
  assert.equal(due.getHours(), 8)
  assert.equal(due.getMinutes(), 59)
})

test('configured campus closure rolls the due date to the following operating day', () => {
  const monday = new Date(2026, 7, 24, 10, 0)
  const due = nextOperatingDueDate(monday, new Set(['2026-08-25']))
  assert.equal(due.getDate(), 26)
  assert.equal(due.getHours(), 8)
  assert.equal(due.getMinutes(), 59)
})
