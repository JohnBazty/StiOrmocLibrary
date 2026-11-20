export type BorrowingPolicyMaterialRule = {
  materialType: 'Book' | 'Thesis/Manuscript'
  isBorrowable: boolean
}

export type BorrowingPolicyVersion = {
  versionId: number
  displayName: string
  status: 'active' | 'scheduled' | 'superseded'
  effectiveOn: string
  studentMaxActiveBooks: number
  facultyMaxActiveBooks: number | null
  borrowingDays: number
  dueTimeCutoff: string
  dueCutoffLabel: string
  maxRenewals: number
  renewalExtensionDays: number
  studentMaxActiveReservations: number
  facultyMaxActiveReservations: number | null
  blockRenewalIfOverdue: boolean
  blockRenewalIfUnpaidFines: boolean
  blockRenewalIfReserved: boolean
  longOverdueAfterDays: number | null
  /** Desk windows as 'HH:MM'; shown as 12-hour times. Null: no limit. */
  borrowOpensAt?: string | null
  borrowClosesAt?: string | null
  returnOpensAt?: string | null
  returnClosesAt?: string | null
  changeReason: string
  createdByUserId: number | null
  createdAt: string
  materialRules: BorrowingPolicyMaterialRule[]
}

export type BorrowingPolicyList = {
  active: BorrowingPolicyVersion | null
  scheduled: BorrowingPolicyVersion[]
  history: BorrowingPolicyVersion[]
}

export type PublishBorrowingPolicyInput = {
  effectiveOn: string
  studentMaxActiveBooks: number
  facultyMaxActiveBooks: number | null
  borrowingDays: number
  dueTimeCutoff: string
  maxRenewals: number
  renewalExtensionDays: number
  studentMaxActiveReservations: number
  facultyMaxActiveReservations: number | null
  blockRenewalIfOverdue: boolean
  blockRenewalIfUnpaidFines: boolean
  blockRenewalIfReserved: boolean
  longOverdueAfterDays: number
  borrowOpensAt: string | null
  borrowClosesAt: string | null
  returnOpensAt: string | null
  returnClosesAt: string | null
  changeReason: string
  materialRules: BorrowingPolicyMaterialRule[]
}
