import type { RowDataPacket } from 'mysql2/promise'
import type { FinanceFilters } from './printing.validation.ts'

/** Receipts are the confirmed financial record. Never count their cash source twice. */
export const printingRevenueSource = `
  SELECT CONCAT('R-',r.print_receipt_id) id,CONCAT('P-',r.request_id) request_id,
    'Online request'::text source,r.student_name_snapshot name,r.school_id_snapshot school_id,
    r.file_name_snapshot file_name,r.print_type_snapshot::text print_type,r.paper_size_snapshot::text paper_size,
    r.page_count_snapshot page_count,r.copies_snapshot number_of_copies,r.total_sheets_snapshot total_sheets,
    r.amount_received amount_paid,r.received_at received,r.received_by_name_snapshot received_by,r.payment_method::text payment_method
  FROM print_payment_receipts r WHERE r.receipt_status='Issued'
  UNION ALL
  SELECT CONCAT('C-',c.print_cash_payment_id),CONCAT('P-',p.request_id),'Online request',u.full_name,u.school_id,
    p.file_name,p.print_type::text,p.paper_size::text,p.page_count,p.number_of_copies,p.total_sheets,
    c.amount_paid,c.received_at,staff.full_name,'Cash'
  FROM print_cash_payments c JOIN print_requests p ON p.request_id=c.request_id
  JOIN users u ON u.user_id=p.user_id LEFT JOIN users staff ON staff.user_id=c.received_by_user_id
  WHERE NOT EXISTS (SELECT 1 FROM print_payment_receipts r WHERE r.print_cash_payment_id=c.print_cash_payment_id)
  UNION ALL
  SELECT CONCAT('H-',h.entry_id),CONCAT('H-',h.entry_id),'Historical entry',h.customer_name,u.school_id,
    h.description,h.print_type,h.paper_size,h.pages,h.copies,h.pages*h.copies,
    h.amount_paid,h.received_at AT TIME ZONE 'Asia/Manila',NULL::text,h.payment_method::text
  FROM historical_print_entries h LEFT JOIN users u ON u.user_id=h.user_id
  WHERE h.state='Active' AND h.payment_state='Confirmed'
`

/** Build cards and details from one database read, even when a payment commits mid-refresh. */
export function revenueSnapshot(entries: RowDataPacket[], filters: FinanceFilters) {
  const sum = (key: string) => entries.reduce((total, row) => total + Number(row[key] ?? 0), 0)
  const centavos = entries.reduce((total, row) => total + Math.round(Number(row.amount_paid) * 100), 0)
  return { entries, summary: {
    period: filters.period, label: filters.label, from: filters.from, to: filters.to,
    paid_requests: entries.length, total_sheets: sum('total_sheets'), total_copies: sum('number_of_copies'),
    total_revenue: centavos / 100,
  } }
}
