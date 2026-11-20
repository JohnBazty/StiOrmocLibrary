import { printingPaidSql } from './printing-paid.ts'
import { effectivePaperPrice } from './paper-pricing.ts'
import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import {printingCollectionsSql} from './printing-collections.ts'
import {
  currentDate,
  dateAddDays,
  monthStart as startOfMonth,
  sumEquals,
  formatDate,
} from '../../config/sql-dialect.js'
import type { FinanceFilters, QueueFilters } from './printing.validation.ts'
import { printingPaymentViewSql, type PrintingPaymentView } from './printing-payment-view.ts'

const dayAfter = (placeholder = '?') => dateAddDays(placeholder, 1)
const monthStart = startOfMonth()
// Postgres can read this optional Phase 2 field from the row without referencing a missing column.
const receiptDocumentLabel = "to_jsonb(r)->>'document_label' AS document_label"
const latestReceiptJoin = `LEFT JOIN LATERAL (SELECT * FROM print_payment_receipts receipt WHERE receipt.request_id=pr.request_id ORDER BY receipt.print_receipt_id DESC LIMIT 1) r ON TRUE`
const deferredJoin = 'LEFT JOIN print_deferred_approvals d ON d.request_id=pr.request_id'
const actualPaidSql = `(SELECT ${printingPaidSql('real_print')} FROM print_requests real_print WHERE real_print.request_id=pr.request_id)`
const paymentFields = `${actualPaidSql} AS amount_paid,GREATEST(0,pr.calculated_cost-(${actualPaidSql})-COALESCE((to_jsonb(pr)->>'online_paid_centavos')::numeric,0)/100) AS balance,
  COALESCE(to_jsonb(pr)->>'preferred_payment_method','Online') AS preferred_payment_method,
  (SELECT payment_id FROM print_payment_proofs proof WHERE proof.request_id=pr.request_id ORDER BY proof.created_at DESC LIMIT 1) AS proof_payment_id,d.version AS deferred_version,d.reason AS deferred_reason,d.agreed_payment_date,d.approved_at AS deferred_approved_at,d.acknowledged_at AS deferred_acknowledged_at,d.revoked_at AS deferred_revoked_at,
  (d.request_id IS NOT NULL AND d.revoked_at IS NULL AND d.acknowledged_at IS NOT NULL AND d.assessed_amount=pr.calculated_cost AND d.pricing_snapshot IS NOT DISTINCT FROM pr.pricing_snapshot) AS pay_later_accepted`
const receiptPaymentDetails = `COALESCE((to_jsonb(r)->>'transaction_fee_centavos')::bigint,0) AS transaction_fee_centavos,
  COALESCE((to_jsonb(r)->>'total_received')::numeric,r.amount_received) AS total_received,
  COALESCE(to_jsonb(r)->>'confirmation_source','Legacy') AS confirmation_source`

export class PrintingRepository {
  readonly pool: Pool
  constructor(pool: Pool = db) { this.pool = pool }

  private async collectionSource(){
    const [rows]=await this.pool.execute<RowDataPacket[]>("SELECT to_regclass('online_payment_attempts') IS NOT NULL AS installed")
    return printingCollectionsSql(Boolean(rows[0]?.installed))
  }

  async userBySchoolId(schoolId: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT user_id, school_id, full_name, user_role, account_status FROM users WHERE school_id=? LIMIT 1', [schoolId])
    return rows[0] ?? null
  }

  async serviceStatus() {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT accepting_requests,unavailable_reason,updated_at FROM printing_service_settings WHERE settings_id=1 LIMIT 1`)
    return rows[0] ?? { accepting_requests: 1, unavailable_reason: null, updated_at: null }
  }

  async pricing() {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT r.pricing_rule_id,r.print_type,r.paper_size,${effectivePaperPrice} AS price_per_page,b.paper_brand_stock_id AS price_brand_stock_id,b.brand AS paper_brand,d.width,d.height,d.dimension_unit FROM print_pricing_rules r
      JOIN bond_paper_stocks p ON p.paper_size_dimension=r.paper_size LEFT JOIN paper_brand_stocks b ON b.paper_brand_stock_id=p.loaded_paper_brand_stock_id AND b.deleted_at IS NULL LEFT JOIN print_supply_details d ON d.paper_stock_id=p.paper_stock_id
      WHERE r.is_active=1 AND p.is_active=TRUE AND p.deleted_at IS NULL AND (${effectivePaperPrice})>0 ORDER BY r.print_type,r.paper_size`)
    return rows
  }

  async ownRequests(schoolId: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT pr.request_id,pr.documents_expired_at,pr.document_retention_hold,pr.row_version,pr.service_kind,pr.output_mode,pr.pricing_review_state,pr.pricing_snapshot,pr.page_findings,pr.paper_brand_snapshot,pr.file_name,pr.number_of_copies,pr.print_type,pr.paper_size,pr.page_count,pr.total_sheets,pr.calculated_cost,pr.payment_status,pr.job_status,pr.created_at,pr.started_at,pr.ready_at,pr.completed_at,pr.cancelled_at,pr.cancelled_reason,${paymentFields},
        r.print_receipt_id,r.receipt_number,r.verification_code,r.receipt_status,r.received_at receipt_issued_at
      FROM print_requests pr JOIN users u ON u.user_id=pr.user_id
      ${latestReceiptJoin} ${deferredJoin}
      WHERE u.school_id=? ORDER BY pr.created_at DESC,pr.request_id DESC`, [schoolId])
    return rows
  }

  async latestOpenForUser(userId: number, views: PrintingPaymentView[] = []) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`${printingPaymentViewSql}
      SELECT pr.request_id,pr.documents_expired_at,pr.document_retention_hold,pr.row_version,pr.service_kind,pr.output_mode,pr.pricing_review_state,pr.pricing_snapshot,pr.page_findings,pr.paper_brand_snapshot,pr.file_name,pr.number_of_copies,pr.print_type,pr.calculated_cost,pr.job_status,
        ${formatDate('pr.created_at', 'YYYY-MM-DD HH12:MI AM')} created_at
      FROM projected_print_requests pr WHERE pr.user_id=? AND pr.job_status NOT IN ('Completed','Cancelled')
      ORDER BY pr.created_at DESC,pr.request_id DESC LIMIT 1`, [JSON.stringify(views), userId])
    return rows[0] ?? null
  }

  async ownReceipts(schoolId: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT r.print_receipt_id,r.request_id,r.receipt_number,r.verification_code,r.receipt_status,${receiptDocumentLabel},
        r.student_name_snapshot student_name,r.school_id_snapshot school_id,r.file_name_snapshot file_name,
        r.page_count_snapshot page_count,r.copies_snapshot number_of_copies,r.total_sheets_snapshot total_sheets,
        r.print_type_snapshot print_type,r.paper_size_snapshot paper_size,r.amount_received,r.payment_method,
        r.received_by_name_snapshot received_by,r.received_at,r.balance_before,r.balance_after,${receiptPaymentDetails}
      FROM print_payment_receipts r
      INNER JOIN users u ON u.user_id=r.user_id
      WHERE u.school_id=?
      ORDER BY r.received_at DESC,r.print_receipt_id DESC`,[schoolId])
    return rows
  }

  async receiptById(receiptId: number, schoolId?: string) {
    const values:Array<string|number>=[receiptId]
    const ownership=schoolId?' AND u.school_id=?':''
    if(schoolId)values.push(schoolId)
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT r.print_receipt_id,r.request_id,r.receipt_number,r.verification_code,r.receipt_status,${receiptDocumentLabel},
        r.student_name_snapshot student_name,r.school_id_snapshot school_id,r.file_name_snapshot file_name,
        r.page_count_snapshot page_count,r.copies_snapshot number_of_copies,r.total_sheets_snapshot total_sheets,
        r.print_type_snapshot print_type,r.paper_size_snapshot paper_size,r.amount_received,r.payment_method,
        r.received_by_name_snapshot received_by,r.received_at,r.balance_before,r.balance_after,${receiptPaymentDetails}
      FROM print_payment_receipts r INNER JOIN users u ON u.user_id=r.user_id
      WHERE r.print_receipt_id=?${ownership} LIMIT 1`,values)
    return rows[0]??null
  }

  private queueWhere(filters: QueueFilters) {
    const clauses = ['1=1']; const values: Array<string|number> = []
    if (filters.q) { const q=`%${filters.q}%`; clauses.push(`(u.full_name ILIKE ? OR u.school_id ILIKE ? OR pr.file_name ILIKE ? OR CAST(pr.request_id AS TEXT) ILIKE ? OR r.receipt_number ILIKE ? OR r.verification_code ILIKE ?)`); values.push(q,q,q,q,q,q) }
    if (filters.scope === 'active') clauses.push("pr.job_status NOT IN ('Completed','Cancelled')")
    if (filters.scope === 'history') clauses.push("pr.job_status IN ('Completed','Cancelled')")
    if (filters.status) { clauses.push('pr.job_status=?'); values.push(filters.status) }
    if (filters.payment) { clauses.push('pr.payment_status=?'); values.push(filters.payment) }
    return { sql: clauses.join(' AND '), values }
  }

  async queue(filters: QueueFilters,views:PrintingPaymentView[]=[]) {
    const where=this.queueWhere(filters),offset=(filters.page-1)*filters.limit
    const values=[JSON.stringify(views),...where.values]
    const [count]=await this.pool.execute<RowDataPacket[]>(`${printingPaymentViewSql} SELECT COUNT(*) total FROM projected_print_requests pr JOIN users u ON u.user_id=pr.user_id ${latestReceiptJoin} ${deferredJoin} WHERE ${where.sql}`,values)
    const [rows]=await this.pool.execute<RowDataPacket[]>(`${printingPaymentViewSql} SELECT pr.request_id,pr.documents_expired_at,pr.document_retention_hold,pr.row_version,pr.service_kind,pr.output_mode,pr.pricing_review_state,pr.pricing_snapshot,pr.page_findings,pr.paper_brand_snapshot,u.full_name,u.school_id,u.user_role,pr.file_name,pr.number_of_copies,pr.print_type,pr.paper_size,pr.page_count,pr.total_sheets,pr.calculated_cost,pr.payment_status,pr.job_status,pr.created_at,pr.local_payment_id AS "localPaymentId",pr.refund_pending,${paymentFields},
        r.print_receipt_id,r.receipt_number,r.verification_code,r.receipt_status,r.received_at receipt_issued_at
      FROM projected_print_requests pr JOIN users u ON u.user_id=pr.user_id
      ${latestReceiptJoin} ${deferredJoin}
      WHERE ${where.sql} ORDER BY CASE WHEN pr.job_status IN ('Pending','Printing','Ready for Pickup') THEN 0 ELSE 1 END,pr.created_at ASC,pr.request_id ASC LIMIT ${filters.limit} OFFSET ${offset}`,values)
    const total=Number(count[0]?.total??0)
    return { rows, pagination:{page:filters.page,limit:filters.limit,total,total_pages:Math.ceil(total/filters.limit)} }
  }

  async summary(views:PrintingPaymentView[]=[]) {
    const completedToday = `COUNT(*) FILTER (WHERE job_status='Completed' AND DATE(completed_at)=${currentDate()})`
    const unpaidJobs = `COUNT(*) FILTER (WHERE payment_status IN ('Unpaid','Partially Paid') AND job_status<>'Cancelled')`
    const [rows]=await this.pool.execute<RowDataPacket[]>(`${printingPaymentViewSql} SELECT ${sumEquals('job_status', 'Pending')} pending_jobs,${sumEquals('job_status', 'Printing')} printing_jobs,${sumEquals('job_status', 'Ready for Pickup')} ready_jobs,${completedToday} completed_today,${unpaidJobs} unpaid_jobs,(SELECT COALESCE(SUM(c.amount_paid),0) FROM (${await this.collectionSource()}) c WHERE DATE(c.received_at)=${currentDate()}) revenue_today FROM projected_print_requests`,[JSON.stringify(views)])
    const service_status=await this.serviceStatus()
    return { pending_jobs:Number(rows[0]?.pending_jobs??0),printing_jobs:Number(rows[0]?.printing_jobs??0),ready_jobs:Number(rows[0]?.ready_jobs??0),completed_today:Number(rows[0]?.completed_today??0),unpaid_jobs:Number(rows[0]?.unpaid_jobs??0),revenue_today:Number(rows[0]?.revenue_today??0),service_status }
  }

  async supplies() {
    const [ink]=await this.pool.execute<RowDataPacket[]>(`SELECT i.ink_id,(SELECT brand FROM print_supply_details WHERE ink_id=i.ink_id) brand,i.cartridge_type,i.color_variation,i.available_bottles,i.low_stock_threshold_bottles,i.cost_per_bottle,i.last_replenished_at,CASE WHEN i.available_bottles<=i.low_stock_threshold_bottles THEN 1 ELSE 0 END is_low FROM ink_repository i WHERE i.deleted_at IS NULL ORDER BY is_low DESC,i.color_variation,i.cartridge_type`)
    const [paper]=await this.pool.execute<RowDataPacket[]>(`SELECT paper_stock_id,paper_size_dimension,loaded_paper_brand_stock_id,(SELECT brand FROM paper_brand_stocks WHERE paper_brand_stock_id=bond_paper_stocks.loaded_paper_brand_stock_id) loaded_paper_brand,COALESCE((SELECT json_agg(b ORDER BY b.brand) FROM paper_brand_stocks b WHERE b.paper_stock_id=bond_paper_stocks.paper_stock_id AND b.deleted_at IS NULL),'[]'::json) brands,configuration_version,(SELECT price_per_page FROM print_pricing_rules WHERE paper_size=bond_paper_stocks.paper_size_dimension AND print_type='Monochrome') monochrome_price,(SELECT price_per_page FROM print_pricing_rules WHERE paper_size=bond_paper_stocks.paper_size_dimension AND print_type='Colored') colored_price,is_active,sheets_per_ream,unopened_reams,unopened_reams remaining_reams,low_stock_threshold_reams,average_expense_cost,(SELECT width FROM print_supply_details WHERE paper_stock_id=bond_paper_stocks.paper_stock_id) width,(SELECT height FROM print_supply_details WHERE paper_stock_id=bond_paper_stocks.paper_stock_id) height,(SELECT dimension_unit FROM print_supply_details WHERE paper_stock_id=bond_paper_stocks.paper_stock_id) dimension_unit,CASE WHEN unopened_reams<=low_stock_threshold_reams THEN 1 ELSE 0 END is_low FROM bond_paper_stocks WHERE deleted_at IS NULL ORDER BY is_low DESC,paper_size_dimension`)
    const [totals]=await this.pool.execute<RowDataPacket[]>(`SELECT (SELECT COUNT(*) FROM ink_repository WHERE deleted_at IS NULL AND available_bottles<=low_stock_threshold_bottles) low_ink_items,(SELECT COUNT(*) FROM bond_paper_stocks WHERE deleted_at IS NULL AND unopened_reams<=low_stock_threshold_reams) low_paper_items,(SELECT COALESCE(SUM(expense_amount),0) FROM ink_stock_movements WHERE movement_type='Restock' AND created_at>=${monthStart})+(SELECT COALESCE(SUM(expense_amount),0) FROM paper_stock_movements WHERE movement_type='Restock' AND created_at>=${monthStart}) monthly_expense`)
    return { ink, paper, summary:{low_ink_items:Number(totals[0]?.low_ink_items??0),low_paper_items:Number(totals[0]?.low_paper_items??0),monthly_expense:Number(totals[0]?.monthly_expense??0)} }
  }

  async revenueSummary(filters: FinanceFilters) {
    const source=await this.collectionSource()
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) FILTER(WHERE pr.payment_status='Paid') paid_requests,COALESCE(SUM(pr.total_sheets),0) total_sheets,COALESCE(SUM(pr.number_of_copies),0) total_copies,COALESCE(SUM(p.amount_paid),0) total_revenue
      FROM (SELECT request_id,SUM(amount_paid) amount_paid FROM (${source}) collections
        WHERE received_at>=? AND received_at<${dayAfter()} GROUP BY request_id) p
      JOIN print_requests pr ON pr.request_id=p.request_id`,[filters.from,filters.to])
    return{period:filters.period,label:filters.label,from:filters.from,to:filters.to,paid_requests:Number(rows[0]?.paid_requests??0),total_sheets:Number(rows[0]?.total_sheets??0),total_copies:Number(rows[0]?.total_copies??0),total_revenue:Number(rows[0]?.total_revenue??0)}
  }

  async revenueEntries(filters: FinanceFilters) {
    const source=await this.collectionSource()
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.collection_id,p.received_at,p.request_id,u.full_name,u.school_id,pr.file_name,pr.print_type,pr.paper_size,pr.page_count,pr.number_of_copies,pr.total_sheets,p.amount_paid,
      CASE WHEN p.confirmation_source='Xendit' THEN 'Xendit' ELSE staff.full_name END received_by,
      p.payment_method,p.transaction_fee,p.gross,p.provider_reference,p.confirmation_source
      FROM (${source}) p
      JOIN print_requests pr ON pr.request_id=p.request_id
      JOIN users u ON u.user_id=pr.user_id
      LEFT JOIN users staff ON staff.user_id=p.received_by_user_id
      WHERE p.received_at>=? AND p.received_at<${dayAfter()}
      ORDER BY p.received_at DESC,p.request_id DESC`,[filters.from,filters.to])
    return rows
  }

  async expenseSummary(filters: FinanceFilters) {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT
      (SELECT COALESCE(SUM(expense_amount),0) FROM ink_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<${dayAfter()}) ink_expenses,
      (SELECT COALESCE(SUM(expense_amount),0) FROM paper_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<${dayAfter()}) paper_expenses,
      (SELECT COUNT(*) FROM ink_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<${dayAfter()})+(SELECT COUNT(*) FROM paper_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<${dayAfter()}) restock_entries`,[filters.from,filters.to,filters.from,filters.to,filters.from,filters.to,filters.from,filters.to])
    const inkExpenses=Number(rows[0]?.ink_expenses??0),paperExpenses=Number(rows[0]?.paper_expenses??0)
    return{period:filters.period,label:filters.label,from:filters.from,to:filters.to,restock_entries:Number(rows[0]?.restock_entries??0),ink_expenses:inkExpenses,paper_expenses:paperExpenses,total_expenses:inkExpenses+paperExpenses}
  }

  async restockHistory(filters: FinanceFilters) {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT * FROM (
      SELECT m.created_at,'Ink' supply_type,CONCAT(COALESCE((SELECT brand || ' · ' FROM print_supply_details WHERE ink_id=i.ink_id),''),i.cartridge_type,' · ',i.color_variation) supply_name,m.quantity_bottles quantity,'bottles' unit,m.unit_cost_per_bottle unit_cost,m.expense_amount total_expense,m.balance_before,m.balance_after,u.full_name recorded_by
      FROM ink_stock_movements m JOIN ink_repository i ON i.ink_id=m.ink_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id
      WHERE m.movement_type='Restock' AND m.created_at>=? AND m.created_at<${dayAfter()}
      UNION ALL
      SELECT m.created_at,'Paper',CONCAT(COALESCE((SELECT brand || ' · ' FROM paper_brand_stocks WHERE paper_brand_stock_id=m.paper_brand_stock_id),''),p.paper_size_dimension,' bond paper'),m.quantity_reams,'reams',m.unit_cost_per_ream,m.expense_amount,m.balance_before,m.balance_after,u.full_name
      FROM paper_stock_movements m JOIN bond_paper_stocks p ON p.paper_stock_id=m.paper_stock_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id
      WHERE m.movement_type='Restock' AND m.created_at>=? AND m.created_at<${dayAfter()}
    ) restocks ORDER BY created_at DESC`,[filters.from,filters.to,filters.from,filters.to])
    return rows
  }

  async stockUsageHistory(limit=100) {
    const safeLimit=Math.min(500,Math.max(1,limit))
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT * FROM (
      SELECT m.created_at,'Ink' supply_type,CONCAT(COALESCE((SELECT brand || ' · ' FROM print_supply_details WHERE ink_id=i.ink_id),''),i.cartridge_type,' · ',i.color_variation) supply_name,m.activity_code,m.quantity_bottles quantity,'bottle' unit,m.balance_before,m.balance_after,u.full_name recorded_by
      FROM ink_stock_movements m JOIN ink_repository i ON i.ink_id=m.ink_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id WHERE m.activity_code='LoadedIntoPrinter'
      UNION ALL
      SELECT m.created_at,'Paper',CONCAT(COALESCE((SELECT brand || ' · ' FROM paper_brand_stocks WHERE paper_brand_stock_id=m.paper_brand_stock_id),''),p.paper_size_dimension,' bond paper'),m.activity_code,m.quantity_reams,'ream',m.balance_before,m.balance_after,u.full_name
      FROM paper_stock_movements m JOIN bond_paper_stocks p ON p.paper_stock_id=m.paper_stock_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id WHERE m.activity_code='OpenedReam'
    ) usages ORDER BY created_at DESC LIMIT ${safeLimit}`)
    return rows
  }

  async *revenueReportRows(filters: FinanceFilters) { for(const row of await this.revenueEntries(filters))yield row }
  async *expenseReportRows(filters: FinanceFilters) { for(const row of await this.restockHistory(filters))yield row }

  async financeSummary(filters: FinanceFilters) {
    const source=await this.collectionSource()
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT
      (SELECT COALESCE(SUM(amount_paid),0) FROM (${source}) collections WHERE received_at>=? AND received_at<${dayAfter()}) revenue,
      (SELECT COALESCE(SUM(expense_amount),0) FROM ink_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<${dayAfter()}) ink_expenses,
      (SELECT COALESCE(SUM(expense_amount),0) FROM paper_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<${dayAfter()}) paper_expenses`,
      [filters.from,filters.to,filters.from,filters.to,filters.from,filters.to])
    const revenue=Number(rows[0]?.revenue??0),inkExpenses=Number(rows[0]?.ink_expenses??0),paperExpenses=Number(rows[0]?.paper_expenses??0)
    const totalExpenses=inkExpenses+paperExpenses,netResult=revenue-totalExpenses
    return{period:filters.period,label:filters.label,from:filters.from,to:filters.to,revenue,ink_expenses:inkExpenses,paper_expenses:paperExpenses,total_expenses:totalExpenses,net_result:netResult,profit_margin:revenue>0?Number(((netResult/revenue)*100).toFixed(2)):0,indicator:netResult>0?'Net gain':netResult<0?'Net loss':'Break-even'}
  }

  async financeEntries(filters: FinanceFilters) {
    const source=await this.collectionSource()
    const values=[filters.from,filters.to,filters.from,filters.to,filters.from,filters.to]
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT * FROM (
      SELECT p.received_at entry_date,CONCAT('Print request #',p.request_id,' - ',pr.file_name) entry_name,'Revenue' entry_type,
        CONCAT(pr.total_sheets,' sheets') quantity,
        CASE WHEN pr.total_sheets>0 THEN ROUND(p.amount_paid/pr.total_sheets,2) ELSE p.amount_paid END unit_cost,
        p.amount_paid revenue,0 expense,p.amount_paid net_impact,u.full_name recorded_by
      FROM (${source}) p JOIN print_requests pr ON pr.request_id=p.request_id LEFT JOIN users u ON u.user_id=p.received_by_user_id
      WHERE p.received_at>=? AND p.received_at<${dayAfter()}
      UNION ALL
      SELECT m.created_at,CONCAT(i.cartridge_type,' ',i.color_variation),'Ink restock',CONCAT(m.quantity_bottles,' bottles'),m.unit_cost_per_bottle,
        0,m.expense_amount,-m.expense_amount,u.full_name
      FROM ink_stock_movements m JOIN ink_repository i ON i.ink_id=m.ink_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id
      WHERE m.movement_type='Restock' AND m.created_at>=? AND m.created_at<${dayAfter()}
      UNION ALL
      SELECT m.created_at,CONCAT(COALESCE((SELECT brand || ' · ' FROM paper_brand_stocks WHERE paper_brand_stock_id=m.paper_brand_stock_id),''),p.paper_size_dimension,' bond paper'),'Paper restock',CONCAT(m.quantity_reams,' reams'),m.unit_cost_per_ream,
        0,m.expense_amount,-m.expense_amount,u.full_name
      FROM paper_stock_movements m JOIN bond_paper_stocks p ON p.paper_stock_id=m.paper_stock_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id
      WHERE m.movement_type='Restock' AND m.created_at>=? AND m.created_at<${dayAfter()}
    ) financial_entries ORDER BY entry_date DESC`,values)
    return rows
  }

  async *financeReportRows(filters: FinanceFilters) { for(const row of await this.financeEntries(filters))yield row }

  async movements(limit=100) {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT * FROM (SELECT ism.created_at,'Ink' supply_type,CONCAT(ir.cartridge_type,' ',ir.color_variation) supply_name,ism.movement_type,CONCAT(ism.quantity_bottles,' bottles') quantity,ism.expense_amount,u.full_name recorded_by,ism.notes FROM ink_stock_movements ism JOIN ink_repository ir ON ir.ink_id=ism.ink_id LEFT JOIN users u ON u.user_id=ism.recorded_by_user_id UNION ALL SELECT psm.created_at,'Paper',bps.paper_size_dimension,psm.movement_type,CONCAT(psm.quantity_reams,' reams'),psm.expense_amount,u.full_name,psm.notes FROM paper_stock_movements psm JOIN bond_paper_stocks bps ON bps.paper_stock_id=psm.paper_stock_id LEFT JOIN users u ON u.user_id=psm.recorded_by_user_id) movements ORDER BY created_at DESC LIMIT ${Math.min(500,Math.max(1,limit))}`)
    return rows
  }

  async *printReportRows(filters: QueueFilters) { let page=1; while(true){const result=await this.queue({...filters,page,limit:100});for(const row of result.rows)yield row;if(page>=result.pagination.total_pages)break;page+=1} }
  async *supplyReportRows() { const data=await this.supplies();for(const row of data.ink)yield {supply_type:'Ink bottle',name:`${row.brand?row.brand+' · ':''}${row.cartridge_type} ${row.color_variation}`,available:`${row.available_bottles} unopened bottles`,threshold:`${row.low_stock_threshold_bottles} bottles`,status:Number(row.is_low)?'Low stock':'In stock'};for(const row of data.paper)yield {supply_type:'Bond paper',name:`${row.paper_size_dimension}${row.brands?.length?' · '+row.brands.map((brand: {brand:string})=>brand.brand).join(', '):''}`,available:`${row.unopened_reams} unopened reams`,threshold:`${row.low_stock_threshold_reams} reams`,status:Number(row.is_low)?'Low stock':'In stock'} }
}

export const printingRepository = new PrintingRepository()
