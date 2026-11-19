/** Real received principal only. Practice captures belong to a separate presentation projection. */
export function printingPaidSql(requestAlias = 'pr') {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(requestAlias)) throw new TypeError('Invalid printing SQL alias')
  const request = `${requestAlias}.request_id`
  return `CASE WHEN NOT EXISTS(SELECT 1 FROM print_payment_receipts paid_history WHERE paid_history.request_id=${request})
    AND NOT EXISTS(SELECT 1 FROM print_cash_payments cash_history WHERE cash_history.request_id=${request})
    AND ${requestAlias}.payment_status='Paid' THEN ${requestAlias}.calculated_cost
    ELSE COALESCE((SELECT SUM(paid_receipt.amount_received) FROM print_payment_receipts paid_receipt
      WHERE paid_receipt.request_id=${request} AND paid_receipt.receipt_status='Issued'),0)
    + COALESCE((SELECT SUM(legacy_cash.amount_paid) FROM print_cash_payments legacy_cash
      WHERE legacy_cash.request_id=${request} AND NOT EXISTS(SELECT 1 FROM print_payment_receipts matched_receipt
        WHERE matched_receipt.print_cash_payment_id=legacy_cash.print_cash_payment_id)),0) END`
}
