export type BorrowStatus = 'Pending' | 'Borrowed' | 'Active' | 'Overdue' | 'Returned' | 'Cancelled' | 'Lost'

export type BorrowingHistoryData = {
  summary: {
    role: string; activeLoans: number; activeReservations: number; activeStackCount: number
    loanLimit: number | null; remainingLoanSlots: number | null; nextDueAt: string | null; dueCutoffLabel: string
  }
  items: Array<{
    transactionId: number; titleId: number | null; title: string; author: string; coverImagePath: string | null; accessionNumber: string | null; barcode: string | null
    borrowDate: string | null; dueDate: string | null; returnDate: string | null; status: BorrowStatus; lostReportStatus: string | null
    caseSummary?: { caseId: number; caseType: 'Damage'; status: string; openedAt: string; instruction: string } | null
  }>
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export type DamageCaseListItem = {
  caseId: number; caseType: 'Damage'; transactionId: number; status: string; openedAt: string; summary: string | null
  title: string; barcode: string; borrowerName: string; borrowerSchoolId: string; lostBookReportId: number | null
}
export type DamageCaseListData = { items: DamageCaseListItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
export type DamageCaseDetail = {
  case: Pick<DamageCaseListItem, 'caseId' | 'status' | 'summary' | 'lostBookReportId'>
  loan: {
    status: string; title: string; titlePrice: number | null; barcode: string; conditionStatus: string; availabilityStatus: string
    borrowerName: string; borrowerSchoolId: string; replacementCharge: number | null; replacementPaymentStatus: string | null
  } | null
  events: Array<{ eventId: number; eventType: string; actorName: string | null; notes: string | null; reason: string | null; createdAt: string }>
}
export type DamageDisposition = 'repaired_available' | 'damaged_held' | 'lost'

export type CirculationMonitorData = {
  summary: { pendingClaims: number; activeLoans: number; overdueLoans: number; returnedToday: number; dueToday: number }
  items: Array<{
    transactionId: number; reservationId?:number|null; userName: string; schoolId: string; role: string; title: string
    accessionNumber: string | null; barcode: string; requestedAt: string; borrowDate: string | null; dueDate: string | null
    returnDate: string | null; status: BorrowStatus
  }>
  requests?: Array<{requestKind?:'Reservation'|'CartHandover';reservationId:number;userName:string;schoolId:string;role:string;title:string;barcode:string;accessionNumber:string|null;requestedAt:string;pickupDeadline:string|null}>
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export type CheckoutFlow = 'claim' | 'walk_in'
export type PreflightDecision = 'ready' | 'confirmation_required' | 'blocked'
export type PreflightFinding = { code: string; message: string }

export type CheckoutPreflightData = {
  decision: PreflightDecision
  expiresAt: string | null
  borrower: { userId: number; schoolId: string; name: string; role: string } | null
  copy: {
    physicalCopyId: number
    barcode: string
    accessionNumber: string
    title: string
    condition: string
    availability: string
  } | null
  dueAt: string
  blockers: PreflightFinding[]
  warnings: PreflightFinding[]
  alerts: PreflightFinding[]
  preflightToken: string | null
}

export type CheckoutConfirmationInput = {
  barcode: string
  schoolId: string
  preflightToken?: string | null
  overrideReason?: string | null
}
