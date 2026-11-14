/** Read client query fields independently of hosting-provided query helpers.
 * Duplicate keys remain arrays so strict validators reject ambiguous targets.
 */
export function requestQuery(request: { originalUrl?: string; url?: string }): Record<string, unknown> {
  const params = new URL(request.originalUrl ?? request.url ?? '/', 'http://localhost').searchParams
  const values: Record<string, unknown> = Object.create(null)
  for (const key of new Set(params.keys())) {
    if (key === '__api_route') continue
    const entries = params.getAll(key)
    values[key] = entries.length === 1 ? entries[0] : entries
  }
  return values
}
