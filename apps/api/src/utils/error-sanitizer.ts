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
  const frames = (error.stack ?? '').split(/\r?\n/)
    .filter(line => /^\s+at /.test(line))
    .slice(0, MAX_FRAMES)
    .map(line => line.replace(/(?:file:\/\/)?[^\s()]*[\\/]([^\\/\s()]+:\d+:\d+)/g, '$1'))
  return [`${error.name} ${code}: ${safeMessage}`, ...frames].join('\n')
}
