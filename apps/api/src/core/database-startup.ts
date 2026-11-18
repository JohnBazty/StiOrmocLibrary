import { setTimeout as delay } from 'node:timers/promises'

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const
const TRANSIENT_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
  'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'PROTOCOL_CONNECTION_LOST',
  '08000', '08001', '08003', '08006', '57P03',
])

function errorCodes(error: unknown, depth = 0): string[] {
  if (!error || typeof error !== 'object' || depth > 4) return []
  const value = error as { code?: unknown; cause?: unknown; errors?: unknown[] }
  return [
    ...(typeof value.code === 'string' ? [value.code] : []),
    ...errorCodes(value.cause, depth + 1),
    ...(Array.isArray(value.errors) ? value.errors.flatMap(item => errorCodes(item, depth + 1)) : []),
  ]
}

export function isTransientDatabaseConnectionError(error: unknown): boolean {
  if (errorCodes(error).some(code => TRANSIENT_CODES.has(code))) return true
  // pg-pool can omit an error code when its connection timer expires.
  return error instanceof Error && [
    'Connection terminated due to connection timeout',
    'timeout exceeded when trying to connect',
  ].includes(error.message)
}

/** Retry only the startup read-only connection probe. Never replay application writes. */
export async function connectDatabaseAtStartup(
  verify: () => Promise<void>,
  options: {
    wait?: (milliseconds: number) => Promise<unknown>
    onRetry?: (retry: { nextAttempt: number; totalAttempts: number; delayMs: number }) => void
  } = {},
) {
  const wait = options.wait ?? delay
  for (let attempt = 0; ; attempt++) {
    try { await verify(); return }
    catch (error) {
      if (!isTransientDatabaseConnectionError(error) || attempt >= RETRY_DELAYS_MS.length) throw error
      const delayMs = RETRY_DELAYS_MS[attempt]
      options.onRetry?.({ nextAttempt: attempt + 2, totalAttempts: RETRY_DELAYS_MS.length + 1, delayMs })
      await wait(delayMs)
    }
  }
}

/** Actionable terminal messages without connection strings, passwords or raw SQL. */
export function databaseStartupErrorMessage(error: unknown): string {
  const codes = errorCodes(error)
  if (codes.some(code => code === 'ENOTFOUND' || code === 'EAI_AGAIN')) {
    return 'Unable to start the API: the database address could not be resolved (DNS). Check your internet connection, then run npm.cmd run dev:stable again. If this continues, compare DATABASE_URL in apps/api/.env with the connection string in the Supabase Connect panel.'
  }
  if (isTransientDatabaseConnectionError(error)) {
    return 'Unable to start the API: the database is still unreachable after connection retries. Check your internet connection and database availability, then run npm.cmd run dev:stable again.'
  }
  if (codes.some(code => code === '28P01' || code === 'ER_ACCESS_DENIED_ERROR')) {
    return 'Unable to start the API: the database rejected its login details. Check the database credentials in apps/api/.env, then restart the API.'
  }
  return 'Unable to start the API. Check the configured database connection and required migrations. No migrations are applied automatically at startup.'
}
