export const CASE_TYPES = ['Long Overdue', 'Damage'] as const
export type CaseType = (typeof CASE_TYPES)[number]

export const CASE_STATUSES = ['Open', 'Assigned', 'Under Investigation', 'Resolved', 'Dismissed', 'Reopened'] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const CASE_EVENT_TYPES = [
  'Opened', 'Assigned', 'Contact Attempted', 'Note Added', 'Inspection Recorded',
  'Disposition Recorded', 'Linked Lost Report', 'Resolved', 'Dismissed', 'Reopened',
] as const
export type CaseEventType = (typeof CASE_EVENT_TYPES)[number]

export const DAMAGE_DISPOSITIONS = ['repaired_available', 'damaged_held', 'missing_lost'] as const
export type DamageDisposition = (typeof DAMAGE_DISPOSITIONS)[number]

export const TERMINAL_CASE_STATUSES: CaseStatus[] = ['Resolved', 'Dismissed']

export type PublicCaseSummary = {
  caseId: number
  caseType: CaseType
  status: CaseStatus
  openedAt: string | Date
  instruction: string
}
