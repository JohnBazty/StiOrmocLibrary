/** Presentation credits for local development only; never receipt allocations. */
export type PreviewCredit = { kind: 'Fine' | 'Printing' | 'LostBook'; targetId: number; principalCentavos: number; paymentId: string; voided?: boolean }

export function previewCredit(credits: PreviewCredit[], kind: PreviewCredit['kind'], targetId: number, balanceCentavos: number) {
  const matches = credits.filter(row => row.kind === kind && row.targetId === targetId)
  const total = matches.reduce((sum, row) => sum + row.principalCentavos, 0)
  return { applied: Math.min(Math.max(0, balanceCentavos), total), paymentId: matches.at(-1)?.paymentId }
}

type Fine = { fineId: number | null; lostBookReportId: number | null; balance: number; paid: number; status: string; paymentAllowed: boolean }
export function previewFine<T extends Fine>(fine: T, credits: PreviewCredit[]): T & { localPaymentId?: string } {
  if (['Waived', 'Voided'].includes(fine.status)) return fine
  const kind = fine.fineId ? 'Fine' : 'LostBook', target = fine.fineId ?? fine.lostBookReportId!
  const { applied, paymentId } = previewCredit(credits, kind, target, Math.round(fine.balance * 100))
  if (!applied) return fine
  const remaining = Math.max(0, Math.round(fine.balance * 100) - applied)
  const paid = previewCredit(credits.filter(row => !row.voided), kind, target, applied).applied
  return { ...fine, paid: (Math.round(fine.paid * 100) + paid) / 100, balance: remaining / 100,
    status: remaining === 0 ? paid < applied ? 'Voided' : 'Paid' : fine.status === 'Accruing' ? 'Accruing' : 'Partially Paid',
    paymentAllowed: fine.paymentAllowed && remaining > 0, localPaymentId: paymentId }
}

type Print = { request_id: number | string; calculated_cost: number | string; payment_status: string; job_status: string }
export function previewPrint<T extends Print>(print: T, credits: PreviewCredit[]): T & { localPaymentId?: string } {
  const amount = Math.round(Number(print.calculated_cost) * 100)
  const refund = credits.find(row => row.kind === 'Printing' && row.targetId === Number(print.request_id) && row.voided && row.principalCentavos > 0)
  if (refund) return { ...print, job_status: 'Cancelled', payment_status: 'Refunded', localPaymentId: refund.paymentId }
  if (print.payment_status === 'Paid' || print.job_status === 'Cancelled') return print
  const { applied, paymentId } = previewCredit(credits, 'Printing', Number(print.request_id), amount)
  return applied > 0 && applied === amount ? { ...print, payment_status: 'Paid', localPaymentId: paymentId } : print
}
