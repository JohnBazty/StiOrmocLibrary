import { timingSafeEqual } from 'node:crypto'

const MAX_ERROR_MESSAGE = 500

/** Sanitize error objects to prevent sensitive data leakage in logs */
export function cleanJobError(error: unknown) {
  if (!(error instanceof Error)) return { code: 'SERVICE_ERROR', message: 'Service error occurred.' }
  const raw = (error as Error & { code?: unknown }).code
  const code = typeof raw === 'string' && /^[A-Z0-9_]{1,64}$/.test(raw) ? raw : 'SERVICE_ERROR'
  const message = (error.message.split(/\r?\n/)[0] ?? '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[redacted]')  // URLs/connection strings
    .replace(/\b(password|passwd|pwd|secret|token|key)=[^\s&]+/gi, '$1=[redacted]')  // secrets
    .replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, '[redacted]')  // emails
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')  // Bearer tokens
    .trim()
    .slice(0, MAX_ERROR_MESSAGE)
  return { code, message: message || 'Service error occurred.' }
}

/** Remove sensitive data from error stack traces for logging */
export function sanitizeStackTrace(error: unknown): string {
  if (!(error instanceof Error)) return '[Non-Error object]'

  let stack = error.stack ?? ''

  // Remove sensitive patterns from stack trace
  stack = stack
    .replace(/[\w.-]+:\/\/[^\s]+/gi, '[redacted-url]')  // connection strings
    .replace(/(password|passwd|pwd|secret|token|key)=[^\s"']+/gi, '$1=[redacted]')  // secrets in strings
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')  // bearer tokens
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, '[redacted-email]')  // emails

  // Redact lines with file paths that might contain sensitive info
  const lines = stack.split('\n')
  const sanitizedLines = lines.filter(line => {
    // Filter out lines with potential sensitive path patterns
    const lower = line.toLowerCase()
    return !lower.includes('env=') &&
           !lower.includes('api_key') &&
           !lower.includes('secret_key')
  })

  return sanitizedLines.join('\n')
}