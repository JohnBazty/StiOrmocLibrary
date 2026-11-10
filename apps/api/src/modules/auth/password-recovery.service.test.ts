import assert from 'node:assert/strict'
import test from 'node:test'
import { createPasswordRecoveryService } from './password-recovery.service.ts'
import { HttpError } from '../../core/http-error.ts'

function fixture(deliveryFails = false) {
  const state = { challenge: null as Record<string, any> | null, version: 1, linkedVersion: 1, password: 'hash:OldPassword1', linkedPassword: 'hash:OldPassword1', commits: 0, rollbacks: 0, delivered: [] as string[] }
  let clock = Date.now()
  const account = () => ({ account_id: 1, user_id: 10, email: 'fixture@ormoc.sti.edu.ph', password_hash: state.password, auth_version: state.version })
  const execute = async (sql: string, values: any[] = []) => {
    if (sql.includes('FROM accounts a JOIN users')) return [values.includes('UNKNOWN') || values.includes(999) ? [] : [account()]]
    if (sql.startsWith('SELECT account_id FROM account_recovery')) return [state.challenge?.public_id === values[0] ? [{ account_id: 1 }] : []]
    if (sql.startsWith('SELECT * FROM account_recovery')) return [state.challenge && (values.length === 1 || state.challenge.public_id === values[1]) ? [state.challenge] : []]
    if (sql.startsWith('INSERT INTO account_recovery')) {
      state.challenge = { account_id: values[0], public_id: values[1], account_version: values[2], code_hash: values[3], code_expires_at: values[4], code_sent_at: values[5], code_attempts: values[6], locked_until: null, reset_token_hash: null, reset_expires_at: null }
    } else if (sql.includes('SET code_attempts=?')) {
      Object.assign(state.challenge!, { code_attempts: values[0], locked_until: values[1] })
    } else if (sql.includes('SET code_hash=NULL,reset_token_hash=?')) {
      Object.assign(state.challenge!, { code_hash: null, reset_token_hash: values[0], reset_expires_at: values[1] })
    } else if (sql.includes('SET code_hash=NULL,reset_token_hash=NULL')) {
      Object.assign(state.challenge!, { code_hash: null, reset_token_hash: null, reset_expires_at: null, code_attempts: 0, locked_until: null })
    } else if (sql.startsWith('UPDATE accounts')) { state.password = values[0]; state.version++ }
    else if (sql.startsWith('UPDATE users')) { state.linkedPassword = values[0]; state.linkedVersion++ }
    else if (sql.includes('SET code_hash=NULL WHERE public_id')) state.challenge!.code_hash = null
    return [{ affectedRows: 1 }]
  }
  const connection = { execute, beginTransaction: async () => undefined, commit: async () => { state.commits++ }, rollback: async () => { state.rollbacks++ }, release: () => undefined }
  const service = createPasswordRecoveryService({ execute, getConnection: async () => connection } as never,
    async (_email, code) => { if (deliveryFails) throw new Error('provider failed'); state.delivered.push(code) },
    { compare: async (value: string, hash: string) => hash === `hash:${value}`, hash: async (value: string) => `hash:${value}` } as never,
    () => clock, () => '123456')
  return { state, service, advance: (milliseconds: number) => { clock += milliseconds } }
}
const code = (expected: string) => (error: unknown) => error instanceof HttpError && error.code === expected

test('recovery uses hashed, single-use codes/tokens and synchronizes password/session versions', async () => {
  const { service, state } = fixture()
  const requested = await service.request({ identifier: 'STUDENT-1' })
  assert.notEqual(state.challenge?.code_hash, '123456')
  assert.equal(state.delivered.length, 1)
  const verified = await service.verify({ challenge_id: requested.challengeId, code: '123456' })
  assert.notEqual(state.challenge?.reset_token_hash, verified.resetToken)
  await assert.rejects(service.verify({ challenge_id: requested.challengeId, code: '123456' }), code('RECOVERY_CODE_INVALID'))
  const reset = { challenge_id: requested.challengeId, reset_token: verified.resetToken, password: 'NewPassword2', confirm_password: 'NewPassword2' }
  await service.reset(reset)
  assert.equal(state.password, state.linkedPassword)
  assert.equal(state.version, 2); assert.equal(state.linkedVersion, 2)
  await assert.rejects(service.reset(reset), code('RECOVERY_TOKEN_INVALID'))
})

test('three wrong codes persist a lock; resend/start again cannot erase attempts or bypass it', async () => {
  const f = fixture()
  let request = await f.service.request({ identifier: 'STUDENT-1' })
  await assert.rejects(f.service.verify({ challenge_id: request.challengeId, code: '000000' }), code('RECOVERY_CODE_INVALID'))
  f.advance(61_000)
  request = await f.service.request({ identifier: 'STUDENT-1' })
  assert.equal(f.state.challenge?.code_attempts, 1)
  await assert.rejects(f.service.verify({ challenge_id: request.challengeId, code: '000000' }), code('RECOVERY_CODE_INVALID'))
  await assert.rejects(f.service.verify({ challenge_id: request.challengeId, code: '000000' }), code('RECOVERY_LOCKED'))
  assert.equal(f.state.challenge?.code_attempts, 3)
  assert.equal(f.state.rollbacks, 0)
  f.advance(61_000)
  await f.service.request({ identifier: 'STUDENT-1' })
  assert.equal(f.state.delivered.length, 2)
  await assert.rejects(f.service.verify({ challenge_id: request.challengeId, code: '123456' }), code('RECOVERY_LOCKED'))
  f.advance(15 * 60_000)
  request = await f.service.request({ identifier: 'STUDENT-1' })
  assert.equal(f.state.challenge?.code_attempts, 0)
  await f.service.verify({ challenge_id: request.challengeId, code: '123456' })
})

test('expired codes, expired reset tokens, malformed IDs and unchanged passwords fail without writes', async () => {
  const f = fixture()
  let requested = await f.service.request({ identifier: 'STUDENT-1' })
  f.advance(10 * 60_000)
  await assert.rejects(f.service.verify({ challenge_id: requested.challengeId, code: '123456' }), code('RECOVERY_CODE_INVALID'))
  await assert.rejects(f.service.verify({ challenge_id: '-'.repeat(36), code: '123456' }), code('RECOVERY_CODE_INVALID'))
  requested = await f.service.request({ identifier: 'STUDENT-1' })
  const verified = await f.service.verify({ challenge_id: requested.challengeId, code: '123456' })
  const reset = { challenge_id: requested.challengeId, reset_token: verified.resetToken, password: 'OldPassword1', confirm_password: 'OldPassword1' }
  await assert.rejects(f.service.reset(reset), code('PASSWORD_UNCHANGED'))
  f.advance(5 * 60_000)
  await assert.rejects(f.service.reset({ ...reset, password: 'NewPassword2', confirm_password: 'NewPassword2' }), code('RECOVERY_TOKEN_INVALID'))
  assert.equal(f.state.version, 1)
})

test('new requests and changed account versions invalidate previous recovery material', async () => {
  const f = fixture()
  const first = await f.service.request({ identifier: 'STUDENT-1' })
  f.advance(61_000)
  const second = await f.service.request({ identifier: 'STUDENT-1' })
  await assert.rejects(f.service.verify({ challenge_id: first.challengeId, code: '123456' }), code('RECOVERY_CODE_INVALID'))
  f.state.version++
  await assert.rejects(f.service.verify({ challenge_id: second.challengeId, code: '123456' }), code('RECOVERY_CODE_INVALID'))
})

test('unknown accounts and sender failures return the same neutral response without usable codes', async () => {
  const unknown = fixture()
  const absent = await unknown.service.request({ identifier: 'UNKNOWN' })
  assert.equal(unknown.state.challenge, null)
  const failed = fixture(true)
  const result = await failed.service.request({ identifier: 'STUDENT-1' })
  assert.equal(result.message, absent.message)
  assert.equal(failed.state.challenge?.code_hash, null)
  await assert.rejects(failed.service.verify({ challenge_id: result.challengeId, code: '123456' }), code('RECOVERY_CODE_INVALID'))
})
