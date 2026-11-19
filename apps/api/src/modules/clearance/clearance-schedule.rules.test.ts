import assert from 'node:assert/strict'
import test from 'node:test'
import { applicableWindows, scheduleStatus, selectedWindow, studentClearanceGroup, validateSchedule, type ScheduleWindow } from './clearance-schedule.rules.ts'

const body = { termId: 1, version: 0, group: 'BSIT', startsAt: '2026-12-01T08:00:00+08:00', endsAt: '2026-12-03T17:00:00+08:00', requestKey: '8d0c12f9-473c-4bed-b76e-123456789012' }
test('schedule validation preserves Manila instants and rejects missing zones, invalid dates and inverted periods', () => {
  assert.equal(validateSchedule(body).startsAt, '2026-12-01T00:00:00.000Z')
  for (const change of [{ startsAt: '2026-12-01T08:00' }, { startsAt: '2026-02-30T08:00:00+08:00' }, { endsAt: body.startsAt }, { group: 'Staff' }, { requestKey: 'bad' }, { termId: true }, { version: -1 }]) {
    assert.throws(() => validateSchedule({ ...body, ...change }), (error: any) => error.code === 'SCHEDULE_INVALID')
  }
})
test('academic scope recognizes grades before program labels and leaves unknown profiles unclassified', () => {
  assert.equal(studentClearanceGroup('STEM', 'Grade 11'), 'Grade 11')
  assert.equal(studentClearanceGroup('ABM', 'G12'), 'Grade 12')
  assert.equal(studentClearanceGroup('Bachelor of Science in Hospitality Management', '2nd Year'), 'BSHM')
  assert.equal(studentClearanceGroup('BSTM', '4th'), 'BSTM')
  assert.equal(studentClearanceGroup('BSIT', 'Grade 11'), 'Grade 11')
  assert.equal(studentClearanceGroup('STEM', 'SHS'), null)
})
const window = (id: number, group: ScheduleWindow['group'], start: string, end: string): ScheduleWindow => ({ id, group, startsAt: start, endsAt: end, version: 1, status: 'Upcoming' })
test('group calendars override all-student periods and choose the open, next or last closed period', () => {
  const all = window(1, 'All', '2026-12-01T00:00:00Z', '2026-12-31T00:00:00Z')
  const first = window(2, 'BSIT', '2026-12-03T00:00:00Z', '2026-12-04T00:00:00Z')
  const second = window(3, 'BSIT', '2026-12-10T00:00:00Z', '2026-12-11T00:00:00Z')
  const selected = applicableWindows([all, second, first], 'BSIT')
  assert.deepEqual(selected.map(row => row.id), [2, 3])
  assert.equal(selectedWindow(selected, new Date(first.startsAt))?.id, 2)
  assert.equal(selectedWindow(selected, new Date(first.endsAt))?.id, 3)
  assert.equal(selectedWindow(selected, new Date('2027-01-01Z'))?.id, 3)
  assert.deepEqual(applicableWindows([all, first], 'BSHM'), [all])
  assert.deepEqual(applicableWindows([all, first], null), [all])
  assert.equal(scheduleStatus(first.startsAt, first.endsAt, new Date(first.endsAt)), 'Closed')
})
