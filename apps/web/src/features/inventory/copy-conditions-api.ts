import { getCsrfToken } from '../auth/auth-storage'

export const BASE_CONDITIONS = ['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'] as const
export type BaseCondition = typeof BASE_CONDITIONS[number]

export type CopyCondition = {
  conditionId: number
  name: string
  /** Which of the five base conditions lending, returns and stocktake treat it as. */
  behavesAs: BaseCondition
  description: string | null
  /** The five base conditions keep their name and behaviour. */
  isBase: boolean
  isActive: boolean
  sortOrder: number
  /** Copies currently in this condition. */
  copies: number
  /** Version the server saw last; sent back with an edit. */
  updatedAt: string
}
export type CopyConditionInput = { name: string; behavesAs: BaseCondition; description: string }

export class CopyConditionError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) { super(message) }
}

async function request<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers({ Accept: 'application/json' })
  const token = getCsrfToken()
  if (token) headers.set('X-CSRF-Token', token)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string; details?: { errors?: Record<string, string> } } | null
  if (!response.ok || !payload?.success) throw new CopyConditionError(payload?.message ?? 'The book conditions request failed.', payload?.details?.errors ?? {})
  return payload.data as T
}

const base = '/api/v1/admin/copy-conditions'
export const copyConditionsApi = {
  list: () => request<CopyCondition[]>(base, { cache: 'no-store' }),
  create: (input: CopyConditionInput) => request<CopyCondition>(base, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: Partial<CopyConditionInput> & { isActive?: boolean; updatedAt: string }) =>
    request<CopyCondition>(`${base}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: number) => request<{ conditionId: number }>(`${base}/${id}`, { method: 'DELETE' }),
}
