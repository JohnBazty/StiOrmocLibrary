import { cleanJobError } from '../modules/job-runner/job-runner.rules.ts'

const MAX_FRAMES = 15

/**
 * Log-safe error text: name, code (pg SQLSTATE) and a redacted first message line, then stack
 * frames reduced to file name and line. Quoted values (pg puts user input there) are dropped.
 */
export function sanitizeStackTrace(error: unknown): string {
  if (!(error instanceof Error)) return '[Non-Error object]'
  const { code, message } = cleanJobError(error)
  const safeMessage = message
    .replace(/\b(\w*(?:password|passwd|pwd|secret|token|key))=\S+/gi, '$1=[redacted]')
    .replace(/"[^"]*"|'[^']*'/g, '"[redacted]"')
    .replace(/"[^"]*$/, '"[redacted]')  // a value cut off at the length cap
  const frames = (error.stack ?? '').split(/\r?\n/)
    .filter(line => /^\s+at /.test(line))
    .slice(0, MAX_FRAMES)
    // Keep only file:line:col; the full path may contain a username (with spaces).
    .map(line => line.replace(/\([^()]*[\\/]([^\\/()]+:\d+:\d+)\)/, '($1)').replace(/^(\s+at )[^()]*[\\/]([^\\/()]+:\d+:\d+)$/, '$1$2'))
  return [`${error.name} ${code}: ${safeMessage}`, ...frames].join('\n')
}
