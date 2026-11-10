import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const envModule = new URL('./env.js', import.meta.url).href

// A child process without NODE_TEST_CONTEXT sees the real resolution rules.
// Empty strings stop dotenv from filling the keys in from apps/api/.env.
function loadEnv(overrides) {
  const childEnv = { ...process.env, DATABASE_URL: '', SUPABASE_DB_URL: '', SUPABASE_URL: '', DB_PASS: '', SUPABASE_DB_PASSWORD: '', ...overrides }
  if (!('NODE_TEST_CONTEXT' in overrides)) delete childEnv.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, ['--input-type=module', '-e', `const { env } = await import(${JSON.stringify(envModule)}); console.log(env.db.connectionString)`], { env: childEnv, encoding: 'utf8' })
}

test('startup fails with a clear message when no database URL resolves', () => {
  const result = loadEnv({})
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /DATABASE_URL is required/)
})

test('production ignores NODE_TEST_CONTEXT and keeps the real database URL', () => {
  const secret = 'x'.repeat(32)
  const result = loadEnv({
    NODE_ENV: 'production', NODE_TEST_CONTEXT: 'child-v8', DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres',
    SESSION_SECRET: secret, JWT_SECRET: secret, REPORT_INTEGRITY_SECRET: secret, ATTENDANCE_QR_SECRET: secret,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'postgresql://u:p@db.example.com:5432/postgres')
})

test('DATABASE_URL is used as the connection string', () => {
  const result = loadEnv({ DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'postgresql://u:p@db.example.com:5432/postgres')
})
