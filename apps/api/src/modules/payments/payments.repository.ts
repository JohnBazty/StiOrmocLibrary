import type { PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import type { parseQuote, parsePaymentFilters } from './payments.validation.ts'

export type PaymentTarget = Pick<ReturnType<typeof parseQuote>, 'kind' | 'targetId'>
export type PaymentRow = RowDataPacket & {
  payment_id: string; account_id: number; user_id: number; environment: string
  print_request_id: number | null; fine_id: number | null; lost_book_report_id: number | null
  fee_rule_id: number; channel_code: string; principal_centavos: string
  fee_centavos: string; total_centavos: string; balance_before_centavos: string
  state: string; request_key: string | null; expires_at: Date; created_at: Date
}

const targetColumn = { Printing: 'print_request_id', Fine: 'fine_id', LostBook: 'lost_book_report_id' } as const
type Query = Pick<PoolConnection, 'execute'>

export function createPaymentsRepository(query: Query) {
  async function first<T extends RowDataPacket = RowDataPacket>(sql: string, values: unknown[]) {
    const [rows] = await query.execute<T[]>(sql, values)
    return rows[0] ?? null
  }
  async function inserted(sql: string, values: unknown[]) {
    const [result] = await query.execute<ResultSetHeader>(sql, values)
    return result.rows[0]
  }

  return {
    owner: (accountId: number) => first(`SELECT a.user_id,a.role FROM accounts a
      JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? AND a.account_status='Active'
      AND u.account_status='Active' FOR UPDATE OF a`, [accountId]),

    async charge(target: PaymentTarget, userId: number) {
      if (target.kind === 'Printing') return first(`SELECT pr.calculated_cost::text AS assessed,
        CASE WHEN pr.payment_status='Paid' THEN pr.calculated_cost ELSE 0 END::text AS paid,
        '0' AS adjusted,pr.payment_status AS status,pr.job_status,false AS accruing
        FROM print_requests pr WHERE pr.request_id=? AND pr.user_id=? FOR UPDATE`, [target.targetId,userId])
      if (target.kind === 'Fine') return first(`SELECT f.fine_amount::text AS assessed,f.payment_status AS status,
        COALESCE((SELECT SUM(a.amount_allocated) FROM fine_payment_allocations a
          JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id
          WHERE a.fine_id=f.fine_id AND r.receipt_status='Issued'),0)::text AS paid,
        COALESCE((SELECT SUM(amount_adjusted) FROM fine_adjustments WHERE fine_id=f.fine_id),0)::text AS adjusted,
        COALESCE(f.fine_type='Overdue' AND bt.transaction_status IN ('Borrowed','Overdue')
          AND bt.lost_confirmed_at IS NULL,false) AS accruing
        FROM fines f LEFT JOIN borrow_transactions bt ON bt.transaction_id=f.transaction_id
        WHERE f.fine_id=? AND f.user_id=? FOR UPDATE OF f`, [target.targetId,userId])
      return first(`SELECT l.replacement_charge::text AS assessed,l.payment_status AS status,'0' AS adjusted,
        COALESCE((SELECT SUM(a.amount_allocated) FROM fine_payment_allocations a
          JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id
          WHERE a.lost_book_report_id=l.lost_book_report_id AND r.receipt_status='Issued'),0)::text AS paid,
        false AS accruing FROM lost_book_reports l WHERE l.lost_book_report_id=? AND l.user_id=?
        AND l.report_status='Confirmed' FOR UPDATE`, [target.targetId,userId])
    },

    fee: (channel: string) => first(`SELECT * FROM online_payment_fee_rules
      WHERE environment='test' AND channel_code=? ORDER BY fee_rule_id DESC LIMIT 1`, [channel]),

    async insertQuote(input: {accountId:number;userId:number;target:PaymentTarget;ruleId:number;channel:string;
      principal:bigint;fee:bigint;total:bigint;balance:bigint;now:Date;expires:Date}) {
      return inserted(`INSERT INTO online_payment_attempts(account_id,user_id,environment,
        ${targetColumn[input.target.kind]},fee_rule_id,channel_code,principal_centavos,fee_centavos,
        total_centavos,balance_before_centavos,created_at,updated_at,expires_at)
        VALUES (?,?,'test',?,?,?,?,?,?,?,?,?,?) RETURNING *`,
        [input.accountId,input.userId,input.target.targetId,input.ruleId,input.channel,
          input.principal.toString(),input.fee.toString(),input.total.toString(),input.balance.toString(),
          input.now,input.now,input.expires]) as Promise<PaymentRow>
    },

    payment: (id: string, accountId: number) => first<PaymentRow>(
      "SELECT * FROM online_payment_attempts WHERE payment_id=? AND account_id=? AND environment='test' FOR UPDATE", [id,accountId]),
    retry: (key: string, accountId: number) => first<PaymentRow>(
      "SELECT * FROM online_payment_attempts WHERE account_id=? AND environment='test' AND request_key=?", [accountId,key]),

    async expirePrepared(target: PaymentTarget, now: Date) {
      await query.execute(`UPDATE online_payment_attempts SET state='Expired',updated_at=?
        WHERE environment='test' AND ${targetColumn[target.kind]}=? AND state='Prepared'
        AND provider_session_id IS NULL AND provider_payment_id IS NULL AND expires_at<=?`, [now,target.targetId,now])
    },
    active: (target: PaymentTarget) => first<PaymentRow>(`SELECT * FROM online_payment_attempts
      WHERE environment='test' AND ${targetColumn[target.kind]}=?
      AND state IN ('Prepared','Creating','Active','Review') FOR UPDATE`, [target.targetId]),
    async prepare(id: string, key: string, now: Date, expires: Date) {
      const [result] = await query.execute<ResultSetHeader>(`UPDATE online_payment_attempts
        SET state='Prepared',request_key=?,updated_at=?,expires_at=? WHERE payment_id=? AND state='Quoted' RETURNING *`,
        [key,now,expires,id])
      return result.rows[0] as PaymentRow
    },
    feeRetry: (accountId: number, key: string) => first(
      'SELECT * FROM online_payment_fee_rules WHERE created_by_account_id=? AND request_key=?', [accountId,key]),
    async insertFee(accountId: number, rule: {channelCode:string;displayName:string;fixed:bigint;percentage:number;tax:number;min:bigint;max:bigint;requestKey:string}) {
      return inserted(`INSERT INTO online_payment_fee_rules(environment,channel_code,display_name,fixed_centavos,
        percentage_basis_points,tax_basis_points,min_total_centavos,max_total_centavos,is_sample,
        created_by_account_id,request_key) VALUES ('test',?,?,?,?,?,?,?,true,?,?) RETURNING *`,
        [rule.channelCode,rule.displayName,rule.fixed.toString(),rule.percentage,rule.tax,rule.min.toString(),
          rule.max.toString(),accountId,rule.requestKey])
    },
    async list(filters: ReturnType<typeof parsePaymentFilters>) {
      const values: unknown[] = ['test']
      const where = filters.state ? 'environment=? AND state=?' : 'environment=?'
      if (filters.state) values.push(filters.state)
      const [rows] = await query.execute<PaymentRow[]>(`SELECT * FROM online_payment_attempts
        WHERE ${where} ORDER BY created_at DESC,payment_id LIMIT ? OFFSET ?`,
        [...values,filters.limit,(filters.page-1)*filters.limit])
      const count = await first(`SELECT COUNT(*)::int AS count FROM online_payment_attempts WHERE ${where}`,values)
      return { rows, total: Number(count?.count ?? 0) }
    },
  }
}
