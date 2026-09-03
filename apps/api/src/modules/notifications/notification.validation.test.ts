import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAnnouncement } from './notification.validation.ts'

test('announcement validates priority and content', () => {
  assert.throws(() => validateAnnouncement({ title: 'Hi', body: 'No', priority: 'Normal' }), /correct the announcement fields/i)
  const result = validateAnnouncement({ title: 'Library schedule', body: 'The library closes at 4:00 PM today.', priority: 'Important' })
  assert.equal(result.priority, 'Important')
  assert.equal(result.title, 'Library schedule')
})

test('announcement expiration must follow its publication time', () => {
  assert.throws(() => validateAnnouncement({
    title: 'Schedule notice', body: 'This is a scheduled campus notice.', priority: 'Normal',
    publishAt: '2026-09-03T10:00:00+08:00', expiresAt: '2026-09-03T09:00:00+08:00',
  }), /correct the announcement fields/i)
})
