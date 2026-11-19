import { enhancedRequest } from '../catalog/enhanced-catalog-api'
import { getCsrfToken } from '../auth/auth-storage'

export type StockItem = {
  kind: string
  id: number
  barcode: string
  accession: string
  title: string
  shelf: string
  condition: string
}
export type StocktakeDetail = {
  session: {
    stocktake_session_id: number
    session_name: string
    status: string
    asset_kind: string
    scope_label: string
  }
  report: {
    summary: Record<string, number>
    rows: Array<{
      expectedId: number
      original: StockItem
      item: StockItem
      outcome: string
      scans: number
      observedCondition?: string | null
      damaged: boolean
      changed: boolean
    }>
    findings: Array<{
      key: string
      code: string
      label: string
      expectedId: number | null
      evidence: unknown
    }>
    generatedAt: string
  }
  reviewToken: string
  reviewNote: string | null
  legacy: boolean
}
export type InventoryOutcome = {
  status: 'none' | 'applied' | 'unchanged' | 'skipped' | 'failed'
  from?: string
  to?: string
  message?: string
}
export type ScanResponse = StocktakeDetail & { scanResult?: { inventory: InventoryOutcome } }
export type LookupItem = {
  kind: 'book' | 'research'
  title: string
  accession: string
  barcode: string
  shelf: string
  condition: string
  availability: string
  lifecycle: string
  loan: string
}
export type LookupResult =
  | { found: false; code: string }
  | { found: true; code: string; item: LookupItem; inScope: boolean; alreadyCounted: boolean }
export type SavedCount = {
  id: number
  name: string
  kind: string
  location: string
  status: string
  started: string
}

const base = '/api/v1/admin/stocktake'
const send = (path: string, body: unknown) =>
  enhancedRequest<StocktakeDetail>(base + path, { method: 'POST', body: JSON.stringify(body) })

/**
 * Read-only stocktake label lookup with one automatic retry on transient proxy/reload errors
 * (for example while the local API restarts) and clear HTTP status reporting.
 */
async function lookupLabel(
  id: number,
  code: string,
  codeType: 'barcode' | 'accession' = 'barcode',
): Promise<LookupResult> {
  const url = `${base}/${id}/lookup?code=${encodeURIComponent(code)}&codeType=${codeType}`
  const headers = new Headers()
  const token = getCsrfToken()
  if (token) headers.set('X-CSRF-Token', token)

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
        cache: 'no-store',
      })
      let payload: { success?: boolean; message?: string; data?: LookupResult } | null = null
      try {
        payload = (await response.json()) as { success?: boolean; message?: string; data?: LookupResult }
      } catch {
        payload = null
      }
      if (!payload) {
        lastError = new Error(
          response.status >= 500
            ? `The stocktake server is temporarily unreachable (HTTP ${response.status}). Wait a moment and try again.`
            : `Unexpected response while looking up ${code} (HTTP ${response.status}). Refresh the page and try again.`,
        )
        if (attempt === 0) {
          await new Promise(resolve => window.setTimeout(resolve, 350))
          continue
        }
        throw lastError
      }
      if (!response.ok || !payload.success) {
        const msg = payload.message ?? 'The stocktake label lookup failed.'
        if (attempt === 0 && response.status >= 502 && response.status <= 504) {
          lastError = new Error(msg)
          await new Promise(resolve => window.setTimeout(resolve, 350))
          continue
        }
        throw new Error(msg)
      }
      return payload.data as LookupResult
    } catch (error) {
      if (error instanceof TypeError && attempt === 0) {
        lastError = new Error('Could not reach the library API server. Make sure the API server is running and try again.')
        await new Promise(resolve => window.setTimeout(resolve, 350))
        continue
      }
      throw error instanceof Error ? error : new Error('This label could not be looked up. Try again.')
    }
  }
  throw lastError ?? new Error('This label could not be looked up. Try again.')
}

export const stocktakeApi = {
  list: () => enhancedRequest<SavedCount[]>(base),
  locations: () => enhancedRequest<string[]>(base + '/locations'),
  get: (id: number) => enhancedRequest<StocktakeDetail>(`${base}/${id}`),
  start: (body: unknown) => send('', body),
  scan: (id: number, body: unknown) =>
    enhancedRequest<ScanResponse>(`${base}/${id}/scan`, { method: 'POST', body: JSON.stringify(body) }),
  lookup: lookupLabel,
  finish: (id: number, body: unknown) => send(`/${id}/finish`, body),
  cancel: (id: number, reason: string) => send(`/${id}/cancel`, { reason }),
  async download(id: number, format: 'csv' | 'pdf') {
    const res = await fetch(`${base}/${id}/export.${format}`, { credentials: 'include' })
    if (!res.ok) throw new Error('The report could not be downloaded. Refresh and try again.')
    const url = URL.createObjectURL(await res.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `stocktake-${id}.${format}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
