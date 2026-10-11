export const SUPPORTED_MATERIAL_TYPES = ['Book', 'Thesis/Manuscript'] as const
export type SupportedMaterialType = (typeof SUPPORTED_MATERIAL_TYPES)[number]

export type BorrowingPolicyMaterialRule = {
  materialType: SupportedMaterialType
  isBorrowable: boolean
}

export type BorrowingPolicyVersion = {
  versionId: number
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
  longOverdueAfterDays: number | null
  changeReason: string
  createdByUserId: number | null
  createdAt: string | Date
  materialRules: BorrowingPolicyMaterialRule[]
}

export type BorrowingPolicyDerivedStatus = 'active' | 'scheduled' | 'superseded'

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
  changeReason: string
  materialRules: BorrowingPolicyMaterialRule[]
}

export function roleBookLimit(policy: BorrowingPolicyVersion, role: string | null | undefined): number | null {
  if (role === 'Student') return policy.studentMaxActiveBooks
  if (role === 'Faculty') return policy.facultyMaxActiveBooks
  return null
}

export function roleReservationLimit(policy: BorrowingPolicyVersion, role: string | null | undefined): number | null {
  if (role === 'Student') return policy.studentMaxActiveReservations
  if (role === 'Faculty') return policy.facultyMaxActiveReservations
  return null
}

export function isMaterialBorrowable(policy: BorrowingPolicyVersion, materialType: string | null | undefined): boolean {
  if (!materialType) return false
  const rule = policy.materialRules.find((item) => item.materialType === materialType)
  return Boolean(rule?.isBorrowable)
}
