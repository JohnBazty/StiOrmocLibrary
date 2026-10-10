export type BorrowStatus = 'Pending' | 'Borrowed' | 'Active' | 'Overdue' | 'Returned' | 'Cancelled'

export type BorrowingHistoryData = {
  summary: {
    role: string; activeLoans: number; activeReservations: number; activeStackCount: number
    loanLimit: number | null; remainingLoanSlots: number | null; nextDueAt: string | null; dueCutoffLabel: string
  }
  items: Array<{
    transactionId: number; titleId: number | null; title: string; author: string; coverImagePath: string | null; accessionNumber: string | null; barcode: string | null
    borrowDate: string | null; dueDate: string | null; returnDate: string | null; status: BorrowStatus; lostReportStatus: string | null
    caseSummary: {
      caseId: number
      caseType: 'Long Overdue' | 'Damage'
      status: string
      openedAt: string
      instruction: string
    } | null
  }>
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export type CirculationCaseListItem = {
  caseId: number
  caseType: 'Long Overdue' | 'Damage'
  status: string
  transactionId: number
  borrowerName: string
  borrowerSchoolId: string
  title: string
  barcode: string
  accessionNumber: string | null
  openedAt: string
  latestEventType: string | null
  assignedToUserId: number | null
  summary: string | null
}

export type CirculationCaseListData = {
  items: CirculationCaseListItem[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export type CirculationMonitorData = {
  summary: { pendingClaims: number; activeLoans: number; overdueLoans: number; returnedToday: number; dueToday: number }
  items: Array<{
    transactionId: number; userName: string; schoolId: string; role: string; title: string
    accessionNumber: string | null; barcode: string; requestedAt: string; borrowDate: string | null; dueDate: string | null
    returnDate: string | null; status: BorrowStatus
  }>
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
