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
    // Test credentials must never mark school charges as paid. Payment screens
    // stay integrated; provider activation requires its separately reviewed setup.
    XENDIT_ENABLED: 'false', JOB_RUNNER_LOCAL_TIMER: 'off',
  })
  start('Library website', [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--force'],
    path.join(root, 'apps', 'web'), environment)
  process.once('SIGINT', () => stop())
  process.once('SIGTERM', () => stop())
}
