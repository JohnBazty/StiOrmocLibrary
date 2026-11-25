import { getCsrfToken } from '../auth/auth-storage'

export const STUDENT_LEVELS = ['Grade 11', 'Grade 12', '1st Year', '2nd Year', '3rd Year', '4th Year'] as const
export type StudentLevel = (typeof STUDENT_LEVELS)[number]
export type LevelWarningsMap = Partial<Record<StudentLevel, number>>

export type ViolationCategory = {
  categoryId: number
  name: string
  description: string | null
  warningsBeforeFine: number
  fineAmount: number
  allowedLevels: StudentLevel[]
  isActive: boolean
  sortOrder: number
  /** True once any violation record uses the name; the name is then locked. */
  used: boolean
  /** Version the server saw last; sent back with an edit so a change by someone else is caught. */
  updatedAt: string
}
export type ViolationCategoryInput = {
  name: string
  description: string
  fineAmount: string
  allowedLevels: StudentLevel[]
}

export type ViolationSettings = {
  maxFine: number
  warningsBeforeFine: number
  levelWarnings: LevelWarningsMap
  updatedAt: string
}

export type ViolationSettingsUpdate = {
  maxFine?: string
  warningsBeforeFine?: number
  levelWarnings?: LevelWarningsMap
  updatedAt: string
}

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
  getSettings: () => request<ViolationSettings>('/api/v1/admin/violation-categories/settings'),
  /** Updates highest fine and/or shared warning rules across all categories. */
  saveSettings: (input: ViolationSettingsUpdate) =>
    request<ViolationSettings>('/api/v1/admin/violation-categories/settings', { method: 'PUT', body: JSON.stringify(input) }),
  /** Only a category with no violation records can be deleted; the server refuses the rest. */
  remove: (id: number) => request<{ deleted: true }>(`/api/v1/admin/violation-categories/${id}`, { method: 'DELETE' }),
}

/** 9999.99 -> "9,999.99" */
export const formatFine = (amount: number) => amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "All year & grade levels" or "1st Year, Grade 11". */
export function describeAllowedLevels(levels: StudentLevel[] | undefined) {
  if (!levels || levels.length === 0 || levels.length === STUDENT_LEVELS.length) return 'All levels'
  return levels.join(', ')
}

function ordinal(n: number) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** Plain-language summary of the shared warning rule. */
export function describeSharedWarningRule(settings: Partial<Pick<ViolationSettings, 'warningsBeforeFine' | 'levelWarnings'>> | null | undefined) {
  const warningsBeforeFine = typeof settings?.warningsBeforeFine === 'number' ? settings.warningsBeforeFine : 2
  const levelWarnings = settings?.levelWarnings ?? {}
  const customEntries = STUDENT_LEVELS
    .filter(level => typeof levelWarnings[level] === 'number' && levelWarnings[level] !== warningsBeforeFine)
    .map(level => `${level}: ${levelWarnings[level]}`)
  const base = warningsBeforeFine === 0
    ? '0 warnings across all violations — fine starts on the 1st offense.'
    : `${warningsBeforeFine} warning${warningsBeforeFine === 1 ? '' : 's'} across all violations — fine starts on the ${ordinal(warningsBeforeFine + 1)} offense.`
  if (!customEntries.length) return `${base} Applies to all year & grade levels.`
  return `${base} Custom limits: ${customEntries.join(' · ')}.`
}
