import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import type { FinanceFilters, QueueFilters } from './printing.validation.ts'

export class PrintingRepository {
  readonly pool: Pool
  constructor(pool: Pool = db) { this.pool = pool }

  async userBySchoolId(schoolId: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT user_id, school_id, full_name, user_role, account_status FROM users WHERE school_id=? LIMIT 1', [schoolId])
    return rows[0] ?? null
  }

  async serviceStatus() {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT accepting_requests,unavailable_reason,updated_at FROM printing_service_settings WHERE settings_id=1 LIMIT 1`)
    return rows[0] ?? { accepting_requests: 1, unavailable_reason: null, updated_at: null }
  }

  async pricing() {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT pricing_rule_id,print_type,paper_size,price_per_page FROM print_pricing_rules WHERE is_active=1 ORDER BY print_type,paper_size`)
    return rows
  }

  async ownRequests(schoolId: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT pr.request_id,pr.file_name,pr.number_of_copies,pr.print_type,pr.paper_size,pr.page_count,pr.total_sheets,pr.calculated_cost,pr.payment_status,pr.job_status,pr.created_at,pr.started_at,pr.ready_at,pr.completed_at,pr.cancelled_at,pr.cancelled_reason
      FROM print_requests pr JOIN users u ON u.user_id=pr.user_id
      WHERE u.school_id=? ORDER BY pr.created_at DESC,pr.request_id DESC`, [schoolId])
    return rows
  }

  private queueWhere(filters: QueueFilters) {
    const clauses = ['1=1']; const values: Array<string|number> = []
    if (filters.q) { const q=`%${filters.q}%`; clauses.push('(u.full_name LIKE ? OR u.school_id LIKE ? OR pr.file_name LIKE ? OR CAST(pr.request_id AS CHAR) LIKE ?)'); values.push(q,q,q,q) }
    if (filters.status) { clauses.push('pr.job_status=?'); values.push(filters.status) }
    if (filters.payment) { clauses.push('pr.payment_status=?'); values.push(filters.payment) }
    return { sql: clauses.join(' AND '), values }
  }

  async queue(filters: QueueFilters) {
    const where=this.queueWhere(filters),offset=(filters.page-1)*filters.limit
    const [count]=await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) total FROM print_requests pr JOIN users u ON u.user_id=pr.user_id WHERE ${where.sql}`,where.values)
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT pr.request_id,u.full_name,u.school_id,u.user_role,pr.file_name,pr.number_of_copies,pr.print_type,pr.paper_size,pr.page_count,pr.total_sheets,pr.calculated_cost,pr.payment_status,pr.job_status,pr.created_at
      FROM print_requests pr JOIN users u ON u.user_id=pr.user_id
      WHERE ${where.sql} ORDER BY FIELD(pr.job_status,'Pending','Printing','Ready for Pickup','Completed','Cancelled'),pr.created_at ASC LIMIT ${filters.limit} OFFSET ${offset}`,where.values)
    const total=Number(count[0]?.total??0)
    return { rows, pagination:{page:filters.page,limit:filters.limit,total,total_pages:Math.ceil(total/filters.limit)} }
  }

  async summary() {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT SUM(job_status='Pending') pending_jobs,SUM(job_status='Printing') printing_jobs,SUM(job_status='Ready for Pickup') ready_jobs,SUM(job_status='Completed' AND DATE(completed_at)=CURDATE()) completed_today,SUM(payment_status='Unpaid' AND job_status<>'Cancelled') unpaid_jobs,COALESCE(SUM(CASE WHEN payment_status='Paid' AND DATE(paid_at)=CURDATE() THEN calculated_cost ELSE 0 END),0) revenue_today FROM print_requests`)
    const service_status=await this.serviceStatus()
    return { pending_jobs:Number(rows[0]?.pending_jobs??0),printing_jobs:Number(rows[0]?.printing_jobs??0),ready_jobs:Number(rows[0]?.ready_jobs??0),completed_today:Number(rows[0]?.completed_today??0),unpaid_jobs:Number(rows[0]?.unpaid_jobs??0),revenue_today:Number(rows[0]?.revenue_today??0),service_status }
  }

  async supplies() {
    const [ink]=await this.pool.execute<RowDataPacket[]>(`SELECT i.ink_id,i.cartridge_type,i.color_variation,i.available_bottles,i.low_stock_threshold_bottles,i.cost_per_bottle,i.last_replenished_at,CASE WHEN i.available_bottles<=i.low_stock_threshold_bottles THEN 1 ELSE 0 END is_low FROM ink_repository i ORDER BY is_low DESC,i.color_variation,i.cartridge_type`)
    const [paper]=await this.pool.execute<RowDataPacket[]>(`SELECT paper_stock_id,paper_size_dimension,unopened_reams,unopened_reams remaining_reams,low_stock_threshold_reams,average_expense_cost,CASE WHEN unopened_reams<=low_stock_threshold_reams THEN 1 ELSE 0 END is_low FROM bond_paper_stocks ORDER BY is_low DESC,paper_size_dimension`)
    const [totals]=await this.pool.execute<RowDataPacket[]>(`SELECT (SELECT COUNT(*) FROM ink_repository WHERE available_bottles<=low_stock_threshold_bottles) low_ink_items,(SELECT COUNT(*) FROM bond_paper_stocks WHERE unopened_reams<=low_stock_threshold_reams) low_paper_items,(SELECT COALESCE(SUM(expense_amount),0) FROM ink_stock_movements WHERE movement_type='Restock' AND created_at>=DATE_FORMAT(CURDATE(),'%Y-%m-01'))+(SELECT COALESCE(SUM(expense_amount),0) FROM paper_stock_movements WHERE movement_type='Restock' AND created_at>=DATE_FORMAT(CURDATE(),'%Y-%m-01')) monthly_expense`)
    return { ink, paper, summary:{low_ink_items:Number(totals[0]?.low_ink_items??0),low_paper_items:Number(totals[0]?.low_paper_items??0),monthly_expense:Number(totals[0]?.monthly_expense??0)} }
  }

  async revenueSummary(filters: FinanceFilters) {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) paid_requests,COALESCE(SUM(pr.total_sheets),0) total_sheets,COALESCE(SUM(pr.number_of_copies),0) total_copies,COALESCE(SUM(p.amount_paid),0) total_revenue
      FROM print_cash_payments p JOIN print_requests pr ON pr.request_id=p.request_id
      WHERE p.received_at>=? AND p.received_at<DATE_ADD(?,INTERVAL 1 DAY)`,[filters.from,filters.to])
    return{period:filters.period,label:filters.label,from:filters.from,to:filters.to,paid_requests:Number(rows[0]?.paid_requests??0),total_sheets:Number(rows[0]?.total_sheets??0),total_copies:Number(rows[0]?.total_copies??0),total_revenue:Number(rows[0]?.total_revenue??0)}
  }

  async revenueEntries(filters: FinanceFilters) {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.received_at,p.request_id,u.full_name,u.school_id,pr.file_name,pr.print_type,pr.paper_size,pr.page_count,pr.number_of_copies,pr.total_sheets,p.amount_paid,staff.full_name received_by
      FROM print_cash_payments p
      JOIN print_requests pr ON pr.request_id=p.request_id
      JOIN users u ON u.user_id=pr.user_id
      LEFT JOIN users staff ON staff.user_id=p.received_by_user_id
      WHERE p.received_at>=? AND p.received_at<DATE_ADD(?,INTERVAL 1 DAY)
      ORDER BY p.received_at DESC,p.print_cash_payment_id DESC`,[filters.from,filters.to])
    return rows
  }

  async expenseSummary(filters: FinanceFilters) {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT
      (SELECT COALESCE(SUM(expense_amount),0) FROM ink_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)) ink_expenses,
      (SELECT COALESCE(SUM(expense_amount),0) FROM paper_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)) paper_expenses,
      (SELECT COUNT(*) FROM ink_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY))+(SELECT COUNT(*) FROM paper_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)) restock_entries`,[filters.from,filters.to,filters.from,filters.to,filters.from,filters.to,filters.from,filters.to])
    const inkExpenses=Number(rows[0]?.ink_expenses??0),paperExpenses=Number(rows[0]?.paper_expenses??0)
    return{period:filters.period,label:filters.label,from:filters.from,to:filters.to,restock_entries:Number(rows[0]?.restock_entries??0),ink_expenses:inkExpenses,paper_expenses:paperExpenses,total_expenses:inkExpenses+paperExpenses}
  }

  async restockHistory(filters: FinanceFilters) {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT * FROM (
      SELECT m.created_at,'Ink' supply_type,CONCAT(i.cartridge_type,' · ',i.color_variation) supply_name,m.quantity_bottles quantity,'bottles' unit,m.unit_cost_per_bottle unit_cost,m.expense_amount total_expense,m.balance_before,m.balance_after,u.full_name recorded_by
      FROM ink_stock_movements m JOIN ink_repository i ON i.ink_id=m.ink_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id
      WHERE m.movement_type='Restock' AND m.created_at>=? AND m.created_at<DATE_ADD(?,INTERVAL 1 DAY)
      UNION ALL
      SELECT m.created_at,'Paper',CONCAT(p.paper_size_dimension,' bond paper'),m.quantity_reams,'reams',m.unit_cost_per_ream,m.expense_amount,m.balance_before,m.balance_after,u.full_name
      FROM paper_stock_movements m JOIN bond_paper_stocks p ON p.paper_stock_id=m.paper_stock_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id
      WHERE m.movement_type='Restock' AND m.created_at>=? AND m.created_at<DATE_ADD(?,INTERVAL 1 DAY)
    ) restocks ORDER BY created_at DESC`,[filters.from,filters.to,filters.from,filters.to])
    return rows
  }

  async stockUsageHistory(limit=100) {
    const safeLimit=Math.min(500,Math.max(1,limit))
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT * FROM (
      SELECT m.created_at,'Ink' supply_type,CONCAT(i.cartridge_type,' · ',i.color_variation) supply_name,m.activity_code,m.quantity_bottles quantity,'bottle' unit,m.balance_before,m.balance_after,u.full_name recorded_by
      FROM ink_stock_movements m JOIN ink_repository i ON i.ink_id=m.ink_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id WHERE m.activity_code='LoadedIntoPrinter'
      UNION ALL
      SELECT m.created_at,'Paper',CONCAT(p.paper_size_dimension,' bond paper'),m.activity_code,m.quantity_reams,'ream',m.balance_before,m.balance_after,u.full_name
      FROM paper_stock_movements m JOIN bond_paper_stocks p ON p.paper_stock_id=m.paper_stock_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id WHERE m.activity_code='OpenedReam'
    ) usages ORDER BY created_at DESC LIMIT ${safeLimit}`)
    return rows
  }

  async *revenueReportRows(filters: FinanceFilters) { for(const row of await this.revenueEntries(filters))yield row }
  async *expenseReportRows(filters: FinanceFilters) { for(const row of await this.restockHistory(filters))yield row }

  async financeSummary(filters: FinanceFilters) {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT
      (SELECT COALESCE(SUM(amount_paid),0) FROM print_cash_payments WHERE received_at>=? AND received_at<DATE_ADD(?,INTERVAL 1 DAY)) revenue,
      (SELECT COALESCE(SUM(expense_amount),0) FROM ink_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)) ink_expenses,
      (SELECT COALESCE(SUM(expense_amount),0) FROM paper_stock_movements WHERE movement_type='Restock' AND created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)) paper_expenses`,
      [filters.from,filters.to,filters.from,filters.to,filters.from,filters.to])
    const revenue=Number(rows[0]?.revenue??0),inkExpenses=Number(rows[0]?.ink_expenses??0),paperExpenses=Number(rows[0]?.paper_expenses??0)
    const totalExpenses=inkExpenses+paperExpenses,netResult=revenue-totalExpenses
    return{period:filters.period,label:filters.label,from:filters.from,to:filters.to,revenue,ink_expenses:inkExpenses,paper_expenses:paperExpenses,total_expenses:totalExpenses,net_result:netResult,profit_margin:revenue>0?Number(((netResult/revenue)*100).toFixed(2)):0,indicator:netResult>0?'Net gain':netResult<0?'Net loss':'Break-even'}
  }

  async financeEntries(filters: FinanceFilters) {
    const values=[filters.from,filters.to,filters.from,filters.to,filters.from,filters.to]
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT * FROM (
      SELECT p.received_at entry_date,CONCAT('Print request #',p.request_id,' - ',pr.file_name) entry_name,'Revenue' entry_type,
        CONCAT(pr.total_sheets,' sheets') quantity,
        CASE WHEN pr.total_sheets>0 THEN ROUND(p.amount_paid/pr.total_sheets,2) ELSE p.amount_paid END unit_cost,
        p.amount_paid revenue,0 expense,p.amount_paid net_impact,u.full_name recorded_by
      FROM print_cash_payments p JOIN print_requests pr ON pr.request_id=p.request_id LEFT JOIN users u ON u.user_id=p.received_by_user_id
      WHERE p.received_at>=? AND p.received_at<DATE_ADD(?,INTERVAL 1 DAY)
      UNION ALL
      SELECT m.created_at,CONCAT(i.cartridge_type,' ',i.color_variation),'Ink restock',CONCAT(m.quantity_bottles,' bottles'),m.unit_cost_per_bottle,
        0,m.expense_amount,-m.expense_amount,u.full_name
      FROM ink_stock_movements m JOIN ink_repository i ON i.ink_id=m.ink_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id
      WHERE m.movement_type='Restock' AND m.created_at>=? AND m.created_at<DATE_ADD(?,INTERVAL 1 DAY)
      UNION ALL
      SELECT m.created_at,CONCAT(p.paper_size_dimension,' bond paper'),'Paper restock',CONCAT(m.quantity_reams,' reams'),m.unit_cost_per_ream,
        0,m.expense_amount,-m.expense_amount,u.full_name
      FROM paper_stock_movements m JOIN bond_paper_stocks p ON p.paper_stock_id=m.paper_stock_id LEFT JOIN users u ON u.user_id=m.recorded_by_user_id
      WHERE m.movement_type='Restock' AND m.created_at>=? AND m.created_at<DATE_ADD(?,INTERVAL 1 DAY)
    ) financial_entries ORDER BY entry_date DESC`,values)
    return rows
  }

  async *financeReportRows(filters: FinanceFilters) { for(const row of await this.financeEntries(filters))yield row }

  async movements(limit=100) {
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT * FROM (SELECT ism.created_at,'Ink' supply_type,CONCAT(ir.cartridge_type,' ',ir.color_variation) supply_name,ism.movement_type,CONCAT(ism.quantity_bottles,' bottles') quantity,ism.expense_amount,u.full_name recorded_by,ism.notes FROM ink_stock_movements ism JOIN ink_repository ir ON ir.ink_id=ism.ink_id LEFT JOIN users u ON u.user_id=ism.recorded_by_user_id UNION ALL SELECT psm.created_at,'Paper',bps.paper_size_dimension,psm.movement_type,CONCAT(psm.quantity_reams,' reams'),psm.expense_amount,u.full_name,psm.notes FROM paper_stock_movements psm JOIN bond_paper_stocks bps ON bps.paper_stock_id=psm.paper_stock_id LEFT JOIN users u ON u.user_id=psm.recorded_by_user_id) movements ORDER BY created_at DESC LIMIT ${Math.min(500,Math.max(1,limit))}`)
    return rows
  }

  async *printReportRows(filters: QueueFilters) { let page=1; while(true){const result=await this.queue({...filters,page,limit:100});for(const row of result.rows)yield row;if(page>=result.pagination.total_pages)break;page+=1} }
  async *supplyReportRows() { const data=await this.supplies();for(const row of data.ink)yield {supply_type:'Ink bottle',name:`${row.cartridge_type} ${row.color_variation}`,available:String(row.available_bottles),threshold:String(row.low_stock_threshold_bottles),status:Number(row.is_low)?'Low stock':'In stock'};for(const row of data.paper)yield {supply_type:'Bond paper',name:row.paper_size_dimension,available:`${row.unopened_reams} unopened reams`,threshold:`${row.low_stock_threshold_reams} reams`,status:Number(row.is_low)?'Low stock':'In stock'} }
}

export const printingRepository = new PrintingRepository()
