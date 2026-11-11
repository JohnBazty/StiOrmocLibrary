import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, relative, resolve } from 'node:path'
import dotenv from 'dotenv'
import { readXenditSandboxConfig } from '../src/config/xendit-sandbox.ts'
import { checkXenditSandbox } from './check-xendit-sandbox.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const output = new URL('../../../output/xendit-sandbox/', import.meta.url)
const environmentFile = new URL('../.env.xendit-sandbox', import.meta.url)
const args = process.argv.slice(2)
const credentialsIndex = args.indexOf('--credentials-file')
const credentialsFile = credentialsIndex >= 0 ? args[credentialsIndex + 1] : null
const keepRunning = args.includes('--keep-running')

function requireIgnored(path, directory = root) {
  const name = relative(directory, path)
  const result = spawnSync('git', ['check-ignore', '--no-index', '--quiet', name], { cwd: directory })
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', name], { cwd: directory, stdio: 'ignore' })
  if (result.status !== 0 || tracked.status !== 1) throw new Error('Sandbox secrets and data must be ignored and untracked.')
}

async function exists(path) {
  try { await access(path); return true }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

async function prepare() {
  if (!credentialsFile) throw new Error('Pass --credentials-file followed by the ignored local credential sheet.')
  const credentialPath = resolve(credentialsFile)
  requireIgnored(credentialPath, dirname(credentialPath))
  requireIgnored(fileURLToPath(environmentFile))
  requireIgnored(fileURLToPath(new URL('local-state.json', output)))

  const sheet = await readFile(credentialPath, 'utf8')
  const secretKey = sheet.match(/## Test secret API key\r?\n\r?\n`{3}text\r?\n([^\r\n]+)/)?.[1]?.trim()
  const webhookToken = sheet.match(/## Test webhook verification token\r?\n\r?\n`{3}text\r?\n([^\r\n]+)/)?.[1]?.trim()
  await mkdir(output, { recursive: true })
  const stateFile = new URL('local-state.json', output)
  if (!await exists(stateFile)) await writeFile(stateFile, JSON.stringify({
    ownerPassword: randomBytes(24).toString('hex'), appPassword: randomBytes(24).toString('hex'),
  }), { flag: 'wx', mode: 0o600 })
  const state = JSON.parse(await readFile(stateFile, 'utf8'))
  if (!/^[a-f0-9]{48}$/.test(state.ownerPassword) || !/^[a-f0-9]{48}$/.test(state.appPassword)) {
    throw new Error('Unexpected local sandbox state.')
  }

  const previous = await exists(environmentFile) ? dotenv.parse(await readFile(environmentFile)) : {}
  const databaseUrl = 'postgresql://sandbox_app:' + state.appPassword + '@127.0.0.1:55438/sti_xendit_sandbox'
  const settings = {
    XENDIT_ENABLED: 'true', XENDIT_MODE: 'test',
    XENDIT_SECRET_KEY: secretKey, XENDIT_WEBHOOK_TOKEN: webhookToken,
    XENDIT_API_BASE_URL: 'https://api.xendit.co',
    DATABASE_URL: databaseUrl, XENDIT_SANDBOX_DATABASE_URL: databaseUrl,
    XENDIT_SANDBOX_PUBLIC_ORIGIN: previous.XENDIT_SANDBOX_PUBLIC_ORIGIN || '',
  }
  readXenditSandboxConfig(settings)
  if (previous.DATABASE_URL && previous.DATABASE_URL !== databaseUrl) {
    throw new Error('The existing sandbox environment points to a different database.')
  }

  const { default: EmbeddedPostgres } = await import(new URL('tools/node_modules/embedded-postgres/dist/index.js', output))
  const cluster = new EmbeddedPostgres({
    databaseDir: fileURLToPath(new URL('data/', output)),
    user: 'sandbox_owner', password: state.ownerPassword, port: 55438,
    persistent: true, authMethod: 'scram-sha-256',
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    postgresFlags: ['-h', '127.0.0.1'],
    onLog: () => {}, onError: () => {},
  })
  if (!await exists(new URL('data/PG_VERSION', output))) await cluster.initialise()
  await cluster.start()
  try {
    const owner = cluster.getPgClient('postgres', '127.0.0.1')
    await owner.connect()
    try {
      if (!(await owner.query("SELECT 1 FROM pg_roles WHERE rolname='sandbox_app'")).rowCount) {
        await owner.query("CREATE ROLE sandbox_app LOGIN PASSWORD '" + state.appPassword + "'")
      }
      if (!(await owner.query("SELECT 1 FROM pg_database WHERE datname='sti_xendit_sandbox'")).rowCount) {
        await owner.query('CREATE DATABASE sti_xendit_sandbox')
      }
      await owner.query('REVOKE ALL ON DATABASE sti_xendit_sandbox FROM PUBLIC')
      await owner.query('GRANT CONNECT ON DATABASE sti_xendit_sandbox TO sandbox_app')
    } finally { await owner.end() }

    const fixtures = cluster.getPgClient('sti_xendit_sandbox', '127.0.0.1')
    await fixtures.connect()
    try {
      await fixtures.query('BEGIN')
      await fixtures.query(await readFile(new URL('./fixtures/xendit-sandbox.sql', import.meta.url), 'utf8'))
      await fixtures.query('COMMIT')
    } finally { await fixtures.end() }

    const body = '# Dedicated local payment sandbox. Keep private.\n'
      + Object.entries(settings).map(([name, value]) => name + '=' + value).join('\n') + '\n'
    await writeFile(environmentFile, body, { mode: 0o600 })
    console.log(JSON.stringify(await checkXenditSandbox(), null, 2))
    if (args.includes('--phase2') || args.includes('--phase3') || args.includes('--phase4') || args.includes('--phase6')) {
      process.env.DATABASE_URL = databaseUrl
      const { verifyPaymentFoundation } = await import('./verify-xendit-payment-foundation.mjs')
      console.log(JSON.stringify(await verifyPaymentFoundation(cluster,{gateway:args.includes('--phase3')||args.includes('--phase4')||args.includes('--phase6'),counter:args.includes('--phase4')||args.includes('--phase6'),operations:args.includes('--phase6'),hosted:args.includes('--hosted-payment')}), null, 2))
    }
    if (keepRunning) {
      console.log('Local sandbox database ready on 127.0.0.1:55438. Press Ctrl+C to stop.')
      await new Promise(resolveStop => {
        process.once('SIGINT', resolveStop)
        process.once('SIGTERM', resolveStop)
      })
    }
  } finally {
    if(process.platform==='win32' && cluster.process){
      // The package force-terminates Windows servers. Graceful shutdown avoids orphan workers and stale shared memory.
      const control=fileURLToPath(new URL('tools/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe',output))
      const stopped=spawnSync(control,['-D',fileURLToPath(new URL('data/',output)),'-m','fast','-w','stop'],{stdio:'ignore',timeout:15000})
      if(stopped.status!==0)throw new Error('The disposable local database could not stop gracefully.')
      cluster.process=undefined
    }
    await cluster.stop()
  }
}

try { await prepare() }
catch (error) {
  console.error('Sandbox preparation failed (' + (error?.code || error?.name || 'UNKNOWN') + '). Check the credential path, local tool installation and port 55438.')
  process.exitCode = 1
}
