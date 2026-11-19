import type { MoneyOut } from './money-out.rules.ts'

export type RefundRequest = {
  id: string; requestKey: string; paymentId: string; accountId: number; userId: number
  kind: 'Printing' | 'Fine' | 'LostBook' | 'Other'; targetId: number; requestedBy: number; version: number
  principal: number; fee: number; reasonCode: string; reason: string
  state: 'PendingReview' | 'Approved' | 'Rejected' | 'Withdrawn'
  createdAt: string; updatedAt: string; reviewedBy?: number; reviewNote?: string; operationId?: string
  notified?: string
  events: Array<{ at: string; state: RefundRequest['state']; actorId: number; note?: string }>
}

export function requestStatus(row: RefundRequest, operation?: MoneyOut) {
  if (row.state === 'PendingReview') return 'Pending librarian review'
  if (row.state === 'Rejected') return 'Rejected'
  if (row.state === 'Withdrawn') return 'Request withdrawn'
  return ({ Draft: 'Awaiting final approval', Processing: 'Processing refund', Review: 'Needs review',
    Succeeded: operation && operation.principal < row.principal ? 'Partially refunded' : 'Refunded',
    Failed: 'Refund failed', Cancelled: 'Refund review cancelled', Reversed: 'Refund reversed' } as Record<string, string>)[operation?.state ?? ''] ?? 'Needs review'
}

export function requestPublic(row: RefundRequest, operation?: MoneyOut) {
  const { requestKey: _key, notified: _notified, reviewedBy: _reviewer, requestedBy: _requester, accountId: _account, userId: _user, ...safe } = row
  return { ...safe, requestedPrincipalCentavos: row.principal, requestedFeeCentavos: row.fee,
    approvedPrincipalCentavos: operation?.principal, approvedFeeCentavos: operation?.fee, approvedTotalCentavos: operation?.total, status: requestStatus(row, operation),
    reference: 'RR-' + row.id.slice(0, 8).toUpperCase(),
    events: row.events.map(({ at, state, note }) => ({ at, state, note })) }
}
