import { getCsrfToken } from '../auth/auth-storage'

export type ViolationCategory = {
  categoryId: number
  name: string
  description: string | null
  warningsBeforeFine: number
  fineAmount: number
  isActive: boolean
  sortOrder: number
  /** True once any violation record uses the name; the name is then locked. */
  used: boolean
  /** Version the server saw last; sent back with an edit so a change by someone else is caught. */
  updatedAt: string
}
export type ViolationCategoryInput = { name: string; description: string; warningsBeforeFine: number; fineAmount: string }

export class ViolationCategoryError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) { super(message) }
}

async function request<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers({ Accept: 'application/json' })
  const token = getCsrfToken()
  if (token) headers.set('X-CSRF-Token', token)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string; details?: { errors?: Record<string, string> } } | null
  if (!response.ok || !payload?.success) throw new ViolationCategoryError(payload?.message ?? 'The violation rules request failed.', payload?.details?.errors ?? {})
  return payload.data as T
}

export const violationCategoriesApi = {
  list: () => request<ViolationCategory[]>('/api/v1/admin/violation-categories'),
  create: (input: ViolationCategoryInput) => request<ViolationCategory>('/api/v1/admin/violation-categories', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: Partial<ViolationCategoryInput> & { isActive?: boolean; updatedAt: string }) =>
    request<ViolationCategory>(`/api/v1/admin/violation-categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
}

/** "2 warnings, then PHP 50.00 on the 3rd offense." */
export function describeCategory(category: Pick<ViolationCategory, 'warningsBeforeFine' | 'fineAmount'>) {
  const amount = `PHP ${category.fineAmount.toFixed(2)}`
  if (category.warningsBeforeFine === 0) return `No warnings. ${amount} on the 1st offense.`
  const warnings = `${category.warningsBeforeFine} warning${category.warningsBeforeFine === 1 ? '' : 's'}`
  const ordinal = ['1st', '2nd', '3rd', '4th'][category.warningsBeforeFine]
  return `${warnings}, then ${amount} on the ${ordinal} offense.`
}
