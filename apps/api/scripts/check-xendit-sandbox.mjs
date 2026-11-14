import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import pg from 'pg'
import { readXenditSandboxConfig } from '../src/config/xendit-sandbox.ts'

export async function checkXenditSandbox() {
  const settingsPath = new URL('../.env.xendit-sandbox', import.meta.url)
  const config = readXenditSandboxConfig(dotenv.parse(await readFile(settingsPath)))
  if (!config.enabled) throw new Error('Enable the dedicated local sandbox settings before checking.')
  const reference = JSON.parse(await readFile(new URL('./fixtures/xendit-sandbox-channels.json', import.meta.url), 'utf8'))
  if (reference.environment !== 'test' || reference.sampleFee.liveApproved !== false
    || reference.sampleFee.fixedCentavos !== 100 || reference.sampleFee.percentageBasisPoints !== 100
    || reference.channels.some(channel => channel.country !== 'PH' || channel.currency !== 'PHP'
      || !Number.isSafeInteger(channel.minTotalCentavos) || !Number.isSafeInteger(channel.maxTotalCentavos)
      || channel.minTotalCentavos <= 0 || channel.maxTotalCentavos < channel.minTotalCentavos)) {
    throw new Error('The sandbox fee or channel reference needs review.')
  }

  const database = new pg.Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 })
  let fixtureCounts
  try {
    await database.connect()
    await database.query('BEGIN READ ONLY')
    const { rows: identity } = await database.query(`SELECT current_database() AS database_name,
      current_user AS role_name, host(inet_server_addr()) AS address,
      has_table_privilege(current_user,'xendit_sandbox.fixture_charges','INSERT,UPDATE,DELETE') AS can_write,
      has_schema_privilege(current_user,'xendit_sandbox','CREATE') AS can_create`)
    if (identity[0]?.database_name !== 'sti_xendit_sandbox' || identity[0].role_name !== 'sandbox_app'
      || !['127.0.0.1', '::1'].includes(identity[0].address) || identity[0].can_write || identity[0].can_create) {
      throw new Error('The database connection is outside the isolated read-only sandbox.')
    }
    const { rows } = await database.query(`SELECT environment,fixture_version,
      (SELECT COUNT(*)::int FROM xendit_sandbox.fixture_users) AS users,
      (SELECT COUNT(*)::int FROM xendit_sandbox.fixture_charges) AS charges,
      (SELECT COUNT(*)::int FROM xendit_sandbox.sample_fees WHERE live_approved=false) AS sample_fees
      FROM xendit_sandbox.setup WHERE id=1`)
    const fixture = rows[0]
    if (fixture?.environment !== 'test' || fixture.fixture_version !== 1
      || fixture.users !== 2 || fixture.charges !== 5 || fixture.sample_fees !== 1) {
      throw new Error('The local database does not match the payment sandbox fixtures.')
    }
    fixtureCounts = { users: fixture.users, charges: fixture.charges }
    await database.query('ROLLBACK')
  } finally {
    await database.end()
  }

  // A read of a deliberately nonexistent session exercises authentication without creating a payment.
  const response = await fetch(config.apiOrigin + '/sessions/ps-000000000000000000000000', {
    method: 'GET',
    headers: { Authorization: 'Basic ' + Buffer.from(config.secretKey + ':').toString('base64'), Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  if (response.status !== 404 || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The read-only Xendit authentication check failed with HTTP ' + response.status + '.')
  }
  const result = await response.json()
  if (result.error_code !== 'NOT_FOUND') throw new Error('The provider returned an unexpected authentication result.')

  return {
    environment: 'test',
    providerAuthentication: 'passed-read-only',
    database: 'local-loopback-only',
    fixtureCounts,
    documentedChannelLimits: reference.channels.length,
    fees: 'SAMPLE ONLY — PHP 1 plus 1% of principal',
    publicCallbacks: config.webhookUrl ? 'origin-defined-routes-pending' : 'pending-approved-HTTPS-origin',
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await checkXenditSandbox(), null, 2)) }
  catch (error) {
    console.error('Sandbox check failed (' + (error.code || error.name) + '). Review the dedicated local settings and database.')
    process.exitCode = 1
  }
}
