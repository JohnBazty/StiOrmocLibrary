const CONNECTION_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE',
  '08000', '08001', '08003', '08006', '53300', '57P01', '57P02', '57P03',
])

export function isDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; message?: string; errors?: unknown[] }
  if (CONNECTION_CODES.has(candidate.code ?? '')) return true
  if (/EMAXCONNSESSION|connection terminated unexpectedly|connection terminated due to connection timeout|timeout exceeded when trying to connect/i.test(candidate.message ?? '')) return true
  return Array.isArray(candidate.errors) && candidate.errors.some(isDatabaseUnavailable)
}
