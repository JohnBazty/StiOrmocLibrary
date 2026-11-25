import { getCsrfToken } from '../auth/auth-storage'
import type { StudentLevel } from './violation-categories-api'

export type Incident = {
  incident_id: number
  full_name: string
  school_id: string
  category: string
  incident_at: string
  action: string
  source?: 'Recorded' | 'Paper log'
  details: string
  location: string
  recorded_by: string
  fine_amount?: number
  payment_status?: string
  voided_at?: string
  events: Array<{ type: string; reason: string; at: string }>
}

export type Standing = {
  name: string
  role: string
  studentLevel: StudentLevel | null
  schoolId: string
  category: string
  warningsUsed: number
  warningsBeforeFine: number
  fineAmount: number
  amount: number | null
  /** What a record saved now would be: First warning, Second warning, Warning N, Final warning or Fine. */
  nextStep: 'First warning' | 'Second warning' | 'Final warning' | `Warning ${number}` | 'Fine'
  fromPaperLog: boolean
  categoryActive: boolean
  allowedLevels: StudentLevel[]
  levelAllowed: boolean
  levelReason: string | null
  /** Paper-log entries only back-fill earlier warnings; when false, `paperLogReason` says why. */
  paperLogAllowed: boolean
  paperLogReason: string | null
  earlierWarnings: { count: number; reviewedAt: string } | null
  history: Array<{ incidentId: number; category: string; date: string; step: string; source: 'Recorded' | 'Paper log' }>
  reviewToken: string
}

export type OwnStanding = {
  role: string
  studentLevel: StudentLevel | null
  warningsUsed: number
  warningsBeforeFine: number
  warningsLeft: number
  categories: Array<{ category: string; fineAmount: number; allowedLevels: StudentLevel[] }>
}

export class ViolationRequestError extends Error {
  constructor(message: string, readonly code = '') { super(message) }
}

export async function violationRequest<T>(url: string, body?: unknown): Promise<T> {
  const token = getCsrfToken()
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json()
  if (!response.ok || !result.success) throw new ViolationRequestError(result.message ?? 'Violation records are unavailable. Please retry.', result.code)
  return result.data
}

export const adminViolationsBase = '/api/v1/admin/fines/violations'
export const ownViolationsBase = '/api/v1/fines/violations'

export const violationsApi = {
  standing: (schoolId: string, category: string, paperLog: boolean) =>
    violationRequest<Standing>(`${adminViolationsBase}/standing?${new URLSearchParams({ schoolId, category, ...(paperLog ? { paperLog: '1' } : {}) })}`),
  ownStanding: () => violationRequest<OwnStanding | null>(`${ownViolationsBase}/standing`),
}

/** "1st warning", "2nd warning", "3rd warning", "4th warning", ... */
export function warningName(index: number) {
  const n = index + 1
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th warning`
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix} warning`
}
