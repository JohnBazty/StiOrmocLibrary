import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { createPasswordResetService } from './password-reset.service.ts'

test('requestReset always returns a generic message and emails deliverable student accounts', async () => {
  const writes: string[] = []
  let emailedTo = ''
  let emailedOtp = ''
  const database = {
    execute: async (sql: string) => {
      writes.push(sql)
      if (sql.includes('FROM accounts')) {
        return [[{
          account_id: 9,
          school_id: 'STI-2026-0009',
          password_hash: 'current-hash',
          user_id: 90,
          role: 'Student',
          account_status: 'Active',
          user_email: 'ada.lovelace@ormoc.sti.edu.ph',
        }]]
      }
      return [{}]
    },
  } as never
  const service = createPasswordResetService(
    database,
    { hash: async () => 'x', compare: async () => false } as never,
    jwt,
    {
      async sendOtpEmail(to, otp) {
        emailedTo = to
        emailedOtp = otp
        return true
      },
    },
  )

  const result = await service.requestReset({ school_id_or_email: 'STI-2026-0009' })
  assert.equal(result.message.includes('eligible student account'), true)
  assert.equal(emailedTo, 'ada.lovelace@ormoc.sti.edu.ph')
  assert.match(emailedOtp, /^\d{6}$/)
  assert.equal(writes.some((sql) => sql.includes('INSERT INTO password_reset_otps')), true)
})

test('requestReset skips synthetic account emails without leaking account existence', async () => {
  let mailCalls = 0
  const database = {
    execute: async (sql: string) => {
      if (sql.includes('FROM accounts')) {
        return [[{
          account_id: 3,
          school_id: 'STI-2026-0003',
          password_hash: 'current-hash',
          user_id: 30,
          role: 'Student',
          account_status: 'Active',
          user_email: 'account.3@ormoc.sti.edu.ph',
        }]]
      }
      return [{}]
    },
  } as never
  const service = createPasswordResetService(
    database,
    { hash: async () => 'x', compare: async () => false } as never,
    jwt,
    { async sendOtpEmail() { mailCalls += 1; return true } },
  )

  const result = await service.requestReset({ school_id_or_email: 'STI-2026-0003' })
  assert.equal(mailCalls, 0)
  assert.equal(result.message.includes('eligible student account'), true)
})

test('verifyOtp locks after three failed attempts', async () => {
  let failedAttempts = 2
  const database = {
    execute: async (sql: string, values?: unknown[]) => {
      if (sql.includes('FROM accounts')) {
        return [[{
          account_id: 4,
          school_id: 'STI-2026-0004',
          password_hash: 'current-hash',
          user_id: 40,
          role: 'Student',
          account_status: 'Active',
          user_email: 'student@ormoc.sti.edu.ph',
        }]]
      }
      if (sql.includes('FROM password_reset_otps')) {
        return [[{
          otp_id: 11,
          otp_hash: 'not-matching',
          expires_at: new Date(Date.now() + 60_000),
          failed_attempts: failedAttempts,
          locked_until: null,
          consumed_at: null,
        }]]
      }
      if (sql.includes('UPDATE password_reset_otps')) {
        failedAttempts = Number(values?.[0])
        return [{}]
      }
      return [{}]
    },
  } as never
  const service = createPasswordResetService(
    database,
    { hash: async () => 'x', compare: async () => false } as never,
    jwt,
    { async sendOtpEmail() { return false } },
  )

  await assert.rejects(
    service.verifyOtp({ school_id_or_email: 'STI-2026-0004', otp: '123456' }),
    (error: unknown) => error instanceof HttpError && error.status === 429 && error.code === 'RESET_CODE_LOCKED',
  )
})

test('confirmReset rejects reused passwords and updates when the password is new', async () => {
  const writes: string[] = []
  let committed = false
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string) => {
      writes.push(sql)
      if (sql.includes('SELECT history_id')) return [[{ history_id: 1 }]]
      return [{}]
    },
    commit: async () => { committed = true },
    rollback: async () => undefined,
    release: () => undefined,
  }
  const database = {
    execute: async (sql: string) => {
      if (sql.includes('FROM accounts')) {
        return [[{
          account_id: 8,
          user_id: 80,
          password_hash: 'current-hash',
          role: 'Student',
          account_status: 'Active',
        }]]
      }
      if (sql.includes('FROM account_password_history')) return [[]]
      return [{}]
    },
    getConnection: async () => connection,
  } as never

  const reusedService = createPasswordResetService(
    database,
    { hash: async () => 'next-hash', compare: async () => true } as never,
    jwt,
    { async sendOtpEmail() { return false } },
  )
  const resetToken = jwt.sign(
    { purpose: 'password_reset', accountId: 8, otpId: 1, schoolId: 'STI-2026-0008' },
    env.jwt.secret,
    { algorithm: 'HS256', expiresIn: 600, issuer: env.jwt.issuer, audience: env.jwt.audience, subject: '8' },
  )
  await assert.rejects(
    reusedService.confirmReset({ reset_token: resetToken, new_password: 'OldPassword1', confirm_password: 'OldPassword1' }),
    (error: unknown) => error instanceof HttpError && error.code === 'PASSWORD_REUSED',
  )

  const service = createPasswordResetService(
    database,
    { hash: async () => 'next-hash', compare: async () => false } as never,
    jwt,
    { async sendOtpEmail() { return false } },
  )
  const result = await service.confirmReset({
    reset_token: resetToken,
    new_password: 'BrandNewPass1',
    confirm_password: 'BrandNewPass1',
  })
  assert.equal(result.message, 'Password updated successfully.')
  assert.equal(committed, true)
  assert.equal(writes.some((sql) => sql.includes('UPDATE accounts')), true)
})
