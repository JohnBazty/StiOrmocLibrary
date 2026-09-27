import { getAccessToken } from '../auth/auth-storage'

export type InvoiceSetup = { issuer_name: string; issuer_address: string; issuer_tin: string; authority_reference: string; serial_prefix: string; serial_start: number; serial_end: number; next_serial: number; print_classification: string; fine_classification: string; approved: boolean; issuanceEnabled: boolean }
export type Invoice = { invoice_id: number; invoice_number: string; source_type: string; source_id: number; revision: number; customer_name: string; customer_school_id: string; amount: number; status: 'Issued' | 'Voided'; issued_at: string; voided_at?: string | null }

export class InvoiceApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}

export function invoiceSchemaPending(error: unknown) {
  return error instanceof InvoiceApiError && error.code === 'DATABASE_MIGRATION_REQUIRED'
}

async function request<T>(path: string, options: RequestInit = {}) {
  const token = getAccessToken()
  const response = await fetch(path, { ...options, credentials: 'include', headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string; code?: string } | null
  if (!response.ok || !payload?.success) throw new InvoiceApiError(payload?.message ?? 'The invoice request failed.', response.status, payload?.code)
  return payload.data as T
}

export async function downloadInvoice(id: number, admin: boolean) {
  const token = getAccessToken()
  const response = await fetch(`/api/v1/${admin ? 'admin/' : ''}invoices/${id}/pdf`, { headers: { Accept: 'application/pdf', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: 'include' })
  if (!response.ok) throw new Error('The invoice could not be downloaded.')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = `invoice-${id}.pdf`; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const invoiceApi = {
  setup: () => request<InvoiceSetup | null>('/api/v1/admin/invoices/setup'),
  configure: (body: Record<string, unknown>) => request('/api/v1/admin/invoices/setup', { method: 'PUT', body: JSON.stringify(body) }),
  list: () => request<Invoice[]>('/api/v1/admin/invoices'),
  mine: () => request<Invoice[]>('/api/v1/invoices'),
  issue: (sourceType: 'Printing' | 'Fine Collection', sourceId: number) => request<Invoice>('/api/v1/admin/invoices/issue', { method: 'POST', body: JSON.stringify({ sourceType, sourceId }) }),
  void: (invoiceId: number, reason: string) => request(`/api/v1/admin/invoices/${invoiceId}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
}
