import type { Pool,RowDataPacket } from '../../config/db.js'
import type { FinanceFilters } from './printing.validation.ts'
import { printingRevenueSource } from './printing-revenue.ts'
const bounds='>=?::date AND '
export function extendedPrintingReports(pool:Pool){
  const rows=async(sql:string,f:FinanceFilters)=>{const [r]=await pool.execute<RowDataPacket[]>(sql,[f.from,f.to]);return r}
  const revenue=(f:FinanceFilters)=>rows(`SELECT received AT TIME ZONE 'Asia/Manila' received_at,request_id,source,name full_name,school_id,file_name,print_type,paper_size,page_count,number_of_copies,total_sheets,amount_paid,received_by,payment_method FROM (${printingRevenueSource}) collections WHERE received${bounds}received<(?::date+INTERVAL '1 day') ORDER BY received DESC,id DESC`,f)
  const expenses=(f:FinanceFilters)=>rows(`SELECT recorded AT TIME ZONE 'Asia/Manila' created_at,supply_type,supply supply_name,quantity,unit,unit_cost,expense total_expense,balance_before,balance_after,recorded_by FROM october17_supply_expenses WHERE recorded${bounds}recorded<(?::date+INTERVAL '1 day') ORDER BY recorded DESC,id DESC`,f)
  const meta=(f:FinanceFilters)=>({period:f.period,label:f.label,from:f.from,to:f.to})
  return {revenue,expenses,
    revenueSummary:async(f:FinanceFilters)=>{const r=await rows(`SELECT COUNT(*) paid_requests,COALESCE(SUM(total_sheets),0) total_sheets,COALESCE(SUM(number_of_copies),0) total_copies,COALESCE(SUM(amount_paid),0) total_revenue FROM (${printingRevenueSource}) collections WHERE received${bounds}received<(?::date+INTERVAL '1 day')`,f);return {...meta(f),paid_requests:Number(r[0].paid_requests),total_sheets:Number(r[0].total_sheets),total_copies:Number(r[0].total_copies),total_revenue:Number(r[0].total_revenue)}},
    expenseSummary:async(f:FinanceFilters)=>{const r=await rows(`SELECT COUNT(*) restock_entries,COALESCE(SUM(expense) FILTER(WHERE supply_type='Ink'),0) ink_expenses,COALESCE(SUM(expense) FILTER(WHERE supply_type='Paper'),0) paper_expenses,COALESCE(SUM(expense) FILTER(WHERE supply_type='Other materials'),0) other_expenses,COALESCE(SUM(expense),0) total_expenses FROM october17_supply_expenses WHERE recorded${bounds}recorded<(?::date+INTERVAL '1 day')`,f);return {...meta(f),restock_entries:Number(r[0].restock_entries),ink_expenses:Number(r[0].ink_expenses),paper_expenses:Number(r[0].paper_expenses),other_expenses:Number(r[0].other_expenses),total_expenses:Number(r[0].total_expenses)}},
    financeEntries:async(f:FinanceFilters)=>{
      const [paid,restocked]=await Promise.all([revenue(f),expenses(f)])
      return [...paid.map(r=>({entry_date:r.received_at,entry_name:`${r.source}: ${r.file_name}`,entry_type:'Revenue',quantity:r.total_sheets==null?'Not recorded':`${r.total_sheets} sheets`,unit_cost:Number(r.total_sheets)>0?Number(r.amount_paid)/Number(r.total_sheets):null,revenue:r.amount_paid,expense:0,net_impact:r.amount_paid,recorded_by:r.received_by})),...restocked.map(r=>({entry_date:r.created_at,entry_name:r.supply_name,entry_type:`${r.supply_type} restock`,quantity:`${r.quantity} ${r.unit}`,unit_cost:r.unit_cost,revenue:0,expense:r.total_expense,net_impact:-Number(r.total_expense),recorded_by:r.recorded_by}))].sort((a,b)=>new Date(b.entry_date).getTime()-new Date(a.entry_date).getTime())
    },
  }
}
