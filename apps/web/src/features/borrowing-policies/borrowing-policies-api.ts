import { getAccessToken } from '../auth/auth-storage'
import type { BorrowingPolicyList, BorrowingPolicyVersion, PublishBorrowingPolicyInput } from './types'

function headers() {
  const value = new Headers({ Accept: 'application/json' })
  const token = getAccessToken()
  if (token) value.set('Authorization', `Bearer ${token}`)
  return value
}

async function request<T>(url: string, options: RequestInit = {}) {
  const requestHeaders = headers()
  if (options.body) requestHeaders.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers: requestHeaders, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string } | null
  if (!response.ok || !payload?.success) throw new Error(payload?.message ?? 'The borrowing policy request failed.')
  return payload.data as T
}

export const borrowingPoliciesApi = {
  list: () => request<BorrowingPolicyList>('/api/v1/admin/borrowing-policies'),
  get: (versionId: number) => request<BorrowingPolicyVersion>(`/api/v1/admin/borrowing-policies/${versionId}`),
  publish: (body: PublishBorrowingPolicyInput) => request<BorrowingPolicyVersion>('/api/v1/admin/borrowing-policies', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
}
