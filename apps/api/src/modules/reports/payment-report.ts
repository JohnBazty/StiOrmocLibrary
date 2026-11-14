type RecordRow=Record<string,unknown>

export const onlineReconciliationSql=`SELECT p.payment_id::text id,u.full_name name,a.school_id,
  CASE WHEN p.print_request_id IS NOT NULL THEN 'Printing' WHEN p.fine_id IS NOT NULL THEN 'Fine' ELSE 'Lost-book charge' END payment_for,
  p.state status,(p.principal_centavos::numeric/100)::numeric(14,2) principal,
  (p.fee_centavos::numeric/100)::numeric(14,2) transaction_fee,(p.total_centavos::numeric/100)::numeric(14,2) gross,
  p.channel_code payment_method,p.provider_payment_id provider_reference,p.review_code,
  to_char(p.updated_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') last_updated,
  (s.processing_cost_centavos::numeric/100)::numeric(14,2) processing_cost,(s.net_centavos::numeric/100)::numeric(14,2) net_settled,
  CASE WHEN s.payment_id IS NOT NULL THEN 'Library recorded' ELSE 'Not recorded' END settlement_status,
  s.provider_reference settlement_reference,'Sandbox test'::text environment,
  p.provider_payment_id IS NOT NULL AND p.state='Review' captured_needing_review,p.created_at AT TIME ZONE 'Asia/Manila' recorded_at
  FROM online_payment_attempts p JOIN users u ON u.user_id=p.user_id JOIN accounts a ON a.account_id=p.account_id
  LEFT JOIN online_payment_settlements s ON s.payment_id=p.payment_id WHERE p.environment='test' AND p.state<>'Quoted'`

/** Online instants use verified attempt time; legacy receipt dates keep their recorded local meaning. */
export function paymentReportSql(kind:'payments'|'printRevenue',online:boolean){
  const fine=kind==='payments',table=fine?'fine_payment_receipts':'print_payment_receipts',id=fine?'fine_payment_receipt_id':'print_receipt_id'
  const source="COALESCE(to_jsonb(r)->>'confirmation_source','Legacy')"
  const received=online?`CASE WHEN ${source}='Xendit' THEN p.updated_at AT TIME ZONE 'Asia/Manila' ELSE r.received_at END`:'r.received_at'
  const principal='r.amount_received',fee="(COALESCE((to_jsonb(r)->>'transaction_fee_centavos')::numeric,0)/100)::numeric(14,2)"
  const settlement=online?`(s.processing_cost_centavos::numeric/100)::numeric(14,2) processing_cost,(s.net_centavos::numeric/100)::numeric(14,2) net_settled,
    CASE WHEN s.payment_id IS NOT NULL THEN 'Library recorded' WHEN p.payment_id IS NOT NULL THEN 'Not recorded' ELSE 'Not applicable' END settlement_status,
    to_char(s.settled_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') settled,s.provider_reference settlement_reference`:
    "NULL::numeric processing_cost,NULL::numeric net_settled,'Not applicable'::text settlement_status,NULL::text settled,NULL::text settlement_reference"
  const main=`SELECT r.${id}::text id,r.receipt_number,u.full_name name,u.school_id,
    ${principal} principal,${fee} transaction_fee,(${principal}+${fee})::numeric(14,2) gross,r.payment_method,r.receipt_status status,
    CASE WHEN ${source}='Xendit' THEN 'Sandbox test' ELSE 'Library record' END environment,
    to_char(${received},'YYYY-MM-DD HH24:MI') received,${source} confirmation_source,
    ${online?'p.provider_payment_id':'NULL::text'} provider_reference,${settlement},
    ${fine?"'Not applicable'::text":"COALESCE(to_jsonb(pr)->>'entry_source','Recorded request')"} historical_entry,
    ${received} recorded_at
    FROM ${table} r JOIN users u ON u.user_id=r.user_id
    ${fine?'':'JOIN print_requests pr ON pr.request_id=r.request_id'}
    ${online?`LEFT JOIN online_payment_attempts p ON p.payment_id=r.online_payment_attempt_id
      LEFT JOIN online_payment_settlements s ON s.payment_id=p.payment_id`:''}`
  if(fine)return main
  // Cash rows predating receipts remain visible; a cash row with a receipt is represented by that receipt once.
  return main+` UNION ALL SELECT 'cash-'||c.print_cash_payment_id,NULL,u.full_name,u.school_id,
    c.amount_paid,0,c.amount_paid,'Cash','Issued','Library record',to_char(c.received_at,'YYYY-MM-DD HH24:MI'),'Legacy cash',NULL,
    NULL::numeric,NULL::numeric,'Not applicable',NULL,NULL,
    COALESCE(to_jsonb(pr)->>'entry_source','Legacy cash without receipt'),c.received_at
    FROM print_cash_payments c JOIN print_requests pr ON pr.request_id=c.request_id JOIN users u ON u.user_id=pr.user_id
    WHERE NOT EXISTS(SELECT 1 FROM print_payment_receipts r WHERE r.print_cash_payment_id=c.print_cash_payment_id)`
}

export function paymentReportMetrics(rows:RecordRow[]){
  const cents=(value:unknown)=>{const [whole,fraction='']=String(value??0).split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0').slice(0,2))}
  const result={principal:0n,transaction_fees:0n,gross:0n,processing_cost:0n,net_settled:0n,settlements_recorded:0}
  for(const row of rows){
    if(row.status!=='Issued')continue
    result.principal+=cents(row.principal);result.transaction_fees+=cents(row.transaction_fee);result.gross+=cents(row.gross)
    if(row.settlement_status==='Library recorded'){result.processing_cost+=cents(row.processing_cost);result.net_settled+=cents(row.net_settled);result.settlements_recorded++}
  }
  return {principal:Number(result.principal)/100,transaction_fees:Number(result.transaction_fees)/100,gross:Number(result.gross)/100,
    processing_cost:Number(result.processing_cost)/100,net_settled:Number(result.net_settled)/100,settlements_recorded:result.settlements_recorded}
}
