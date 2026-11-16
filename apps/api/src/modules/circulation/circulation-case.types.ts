export const CASE_STATUSES = ['Open', 'Assigned', 'Under Investigation', 'Resolved', 'Dismissed', 'Reopened'] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

/** Values allowed by the `circulation_case_events.event_type` check in migration 017. */
export type CaseEventType = 'Opened' | 'Note Added' | 'Disposition Recorded' | 'Linked Lost Report' | 'Resolved' | 'Dismissed' | 'Reopened'

/** `lost` writes the copy off and charges the borrower the book price (Ethan, 2026-11-11: no extra fee). */
export const DAMAGE_DISPOSITIONS = ['repaired_available', 'damaged_held', 'lost'] as const
export type DamageDisposition = (typeof DAMAGE_DISPOSITIONS)[number]

export const TERMINAL_CASE_STATUSES: readonly CaseStatus[] = ['Resolved', 'Dismissed']

/** `lost_book_reports.charge_resolution` for a charge taken from `titles.purchase_price`. */
export const BOOK_PRICE_RESOLUTION = 'Book Price'

export type PublicCaseSummary = {
  caseId: number
  caseType: 'Damage'
  status: CaseStatus
  openedAt: string | Date
  instruction: string
}
