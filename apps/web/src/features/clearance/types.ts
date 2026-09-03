export type ClearanceRecord = {
  student: { userId: number; schoolId: string; name: string; program: string | null; section: string | null; accountStatus: string }
  status: 'Cleared' | 'Not Cleared'; computedStatus: 'Cleared' | 'Not Cleared'; reason: string; checkedAt: string
  summary: { activeLoans: number; unpaidOverdueFines: number; unpaidReplacementCharges: number; totalOutstanding: number; blockCount: number }
  loans: Array<{ transactionId: number; title: string; accessionNumber: string | null; status: string; borrowedAt: string | null; dueAt: string | null; overdueHours: number; currentFine: number }>
  fines: Array<{ fineId: number; transactionId: number | null; title: string; amount: number; basis: string; overdueUnits: number; rate: number; appliedAt: string; notes: string | null }>
  lostBooks: Array<{ lostBookReportId: number; transactionId: number; title: string; status: string; purchasePrice: number | null; replacementCharge: number; paymentStatus: string; reportedAt: string; verifiedAt: string | null }>
  activeOverride: null | { overrideId: number; status: string; reason: string; appliedAt: string; expiresAt: string | null; appliedBy: string }
  overrideHistory: Array<{ overrideId: number; status: string; reason: string; appliedAt: string; expiresAt: string | null; revokedAt: string | null; revocationReason: string | null; appliedBy: string; revokedBy: string | null }>
}
export type ClearanceList = { summary: { totalStudents: number; cleared: number; pending: number; activeOverrides: number }; items: ClearanceRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
