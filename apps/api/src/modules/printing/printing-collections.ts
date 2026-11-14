/** Issued principal once per receipt, with a fallback for cash history predating receipts. */
export function printingCollectionsSql(online:boolean){
  return `SELECT r.request_id,r.amount_received amount_paid,r.received_by_user_id,
    ${online?"CASE WHEN p.payment_id IS NOT NULL THEN p.updated_at AT TIME ZONE 'Asia/Manila' ELSE r.received_at END":'r.received_at'} received_at,
    r.payment_method,COALESCE((to_jsonb(r)->>'transaction_fee_centavos')::numeric,0)/100 transaction_fee,
    COALESCE((to_jsonb(r)->>'total_received')::numeric,r.amount_received) gross,
    ${online?'p.provider_payment_id':'NULL::text'} provider_reference,
    COALESCE(to_jsonb(r)->>'confirmation_source','Legacy') confirmation_source
    FROM print_payment_receipts r ${online?'LEFT JOIN online_payment_attempts p ON p.payment_id=r.online_payment_attempt_id':''}
    WHERE r.receipt_status='Issued'
    UNION ALL SELECT c.request_id,c.amount_paid,c.received_by_user_id,c.received_at,'Cash',0,c.amount_paid,NULL,'Legacy cash'
    FROM print_cash_payments c WHERE NOT EXISTS(SELECT 1 FROM print_payment_receipts r WHERE r.print_cash_payment_id=c.print_cash_payment_id)`
}
