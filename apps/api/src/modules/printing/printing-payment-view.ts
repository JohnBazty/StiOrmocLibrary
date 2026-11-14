export type PrintingPaymentView = {
  request_id: number; user_id: number; payment_status: string; local_payment_id: string
  refund_pending: boolean; cancel_job: boolean; paid_at?: string
  paid_centavos?:number
}

/** Local presentation only. Ownership joins prevent a reused target ID affecting another borrower. */
export const printingPaymentViewSql = `WITH projected_print_requests AS (
  SELECT (jsonb_populate_record(NULL::print_requests,to_jsonb(pr)||
    CASE WHEN p.request_id IS NOT NULL AND (pr.payment_status<>'Paid' OR p.payment_status IN ('Refunded','Refund pending'))
      THEN jsonb_build_object('payment_status',CASE WHEN p.payment_status='Paid' AND COALESCE(p.paid_centavos,0)<round(pr.calculated_cost*100) THEN 'Unpaid' ELSE p.payment_status END,'job_status',CASE WHEN p.cancel_job THEN 'Cancelled' ELSE pr.job_status END,
        'paid_at',COALESCE(to_jsonb(pr)->>'paid_at',p.paid_at)) ELSE '{}'::jsonb END)).*,
    p.local_payment_id,COALESCE(p.refund_pending,false) AS refund_pending
  FROM print_requests pr LEFT JOIN jsonb_to_recordset(?::jsonb)
    AS p(request_id int,user_id int,payment_status text,local_payment_id text,refund_pending boolean,cancel_job boolean,paid_at text,paid_centavos bigint)
    ON p.request_id=pr.request_id AND p.user_id=pr.user_id
)`
