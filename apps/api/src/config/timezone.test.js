import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const apiDirectory = fileURLToPath(new URL('../../', import.meta.url))

for (const inheritedZone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
  test(`API uses Manila calendar time when the host starts in ${inheritedZone}`, () => {
    const script = `
      await import('./src/config/env.js');
      const date = new Date('2026-11-11T16:30:00.000Z');
      console.log(JSON.stringify({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
        hour: date.getHours(), minute: date.getMinutes(), offset: date.getTimezoneOffset(),
        instant: date.toISOString() }));
    `
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: apiDirectory, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test', NODE_TEST_CONTEXT: 'timezone-check', TZ: inheritedZone },
    }))
    assert.deepEqual(result, { zone: 'Asia/Manila', year: 2026, month: 11, day: 12, hour: 0, minute: 30, offset: -480,
      instant: '2026-11-11T16:30:00.000Z' })
  })
}
