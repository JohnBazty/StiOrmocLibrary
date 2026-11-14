import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const apiDirectory = path.join(root, 'apps', 'api')
const ownConfiguration = path.join(apiDirectory, '.env')
// This local integration checkout reuses the owner's existing configuration;
// credentials are never copied into a second file or written to the console.
const existingConfiguration = path.resolve(root, '..', 'StiOrmocLibrary', 'apps', 'api', '.env')
const configuration = existsSync(ownConfiguration) ? ownConfiguration : existingConfiguration

if (!existsSync(configuration)) {
  console.error('Library configuration was not found. Restore apps/api/.env before starting the project.')
  process.exitCode = 1
} else {
  const children = []
  let stopping = false
  const stop = (code = 0) => {
    if (stopping) return
    stopping = true
    process.exitCode = code
    for (const child of children) if (child.exitCode === null) child.kill()
  }
  const start = (name, arguments_, cwd, environment) => {
    const child = spawn(process.execPath, arguments_, { cwd, env: environment, stdio: 'inherit', windowsHide: true })
    children.push(child)
    child.once('error', () => { console.error(`${name} could not start.`); stop(1) })
    child.once('exit', code => { if (!stopping) stop(code ?? 1) })
  }
  const environment = { ...process.env, NODE_ENV: 'development' }
  start('Library API', ['--env-file=' + configuration, 'src/server.ts'], apiDirectory, {
    ...environment, PORT: '4000', WEB_ORIGIN: 'http://localhost:5173',
    // The settlement gateway stays off. Local Test checkout only reads school
    // charges and saves clearly labelled attempts in ignored local output.
    XENDIT_ENABLED: 'false', JOB_RUNNER_LOCAL_TIMER: 'off',
    LOCAL_PAYMENT_PREVIEW: existsSync(path.join(apiDirectory, '.env.xendit-sandbox')) ? 'true' : 'false',
  })
  process.once('SIGINT', () => stop())
  process.once('SIGTERM', () => stop())
  // Do not let the website cache unavailable/payment errors while the API is
  // still checking the school connection and schema during startup.
  let ready = false
  const deadline = Date.now() + 60_000
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch('http://localhost:4000/api/health', { signal: AbortSignal.timeout(1500) })
      ready = response.ok
      await response.body?.cancel()
      if (ready) break
    } catch { /* The API is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!stopping && ready) {
    start('Library website', [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--force'],
      path.join(root, 'apps', 'web'), environment)
  } else if (!stopping) {
    console.error('Library API did not become ready. Check the database connection before trying again.')
    stop(1)
  }
}
