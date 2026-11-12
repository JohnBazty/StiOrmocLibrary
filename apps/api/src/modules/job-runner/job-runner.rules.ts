import { timingSafeEqual } from 'node:crypto'

export type JobOutcome = 'succeeded' | 'failed' | 'skipped'
export type JobHealth = 'healthy' | 'stale' | 'failed'
export type OverdueCursor = { dueAt: string; transactionId: number }

export const MIN_JOB_SECRET_LENGTH = 32
export const STALE_AFTER_MS = 3 * 60_000
const MAX_ERROR_MESSAGE = 500

/** D1: constant-time compare after a length check; an unset or short configured secret refuses every call. */
export function validJobSecret(supplied: unknown, configured: string | undefined) {
  if (!configured || configured.length < MIN_JOB_SECRET_LENGTH || typeof supplied !== 'string') return false
  const given = Buffer.from(supplied)
  const expected = Buffer.from(configured)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** D3: failed until a later success; stale without a success in the last 3 minutes. */
export function jobHealth(state: { lastOutcome: JobOutcome | null; lastSuccessAt: Date | null; lastFailureAt: Date | null }, now: Date): JobHealth {
  const success = state.lastSuccessAt?.getTime() ?? null
  if (state.lastOutcome === 'failed' && state.lastFailureAt && (success === null || success < state.lastFailureAt.getTime())) return 'failed'
  if (success === null || now.getTime() - success > STALE_AFTER_MS) return 'stale'
  return 'healthy'
}

/** First line only, at most 500 characters, with connection strings and key=value secrets removed. */
export function cleanJobError(error: unknown) {
  if (!(error instanceof Error)) return { code: 'SERVICE_ERROR', message: 'Scheduled job failed.' }
  const raw = (error as Error & { code?: unknown }).code
  const code = typeof raw === 'string' && /^[A-Z0-9_]{1,64}$/.test(raw) ? raw : 'SERVICE_ERROR'
  const message = (error.message.split(/\r?\n/)[0] ?? '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[redacted]')
    .replace(/\b(password|passwd|pwd|secret|token|key)=\S+/gi, '$1=[redacted]')
    .replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .trim()
    .slice(0, MAX_ERROR_MESSAGE)
  return { code, message: message || 'Scheduled job failed.' }
}

export function parseOverdueCursor(value: string | null): OverdueCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<OverdueCursor>
    if (typeof parsed?.dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(parsed.dueAt)) return null
    if (!Number.isSafeInteger(parsed.transactionId) || (parsed.transactionId as number) < 1) return null
    return { dueAt: parsed.dueAt, transactionId: parsed.transactionId as number }
  } catch {
    return null
  }
}
