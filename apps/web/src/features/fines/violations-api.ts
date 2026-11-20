import { getCsrfToken } from '../auth/auth-storage'

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
  schoolId: string
  category: string
  warningsUsed: number
  warningsBeforeFine: number
  fineAmount: number
  amount: number | null
  /** What a record saved now would be: First warning, Second warning, Final warning or Fine. */
  nextStep: 'First warning' | 'Second warning' | 'Final warning' | 'Fine'
  fromPaperLog: boolean
  categoryActive: boolean
  earlierWarnings: { count: number; reviewedAt: string } | null
  history: Array<{ incidentId: number; date: string; step: string; source: 'Recorded' | 'Paper log' }>
  reviewToken: string
}

export type OwnStanding = { category: string; warningsUsed: number; warningsBeforeFine: number; warningsLeft: number; fineAmount: number }

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
  ownStanding: () => violationRequest<OwnStanding[]>(`${ownViolationsBase}/standing`),
}

/** "1st warning", "2nd warning", "3rd warning". */
export const warningName = (index: number) => `${['1st', '2nd', '3rd', '4th'][index] ?? `${index + 1}th`} warning`
