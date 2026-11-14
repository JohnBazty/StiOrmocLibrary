import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { localPaymentPreview } from './payments.preview.ts'
import { previewCredit, type PreviewCredit } from './preview-balances.ts'

type Executor = Pick<Pool | PoolConnection, 'execute'>

/** Internal callers resolve the borrower from a trusted account or loan first. */
export async function borrowerPaymentCredits(q: Executor, userId: number, accountId?: number): Promise<PreviewCredit[]> {
  if (!localPaymentPreview) return []
  if (!accountId) {
    const [accounts] = await q.execute<RowDataPacket[]>(
      "SELECT account_id FROM accounts WHERE user_id=? AND role IN ('Student','Faculty') ORDER BY account_id LIMIT 1", [userId])
    accountId = Number(accounts[0]?.account_id)
  }
  return accountId ? localPaymentPreview.borrowerCredits(accountId, userId) : []
}

/** Match credits per charge, after cash receipts/adjustments; never subtract a wallet total. */
export async function borrowerBalances(q: Executor, userId: number, credits: PreviewCredit[] = []) {
  const [fines] = await q.execute<RowDataPacket[]>(`SELECT f.fine_id,
    GREATEST(f.fine_amount-COALESCE(p.paid,0)-COALESCE(x.adjusted,0),0) AS balance
    FROM fines f LEFT JOIN (SELECT a.fine_id,SUM(a.amount_allocated) AS paid FROM fine_payment_allocations a
      JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued'
      GROUP BY a.fine_id) p ON p.fine_id=f.fine_id
    LEFT JOIN (SELECT fine_id,SUM(amount_adjusted) AS adjusted FROM fine_adjustments GROUP BY fine_id) x ON x.fine_id=f.fine_id
    WHERE f.user_id=? AND f.payment_status IN ('Accruing','Unpaid','Partially Paid')`, [userId])
  const [losses] = await q.execute<RowDataPacket[]>(`SELECT l.lost_book_report_id,
    GREATEST(l.replacement_charge-COALESCE(p.paid,0),0) AS balance
    FROM lost_book_reports l LEFT JOIN (SELECT a.lost_book_report_id,SUM(a.amount_allocated) AS paid FROM fine_payment_allocations a
      JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued'
      GROUP BY a.lost_book_report_id) p ON p.lost_book_report_id=l.lost_book_report_id
    WHERE l.user_id=? AND l.report_status='Confirmed' AND l.payment_status NOT IN ('Paid','Waived')`, [userId])
  const remaining = (rows: RowDataPacket[], kind: 'Fine' | 'LostBook', key: string) => rows.reduce((sum, row) => {
    const balance = Math.max(0, Math.round(Number(row.balance ?? 0) * 100))
    return sum + balance - previewCredit(credits, kind, Number(row[key]), balance).applied
  }, 0)
  const finesCentavos = remaining(fines, 'Fine', 'fine_id')
  const replacementCentavos = remaining(losses, 'LostBook', 'lost_book_report_id')
  return { finesCentavos, replacementCentavos, totalCentavos: finesCentavos + replacementCentavos }
}
