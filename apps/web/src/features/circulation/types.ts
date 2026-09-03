export type BorrowStatus = 'Pending' | 'Borrowed' | 'Active' | 'Overdue' | 'Returned' | 'Cancelled'

export type BorrowingHistoryData = {
  summary: {
    role: string; activeLoans: number; activeReservations: number; activeStackCount: number
    loanLimit: number | null; remainingLoanSlots: number | null; nextDueAt: string | null; dueCutoffLabel: string
  }
  items: Array<{
    transactionId: number; titleId: number | null; title: string; author: string; coverImagePath: string | null; accessionNumber: string | null; barcode: string | null
    borrowDate: string | null; dueDate: string | null; returnDate: string | null; status: BorrowStatus; lostReportStatus: string | null
  }>
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
