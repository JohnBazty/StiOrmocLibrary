import type { Pool, RowDataPacket } from 'mysql2/promise'
import { fileURLToPath } from 'node:url'
import { db, dbDriver } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { createClearanceService } from '../clearance/clearance.service.ts'
import { createFinesService } from '../fines/fines.service.ts'
import { parseFineFilters } from '../fines/fines.validation.ts'
import { AttendanceRepository } from '../attendance/attendance.repository.ts'
import { parseAttendanceFilters } from '../attendance/attendance.validation.ts'
import { nextDate, manilaDate } from '../attendance/attendance-intervals.ts'
import { iterateInventoryRows } from './catalog-export.service.ts'
import { parseCatalogSearchFilters } from '../catalog/catalog-search.repository.ts'
import { PrintingRepository } from '../printing/printing.repository.ts'
import { createIntegrityProtectedCsvStream } from './csv-integrity.ts'
import { createBrandedTablePdf } from './branded-table-pdf.ts'

export const reportKinds = {
  holdings: 'Active book and research holdings', circulation: 'Take-home borrowing', returns: 'Returned books',
  requests: 'Book requests and pickups', inlibrary: 'In-library use', attendance: 'Attendance and usage',
  fines: 'Fines and replacement obligations', payments: 'Fine payment records', printing: 'Printing requests',
  printRevenue: 'Printing cash revenue', stockExpenses: 'Supply restock expenses', supplies: 'Current print supplies', clearance: 'Student clearance',
} as const
export type ReportKind = keyof typeof reportKinds
export type ReportFilters = { kind: ReportKind; period: 'all'|'custom'|'semester'; from: string|null; to: string|null; termId: number|null; q: string; status: string; page: number }
const fail = (message: string) => new HttpError(422, 'REPORT_FILTER_INVALID', message)
function date(value: unknown) {
  const s = String(value ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0,10) !== s) throw fail('Choose a valid date in YYYY-MM-DD format.')
  return s
}
export function parseReportFilters(query: Record<string, unknown>): ReportFilters {
  const kind = String(query.kind ?? 'circulation') as ReportKind, period = String(query.period ?? 'all') as ReportFilters['period']
  if (!Object.hasOwn(reportKinds,kind) || !['all','custom','semester'].includes(period)) throw fail('Choose a valid report and reporting period.')
  const from = period === 'custom' ? date(query.from) : null, to = period === 'custom' ? date(query.to) : null
  if (from && to && from > to) throw fail('The starting date must be before the ending date.')
  const termId = period === 'semester' ? Number(query.termId) : null
  if (period === 'semester' && (!Number.isSafeInteger(termId) || termId! < 1)) throw fail('Choose a semester.')
  const page = Number(query.page ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw fail('Choose a valid report page.')
  return { kind, period, from, to, termId, q: String(query.q ?? '').trim().slice(0,150), status: String(query.status ?? '').trim().slice(0,50), page }
}
type RecordRow = Record<string, unknown>
async function collect(source: AsyncIterable<object>, filters?: Pick<ReportFilters,'q'|'status'>): Promise<RecordRow[]> {
  const rows: RecordRow[] = []
  for await (const r of source) {
    if (filters && !filterReportRows([r as RecordRow], filters).length) continue
    rows.push(r as RecordRow)
    if (rows.length > 20000) throw fail('This report exceeds 20,000 matching rows. Narrow the reporting period or search before exporting.')
  }
  return rows
}
export function filterReportRows(rows: RecordRow[], f: Pick<ReportFilters,'q'|'status'>) {
  const search = f.q.toLocaleLowerCase()
  return rows.filter(r => (!search || Object.values(r).some(v => String(v ?? '').toLocaleLowerCase().includes(search))) && (!f.status || String(r.status ?? r.availability ?? '').toLocaleLowerCase() === f.status.toLocaleLowerCase()))
}
export function createLiveReportsService(database: Pool = db) {
  async function read(accountId: number, f: ReportFilters) {
    if (dbDriver !== 'postgres') throw new HttpError(503, 'REPORTS_UNAVAILABLE', 'Live reports require the Postgres revision schema.')
    const q = await database.getConnection()
    try {
      await q.beginTransaction()
      await q.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
      await requireLibraryActor(q, accountId, 'library.manage')
      const pool = q as unknown as Pool
      let from = f.from, to = f.to, label = 'All recorded dates'
      if (f.period === 'semester') {
        const [terms] = await q.execute<RowDataPacket[]>('SELECT starts_on::text,ends_on::text,academic_year,term_name FROM academic_terms WHERE academic_term_id=?',[f.termId])
        if (!terms[0]) throw fail('The selected semester does not exist.')
        from = terms[0].starts_on; to = terms[0].ends_on; label = `${terms[0].term_name}, ${terms[0].academic_year}`
      } else if (from && to) label = `${from} to ${to}`
      const snapshot = ['holdings','clearance','supplies'].includes(f.kind)
      if (snapshot) label = 'Current snapshot — date range does not apply'
      const values: string[] = []
      const range = (column: string) => {
        if (!from || !to) return 'TRUE'
        values.push(`${from} 00:00:00`, `${nextDate(to,1)} 00:00:00`)
        return `${column}>=?::timestamp AND ${column}<?::timestamp`
      }
      // Apply literal display-field filters before the bounded fetch. A small search
      // must still work when its unfiltered source has more than 20,000 records.
      const sqlRows = async (sql: string) => {
        const [r] = await q.execute<RowDataPacket[]>(`SELECT report.* FROM (${sql}) report
          WHERE (?='' OR EXISTS (SELECT 1 FROM jsonb_each_text(to_jsonb(report)) field
            WHERE strpos(lower(field.value),lower(?))>0))
          AND (?='' OR lower(COALESCE(to_jsonb(report)->>'status',to_jsonb(report)->>'availability',''))=lower(?))
          LIMIT 20001`, [...values, f.q, f.q, f.status, f.status])
        if (r.length > 20000) throw fail('This report exceeds 20,000 matching rows. Narrow the date range or search.')
        return r as RecordRow[]
      }
      let rows: RecordRow[] = [], metrics: Record<string,unknown> = {}
      switch (f.kind) {
        case 'holdings': rows = await collect(iterateInventoryRows(pool,parseCatalogSearchFilters({})), f); break
        case 'circulation': case 'returns': {
          const column = f.kind === 'returns' ? 'bt.returned_at' : 'COALESCE(bt.borrowed_at,bt.created_at)'
          rows = await sqlRows(`SELECT bt.transaction_id id,u.full_name borrower,u.school_id,COALESCE(t.title,m.title) title,
            COALESCE(pc.barcode,m.barcode) barcode,bt.transaction_status status,
            to_char(bt.borrowed_at,'YYYY-MM-DD HH24:MI') borrowed,to_char(bt.due_at,'YYYY-MM-DD HH24:MI') due,
            to_char(bt.returned_at,'YYYY-MM-DD HH24:MI') returned
            FROM borrow_transactions bt JOIN users u ON u.user_id=bt.user_id JOIN materials m ON m.material_id=bt.material_id
            LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id LEFT JOIN titles t ON t.title_id=pc.title_id
            WHERE ${range(column)} ${f.kind === 'returns' ? "AND bt.transaction_status='Returned'" : ''} ORDER BY ${column} DESC,bt.transaction_id DESC`)
          break
        }
        case 'requests': {
          rows = await sqlRows(`SELECT r.reservation_id id,CASE WHEN r.request_kind='CartHandover' THEN 'Cart handover' ELSE 'Reservation' END request_type,u.full_name borrower,u.school_id,COALESCE(t.title,m.title) title,
            CASE WHEN r.request_kind='Reservation' THEN r.queue_position ELSE NULL END queue_position,CASE
              WHEN r.request_kind='CartHandover' AND r.reservation_status='approved' THEN 'Awaiting handover'
              WHEN r.reservation_status='pending' OR (r.reservation_status='approved' AND r.assigned_physical_copy_id IS NULL) THEN 'Waiting for a copy'
              WHEN r.reservation_status IN ('approved','preparing') THEN 'Preparing'
              WHEN r.reservation_status='received' THEN 'Request received'
              WHEN r.reservation_status='ready_for_pickup' THEN 'Ready for pickup'
              WHEN r.reservation_status='claimed' THEN 'Collected'
              WHEN r.reservation_status='cancelled' THEN 'Cancelled'
              WHEN r.reservation_status='expired' THEN 'Expired'
              ELSE r.reservation_status END status,r.assigned_physical_copy_id copy,
            to_char(r.reserved_at,'YYYY-MM-DD HH24:MI') requested,to_char(r.ready_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') ready,
            to_char(r.pickup_deadline,'YYYY-MM-DD HH24:MI') pickup_deadline
            FROM reservations r JOIN users u ON u.user_id=r.user_id JOIN materials m ON m.material_id=r.material_id
            LEFT JOIN titles t ON t.title_id=r.book_title_id WHERE ${range('r.reserved_at')} ORDER BY r.reserved_at DESC,r.reservation_id DESC`)
          break
        }
        case 'inlibrary': rows = await sqlRows(`SELECT iu.use_id id,u.full_name borrower,u.school_id,COALESCE(t.title,rt.title) title,
          iu.status,iu.condition_out,iu.condition_in,
          to_char(iu.started_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') started,
          to_char(iu.hand_back_by AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') hand_back_by,
          to_char(iu.ended_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') ended
          FROM in_library_uses iu JOIN users u ON u.user_id=iu.user_id LEFT JOIN physical_copies pc ON pc.physical_copy_id=iu.physical_copy_id
          LEFT JOIN titles t ON t.title_id=pc.title_id LEFT JOIN research_inventory ri ON ri.research_inventory_id=iu.research_inventory_id
          LEFT JOIN titles rt ON rt.title_id=ri.title_id WHERE ${range("iu.started_at AT TIME ZONE 'Asia/Manila'")} ORDER BY iu.started_at DESC`); break
        case 'attendance': {
          const repo = new AttendanceRepository(pool), [extent] = await q.execute<RowDataPacket[]>('SELECT MIN(attendance_date)::text first,MAX(attendance_date)::text last FROM attendance_logs')
          const start = from ?? extent[0].first ?? manilaDate(new Date()), end = to ?? extent[0].last ?? start
          if (f.status && !['Inside','Exited'].includes(f.status)) throw fail('Attendance status must be Inside or Exited.')
          const filters = parseAttendanceFilters({ q: f.q, presence:f.status.toLowerCase() }), reportRange = {from:start,to:end,label}
          rows = (await collect(repo.reportRows(filters, reportRange))).map(r=>({...r,status:r.presence})); metrics = await repo.summary(filters,reportRange); break
        }
        case 'fines': {
          const result = await createFinesService(pool).report(parseFineFilters({period:from?'custom':'all',from,to}))
          label = result.range.label
          rows = result.items.map(r=>({id:r.id,borrower:r.userName,school_id:r.schoolId,title:r.title,type:r.type,status:r.status,assessed:r.assessed,paid:r.paid,adjusted:r.adjusted,outstanding:r.balance})); break
        }
        case 'clearance': rows = (await createClearanceService(pool).exportRows({accountId,role:'Librarian'})).map(r=>({school_id:r.student.schoolId,name:r.student.name,program:r.student.program,account_status:r.student.accountStatus,status:r.status,unreturned:r.summary.activeLoans,outstanding:r.summary.totalOutstanding,reason:r.reason})); break
        case 'supplies': rows = await collect(new PrintingRepository(pool).supplyReportRows(), f); break
        case 'payments': rows = await sqlRows(`SELECT r.fine_payment_receipt_id id,r.receipt_number,u.full_name name,u.school_id,r.amount_received,r.payment_method,r.receipt_status status,
          to_char(r.received_at,'YYYY-MM-DD HH24:MI') received FROM fine_payment_receipts r JOIN users u ON u.user_id=r.user_id WHERE ${range('r.received_at')} ORDER BY r.received_at DESC`); break
        case 'printing': rows = await sqlRows(`SELECT p.request_id id,u.full_name name,u.school_id,p.file_name,p.page_count,p.number_of_copies,p.print_type,p.paper_size,p.calculated_cost,p.payment_status,p.job_status status,
          to_char(p.created_at,'YYYY-MM-DD HH24:MI') submitted FROM print_requests p JOIN users u ON u.user_id=p.user_id WHERE ${range('p.created_at')} ORDER BY p.created_at DESC`); break
        case 'printRevenue': rows = await sqlRows(`SELECT c.print_cash_payment_id id,p.request_id,u.full_name name,u.school_id,p.file_name,c.amount_paid,
          to_char(c.received_at,'YYYY-MM-DD HH24:MI') received FROM print_cash_payments c JOIN print_requests p ON p.request_id=c.request_id JOIN users u ON u.user_id=p.user_id WHERE ${range('c.received_at')} ORDER BY c.received_at DESC`); break
        case 'stockExpenses': rows = await sqlRows(`SELECT id,supply_type,supply,quantity,unit_cost,expense,to_char(created_at,'YYYY-MM-DD HH24:MI') recorded FROM (
          SELECT m.ink_stock_movement_id id,'Ink' supply_type,CONCAT(i.cartridge_type,' ',i.color_variation) supply,m.quantity_bottles quantity,m.unit_cost_per_bottle unit_cost,m.expense_amount expense,m.created_at
          FROM ink_stock_movements m JOIN ink_repository i ON i.ink_id=m.ink_id WHERE m.movement_type='Restock'
          UNION ALL SELECT m.paper_stock_movement_id,'Paper',p.paper_size_dimension,m.quantity_reams,m.unit_cost_per_ream,m.expense_amount,m.created_at
          FROM paper_stock_movements m JOIN bond_paper_stocks p ON p.paper_stock_id=m.paper_stock_id WHERE m.movement_type='Restock') movements
          WHERE ${range('created_at')} ORDER BY created_at DESC`); break
      }
      rows = filterReportRows(rows,f)
      if (rows.length > 20000) throw fail('Narrow this report to 20,000 rows or fewer.')
      const [terms] = await q.execute<RowDataPacket[]>('SELECT academic_term_id id,academic_year,term_name,starts_on::text,ends_on::text FROM academic_terms ORDER BY starts_on DESC')
      await q.commit()
      return { generatedAt:new Date().toISOString(), title:reportKinds[f.kind], kind:f.kind, label, timezone:'Asia/Manila',filters:f,
        columns: rows.length ? Object.keys(rows[0]) : [], rows, total:rows.length, metrics,terms,
        note:f.kind==='attendance'?'Peak occupancy uses concurrent seat visits; printing-only visits do not occupy seats.':snapshot?'Current state, not historical state at a selected date.':f.kind==='returns'?'Date filter uses the return date.':f.kind==='requests'?'Date filter uses the request date.':f.kind==='circulation'?'Date filter uses borrowing date, or creation date for an uncollected request.':'Dates apply to the recorded transaction date.' }
    } catch (e) { await q.rollback(); throw e } finally { q.release() }
  }
  return { read }
}
export const liveReportsService = createLiveReportsService()
export function exportLiveReport(data: Awaited<ReturnType<typeof liveReportsService.read>>, format: string) {
  if (!['csv','pdf'].includes(format)) throw fail('Choose CSV or PDF.')
  const metrics = data.kind==='attendance' ? ` | Visits ${data.metrics.total_visits} | Peak seats ${data.metrics.peak_occupancy} | Average completed visit ${data.metrics.average_visit??'None'}` : ''
  const criteria = `${data.label} | Asia/Manila | Rows ${data.total} | Search: ${data.filters.q||'All'} | Status: ${data.filters.status||'All'}${metrics}`
  const columns = data.columns.length ? data.columns : ['result']
  async function* iterator() { for (const r of data.rows) yield r }
  if (format === 'pdf') return createBrandedTablePdf(iterator(),{title:data.title.toUpperCase(),subtitle:criteria,emptyMessage:'No matching records.',
    fonts:{regular:fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url)),bold:fileURLToPath(new URL('../../../assets/fonts/NotoSans-Bold.ttf',import.meta.url))},
    columns:columns.map(key=>({key,label:key.replaceAll('_',' ').toUpperCase(),width:['title','file_name','reason','borrower','name'].includes(key)?160:95}))})
  const cell = (v:unknown) => {let s=String(v??'');if(/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
  async function* csv(){yield '\uFEFF'+cell('REPORT CRITERIA')+','+cell(criteria+' | '+data.note)+'\r\n';yield columns.map(cell).concat(cell('REPORT CRITERIA')).join(',')+'\r\n';for(const r of data.rows)yield columns.map(c=>cell(r[c])).concat(cell(criteria)).join(',')+'\r\n'}
  return createIntegrityProtectedCsvStream(csv(),`revision_${data.kind}`,columns.length+1)
}
