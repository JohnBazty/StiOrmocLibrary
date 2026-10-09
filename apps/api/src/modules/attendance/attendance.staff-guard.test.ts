import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { createAttendanceService } from './attendance.service.ts'

const stubPool = {
  execute: async () => [[]],
  getConnection: async () => ({
    beginTransaction: async () => undefined,
    execute: async () => [[]],
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }),
} as never

test('Student cannot check in through the attendance service', async () => {
  const service = createAttendanceService(stubPool)
  await assert.rejects(
    () => service.checkIn({ accountId: 3, role: 'Student' }, { qrPayload: 'x', purpose: 'Study', requestId: 'req-1' }),
    (error: unknown) => error instanceof HttpError && error.status === 403 && error.code === 'ATTENDANCE_STAFF_ONLY',
  )
})

test('Student cannot check out through the attendance service', async () => {
  const service = createAttendanceService(stubPool)
  await assert.rejects(
    () => service.checkOut({ accountId: 3, role: 'Student' }, { qrPayload: 'x', requestId: 'req-1' }),
    (error: unknown) => error instanceof HttpError && error.status === 403 && error.code === 'ATTENDANCE_STAFF_ONLY',
  )
})

test('Student cannot resolve a visitor pass or read capacity', async () => {
  const service = createAttendanceService(stubPool)
  await assert.rejects(
    () => service.resolve({ accountId: 3, role: 'Student' }, {}),
    (error: unknown) => error instanceof HttpError && error.status === 403 && error.code === 'ATTENDANCE_STAFF_ONLY',
  )
  await assert.rejects(
    () => service.capacity({ accountId: 3, role: 'Student' }),
    (error: unknown) => error instanceof HttpError && error.status === 403 && error.code === 'ATTENDANCE_STAFF_ONLY',
  )
})

test('Student cannot update capacity through the attendance service', async () => {
  const service = createAttendanceService(stubPool)
  await assert.rejects(
    () => service.updateCapacity({ accountId: 3, role: 'Student' }, { capacity: 90, reason: 'Expansion for exam week capacity planning.' }),
    (error: unknown) => error instanceof HttpError && error.status === 403 && error.code === 'ATTENDANCE_STAFF_ONLY',
  )
})
