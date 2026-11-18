import { getAccessToken } from '../auth/auth-storage'

export type FinePolicyVersion = {
  versionId: number; status: 'active' | 'scheduled' | 'superseded'
  hourlyRate: number; dailyRate: number; maximumPenalty: number
  effectiveFrom: string; effectiveUntil: string | null; changeReason: string | null; createdByUserId: number | null; createdAt: string
}
export type FinePolicyList = { active: FinePolicyVersion | null; scheduled: FinePolicyVersion[]; history: FinePolicyVersion[] }
export type FinePolicyInput = { hourlyRate: number; dailyRate: number; maximumPenalty: number; effectiveOn: string; changeReason: string }

export class FinePolicyError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) { super(message) }
}

async function request<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers({ Accept: 'application/json' })
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string; details?: { errors?: Record<string, string> } } | null
  if (!response.ok || !payload?.success) throw new FinePolicyError(payload?.message ?? 'The fine rules request failed.', payload?.details?.errors ?? {})
  return payload.data as T
}

export const finePoliciesApi = {
  list: () => request<FinePolicyList>('/api/v1/admin/fine-policies'),
  publish: (input: FinePolicyInput) => request<FinePolicyVersion>('/api/v1/admin/fine-policies', { method: 'POST', body: JSON.stringify(input) }),
}
