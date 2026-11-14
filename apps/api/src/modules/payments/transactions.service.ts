import { db, type Pool, type RowDataPacket } from '../../config/db.js'
import { paymentError, positiveId } from './payments.validation.ts'
import { publicPayment, type PaymentActor } from './payments.service.ts'

export function transactionFilters(query: Record<string, unknown>) {
  const channel = query.channel ?? 'all', search = query.search ?? ''
  const page = Number(query.page ?? 1), limit = Number(query.limit ?? 12)
  if (!['all', 'Online', 'Onsite'].includes(String(channel)) || typeof channel !== 'string'
    || typeof search !== 'string' || search.length > 120
    || !Number.isSafeInteger(page) || page < 1 || page > 10000
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw paymentError('Choose valid transaction filters.')
  return { channel, search: search.trim(), page, limit }
}

export function createTransactionsService(database: Pool = db) {
  return {
    async list(actor: PaymentActor, query: Record<string, unknown>, preview: unknown[] = []) {
      if (!['Student', 'Faculty'].includes(String(actor.role))) throw paymentError('Use a borrower account.', 'PAYMENT_ROLE_FORBIDDEN', 403)
      const accountId = positiveId(actor.accountId), filters = transactionFilters(query)
      const [owners] = await database.execute<RowDataPacket[]>(`SELECT a.user_id FROM accounts a JOIN users u USING(user_id)
        WHERE a.account_id=? AND a.role=? AND a.account_status='Active' AND u.account_status='Active'`, [accountId, actor.role])
      if (!owners.length) throw paymentError('Sign in again.', 'PAYMENT_OWNER_UNAVAILABLE', 401)
      const userId = Number(owners[0].user_id)
      const [tables] = await database.execute<RowDataPacket[]>("SELECT to_regclass('public.online_payment_attempts') IS NOT NULL AS installed")
      const onsite = (table: string, id: string, kind: string, description: string) => `SELECT '${kind}:'||r.${id} AS id,
        'Onsite'::text AS channel,'${kind}'::text AS kind,${description} AS description,
        COALESCE(r.receipt_number,'Payment record') AS reference,r.payment_method AS method,r.receipt_status AS status,
        (r.received_at AT TIME ZONE 'UTC') AS occurred_at,
        round(COALESCE((to_jsonb(r)->>'total_received')::numeric,r.amount_received)*100)::bigint AS amount_centavos,
        round(r.amount_received*100)::bigint AS principal_centavos,
        COALESCE((to_jsonb(r)->>'transaction_fee_centavos')::bigint,0) AS fee_centavos,
        r.${id}::bigint AS receipt_id,NULL::jsonb AS payment
        FROM ${table} r WHERE r.user_id=? AND COALESCE(to_jsonb(r)->>'confirmation_source','Legacy')<>'Xendit'`
      const sources = [onsite('fine_payment_receipts', 'fine_payment_receipt_id', 'Fine', "'Fine payment'::text"),
        onsite('print_payment_receipts', 'print_receipt_id', 'Printing', "COALESCE(to_jsonb(r)->>'file_name_snapshot',to_jsonb(r)->>'file_name','Printing payment')")]
      const values: unknown[] = [userId, userId]
      if (tables[0]?.installed) {
        sources.push(`SELECT 'Online:'||p.payment_id,'Online',CASE WHEN p.print_request_id IS NOT NULL THEN 'Printing' WHEN p.fine_id IS NOT NULL THEN 'Fine' ELSE 'LostBook' END,
          CASE WHEN p.print_request_id IS NOT NULL THEN 'Printing payment' ELSE 'Fine payment' END,
          COALESCE((SELECT r.receipt_number FROM print_payment_receipts r WHERE r.online_payment_attempt_id=p.payment_id),
            (SELECT r.receipt_number FROM fine_payment_receipts r WHERE r.online_payment_attempt_id=p.payment_id),'Online payment'),
          p.channel_code,p.state,p.created_at,p.total_centavos,p.principal_centavos,p.fee_centavos,
          COALESCE((SELECT r.print_receipt_id FROM print_payment_receipts r WHERE r.online_payment_attempt_id=p.payment_id),
            (SELECT r.fine_payment_receipt_id FROM fine_payment_receipts r WHERE r.online_payment_attempt_id=p.payment_id)),to_jsonb(p)
          FROM online_payment_attempts p WHERE p.account_id=? AND p.user_id=? AND p.state<>'Quoted'`)
        values.push(accountId, userId)
      }
      sources.push(`SELECT id,channel,kind,description,reference,method,status,occurred_at,amount_centavos,principal_centavos,fee_centavos,receipt_id,payment
        FROM jsonb_to_recordset(?::jsonb) AS sample(id text,channel text,kind text,description text,reference text,method text,status text,
          occurred_at timestamptz,amount_centavos bigint,principal_centavos bigint,fee_centavos bigint,receipt_id bigint,payment jsonb)`)
      values.push(JSON.stringify(preview))
      const where = `(?='all' OR channel=?) AND (?='' OR position(lower(?) IN lower(description||' '||reference||' '||method))>0)`
      const cte = `WITH transactions AS (${sources.join(' UNION ALL ')})`
      const filtersValues = [filters.channel, filters.channel, filters.search, filters.search]
      const [counts] = await database.execute<RowDataPacket[]>(`${cte} SELECT count(*)::int AS total FROM transactions WHERE ${where}`, [...values, ...filtersValues])
      const [rows] = await database.execute<RowDataPacket[]>(`${cte} SELECT * FROM transactions WHERE ${where}
        ORDER BY occurred_at DESC,id LIMIT ? OFFSET ?`, [...values, ...filtersValues, filters.limit, (filters.page - 1) * filters.limit])
      return { items: rows.map(row => ({ id: row.id, channel: row.channel, kind: row.kind, description: row.description,
        reference: row.reference, method: row.method, status: row.status, date: row.occurred_at,
        amountCentavos: Number(row.amount_centavos), principalCentavos: Number(row.principal_centavos), feeCentavos: Number(row.fee_centavos),
        receiptId: row.receipt_id ? Number(row.receipt_id) : null,
        payment: row.payment ? (row.payment.localPreview ? row.payment : publicPayment({ ...row.payment, receipt_id: row.receipt_id })) : null })),
        pagination: { page: filters.page, limit: filters.limit, total: Number(counts[0]?.total ?? 0) } }
    },
  }
}
