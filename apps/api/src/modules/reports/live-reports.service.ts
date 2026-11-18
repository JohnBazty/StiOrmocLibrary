import type { Pool, RowDataPacket } from '../../config/db.js'
import { fileURLToPath } from 'node:url'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { createClearanceService } from '../clearance/clearance.service.ts'
import { AttendanceRepository } from '../attendance/attendance.repository.ts'
import { parseAttendanceFilters } from '../attendance/attendance.validation.ts'
import { nextDate, manilaDate } from '../attendance/attendance-intervals.ts'
import { iterateInventoryRows } from './catalog-export.service.ts'
import { parseCatalogSearchFilters } from '../catalog/catalog-search.repository.ts'
import { PrintingRepository } from '../printing/printing.repository.ts'
import { createIntegrityProtectedCsvStream } from './csv-integrity.ts'
import { createBrandedTablePdf } from './branded-table-pdf.ts'
import { reportKinds, reportDefinition, type ReportKind } from './report-contract.ts'
export { reportKinds, type ReportKind } from './report-contract.ts'

export type ReportFilters = { kind: ReportKind; period: 'all'|'custom'|'semester'; from: string|null; to: string|null; termId: number|null; q: string; status: string; page: number }
const fail = (message: string) => new HttpError(422, 'REPORT_FILTER_INVALID', message)
function date(value: unknown) {
  const s = String(value ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0,10) !== s) throw fail('Choose a valid date in YYYY-MM-DD format.')
  return s
}
export function parseReportFilters(query: Record<string, unknown>): ReportFilters {
  for(const key of ['kind','period','from','to','termId','q','status','page']) {
    if(query[key]!==undefined && typeof query[key]!=='string' && typeof query[key]!=='number') throw fail('Report filters must contain one value per field.')
  }
  const kind = String(query.kind ?? 'circulation') as ReportKind, period = String(query.period ?? 'all') as ReportFilters['period']
  if (!Object.hasOwn(reportKinds,kind) || !['all','custom','semester'].includes(period)) throw fail('Choose a valid report and reporting period.')
  const effectivePeriod = reportDefinition(kind).snapshot ? 'all' : period
  const from = effectivePeriod === 'custom' ? date(query.from) : null, to = effectivePeriod === 'custom' ? date(query.to) : null
  if (from && to && from > to) throw fail('The starting date must be before the ending date.')
  const termId = effectivePeriod === 'semester' ? Number(query.termId) : null
  if (effectivePeriod === 'semester' && (!Number.isSafeInteger(termId) || termId! < 1)) throw fail('Choose a semester.')
  const page = Number(query.page ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw fail('Choose a valid report page.')
  return { kind, period:effectivePeriod, from, to, termId, q: String(query.q ?? '').trim().slice(0,150), status: String(query.status ?? '').trim().slice(0,50), page }
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
export function createLiveReportsService(database: Pool = db, driver = 'postgres') {
  async function read(accountId: number, f: ReportFilters) {

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
        if(!terms[0].starts_on || !terms[0].ends_on) throw fail('This semester has no confirmed start and end dates. Choose a date range instead.')
        date(terms[0].starts_on);date(terms[0].ends_on)
        if(terms[0].starts_on>terms[0].ends_on) throw fail('The semester dates need correction. Choose a date range instead.')
        from = terms[0].starts_on; to = terms[0].ends_on; label = `${terms[0].term_name}, ${terms[0].academic_year} (${from} to ${to})`
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
      const sqlRows = async (sql: string, order = 'id DESC') => {
        const [r] = await q.execute<RowDataPacket[]>(`SELECT report.* FROM (${sql}) report
          WHERE (?='' OR EXISTS (SELECT 1 FROM jsonb_each_text(to_jsonb(report)) field
            WHERE strpos(lower(field.value),lower(?))>0))
          AND (?='' OR lower(COALESCE(to_jsonb(report)->>'status',to_jsonb(report)->>'availability',''))=lower(?))
          ORDER BY ${order} LIMIT 20001`, [...values, f.q, f.q, f.status, f.status])
        if (r.length > 20000) throw fail('This report exceeds 20,000 matching rows. Narrow the date range or search.')
        return r as RecordRow[]
      }
      let rows: RecordRow[] = [], metrics: Record<string,unknown> = {}
      switch (f.kind) {
        case 'holdings': rows = await collect(iterateInventoryRows(pool,parseCatalogSearchFilters({})), f); break
        case 'circulation': case 'returns': {
          const column = f.kind === 'returns' ? 'bt.returned_at' : "COALESCE(bt.borrowed_at,bt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')"
          rows = await sqlRows(`SELECT bt.transaction_id id,u.full_name borrower,u.school_id,u.user_role role,COALESCE(t.title,m.title) title,
            COALESCE(pc.barcode,m.barcode) barcode,bt.transaction_status status,
            to_char(bt.borrowed_at,'YYYY-MM-DD HH24:MI') borrowed,to_char(bt.due_at,'YYYY-MM-DD HH24:MI') due,
            to_char(bt.returned_at,'YYYY-MM-DD HH24:MI') returned
            FROM borrow_transactions bt JOIN users u ON u.user_id=bt.user_id JOIN materials m ON m.material_id=bt.material_id
            LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id LEFT JOIN titles t ON t.title_id=pc.title_id
            WHERE ${range(column)} ${f.kind === 'returns' ? "AND bt.transaction_status='Returned'" : ''}`,`${f.kind==='returns'?'returned':'borrowed'} DESC NULLS LAST,id DESC`)
          break
        }
        case 'requests': {
          rows = await sqlRows(`SELECT r.reservation_id id,CASE WHEN r.request_kind='CartHandover' THEN 'Cart handover' ELSE 'Book reservation' END request_type,u.full_name borrower,u.school_id,u.user_role role,COALESCE(t.title,m.title) title,
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
            LEFT JOIN titles t ON t.title_id=r.book_title_id WHERE ${range('r.reserved_at')}`, 'requested DESC,id DESC')
          break
        }
        case 'inlibrary': rows = await sqlRows(`SELECT iu.use_id id,u.full_name borrower,u.school_id,u.user_role role,COALESCE(t.title,rt.title) title,
          CASE iu.status WHEN 'Open' THEN 'In use' WHEN 'Review' THEN 'Needs review' ELSE iu.status END status,iu.condition_out,iu.condition_in,
          to_char(iu.started_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') started,
          to_char(iu.hand_back_by AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') hand_back_by,
          to_char(iu.ended_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') ended
          FROM in_library_uses iu JOIN users u ON u.user_id=iu.user_id LEFT JOIN physical_copies pc ON pc.physical_copy_id=iu.physical_copy_id
          LEFT JOIN titles t ON t.title_id=pc.title_id LEFT JOIN research_inventory ri ON ri.research_inventory_id=iu.research_inventory_id
          LEFT JOIN titles rt ON rt.title_id=ri.title_id WHERE ${range("iu.started_at AT TIME ZONE 'Asia/Manila'")}`, 'started DESC,id DESC'); break
        case 'attendance': {
          const repo = new AttendanceRepository(pool), [extent] = await q.execute<RowDataPacket[]>('SELECT MIN(attendance_date)::text first,MAX(attendance_date)::text last FROM attendance_logs')
          const start = from ?? extent[0].first ?? manilaDate(new Date()), end = to ?? extent[0].last ?? start
          if (f.status && !['Inside','Exited'].includes(f.status)) throw fail('Attendance status must be Inside or Exited.')
          const filters = parseAttendanceFilters({ q: f.q, presence:f.status.toLowerCase() }), reportRange = {from:start,to:end,label}
          rows = (await collect(repo.reportRows(filters, reportRange),{q:f.q,status:''})).map(r=>({...r,status:r.presence})); metrics = await repo.summary(filters,reportRange); break
        }
        case 'fines': {
          // Read the same ledgers/math as fine management, without its 5,000-row
          // operational shortlist. Search/status apply before the report ceiling.
          rows = await sqlRows(`SELECT id,borrower,school_id,title,type,status,assessed,paid,adjusted,
            GREATEST(0,assessed-paid-adjusted) outstanding FROM (
            SELECT CONCAT('F-',f.fine_id) id,u.full_name borrower,u.school_id,
              COALESCE(t.title,m.title,fi.category,'Library fine') title,f.fine_type type,
              CASE WHEN f.fine_type='Overdue' AND bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL THEN 'Accruing'
                WHEN f.payment_status='Accruing' THEN 'Unpaid' ELSE f.payment_status END status,
              f.fine_amount assessed,COALESCE(pay.paid,0) paid,COALESCE(adj.adjusted,0) adjusted
              FROM fines f JOIN users u ON u.user_id=f.user_id
              LEFT JOIN borrow_transactions bt ON bt.transaction_id=f.transaction_id
              LEFT JOIN materials m ON m.material_id=bt.material_id LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
              LEFT JOIN titles t ON t.title_id=pc.title_id LEFT JOIN fine_infractions fi ON fi.fine_id=f.fine_id
              LEFT JOIN (SELECT a.fine_id,SUM(a.amount_allocated) paid FROM fine_payment_allocations a
                JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued'
                GROUP BY a.fine_id) pay ON pay.fine_id=f.fine_id
              LEFT JOIN (SELECT fine_id,SUM(amount_adjusted) adjusted FROM fine_adjustments GROUP BY fine_id) adj ON adj.fine_id=f.fine_id
              WHERE ${range("f.applied_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila'")}
            UNION ALL SELECT CONCAT('L-',l.lost_book_report_id),u.full_name,u.school_id,COALESCE(t.title,m.title,'Lost book'),
              'Lost Book',l.payment_status,l.replacement_charge,COALESCE(pay.paid,0),0
              FROM lost_book_reports l JOIN users u ON u.user_id=l.user_id JOIN borrow_transactions bt ON bt.transaction_id=l.transaction_id
              JOIN materials m ON m.material_id=bt.material_id LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
              LEFT JOIN titles t ON t.title_id=pc.title_id
              LEFT JOIN (SELECT a.lost_book_report_id,SUM(a.amount_allocated) paid FROM fine_payment_allocations a
                JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued'
                GROUP BY a.lost_book_report_id) pay ON pay.lost_book_report_id=l.lost_book_report_id
              WHERE l.report_status='Confirmed' AND l.replacement_charge>0
                AND ${range("COALESCE(l.verified_at,l.reported_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila'")}
            ) obligations`); break
        }
        case 'clearance': rows = (await createClearanceService(pool).exportRows({accountId,role:'Librarian'})).map(r=>({school_id:r.student.schoolId,name:r.student.name,program:r.student.program,account_status:r.student.accountStatus,status:r.status,unreturned:r.summary.activeLoans,outstanding:r.summary.totalOutstanding,reason:r.reason})); break
        case 'supplies': rows = await collect(new PrintingRepository(pool).supplyReportRows(), f); break
        case 'payments': rows = await sqlRows(`SELECT r.fine_payment_receipt_id id,r.receipt_number,u.full_name name,u.school_id,u.user_role role,r.amount_received,r.payment_method,r.receipt_status status,
          to_char(r.received_at,'YYYY-MM-DD HH24:MI') received FROM fine_payment_receipts r JOIN users u ON u.user_id=r.user_id WHERE ${range('r.received_at')}`,'received DESC,id DESC'); break
        case 'printing': rows=await sqlRows(`SELECT id,source,name,school_id,role,file_name,page_count,number_of_copies,print_type,paper_size,calculated_cost,payment_status,status,to_char(service_time,'YYYY-MM-DD HH24:MI') submitted FROM october17_print_services WHERE ${range('service_time')}`,'submitted DESC,id DESC');break
        case 'printRevenue': rows=await sqlRows(`SELECT id,request_id,source,name,school_id,role,file_name,amount_paid,to_char(received,'YYYY-MM-DD HH24:MI') received FROM october17_print_revenue WHERE ${range('received')}`,'received DESC,id DESC');break
        case 'stockExpenses': rows=await sqlRows(`SELECT id,supply_type,supply,quantity,unit,unit_cost,expense,to_char(recorded,'YYYY-MM-DD HH24:MI') recorded FROM october17_supply_expenses WHERE ${range('recorded')}`,'recorded DESC,id DESC');break
      }
      rows = filterReportRows(rows,f)
      if (rows.length > 20000) throw fail('Narrow this report to 20,000 rows or fewer.')
      const [terms] = await q.execute<RowDataPacket[]>('SELECT academic_term_id id,academic_year,term_name,starts_on::text,ends_on::text FROM academic_terms ORDER BY starts_on DESC')
      await q.commit()
      const definition=reportDefinition(f.kind)
      return { generatedAt:new Date().toISOString(), title:definition.title, kind:f.kind, label, timezone:'Asia/Manila',filters:f,
        columns: definition.columns,columnLabels:definition.columnLabels, rows, total:rows.length, metrics,terms,
        note:definition.dateBasis }
    } catch (e) { await q.rollback(); throw e } finally { q.release() }
  }
  return { read }
}
export const liveReportsService = createLiveReportsService()
type ExportData = Omit<Awaited<ReturnType<typeof liveReportsService.read>>,'columnLabels'|'title'> & {columnLabels?:Record<string,string>;title:string}
export function exportLiveReport(data: ExportData, format: string) {
  if (!['csv','pdf'].includes(format)) throw fail('Choose CSV or PDF.')
  const metrics = data.kind==='attendance' ? ` | Visits ${data.metrics.total_visits} | Peak seats ${data.metrics.peak_occupancy} | Average completed visit ${data.metrics.average_visit??'None'}` : ''
  const generated = new Date(data.generatedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})
  const criteria = `${data.title} | ${data.label} | Asia/Manila | Rows ${data.total} | Search: ${data.filters.q||'All'} | Status: ${data.filters.status||'All'} | Generated: ${generated}${metrics}`
  const columns = data.columns.length ? data.columns : ['result']
  const labels = data.columnLabels ?? reportDefinition(data.kind).columnLabels
  async function* iterator() { for (const r of data.rows) yield r }
  if (format === 'pdf') return createBrandedTablePdf(iterator(),{title:data.title.toUpperCase(),subtitle:`${criteria} | ${data.note}`,emptyMessage:'No matching records.',
    fonts:{regular:fileURLToPath(new URL('../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url)),bold:fileURLToPath(new URL('../../../assets/fonts/NotoSans-Bold.ttf',import.meta.url))},
    columns:columns.map(key=>({key,label:(labels[key]??key.replaceAll('_',' ')).toUpperCase(),width:['title','file_name','reason','borrower','name'].includes(key)?160:95}))})
  const cell = (v:unknown) => {let s=String(v??'');if(/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
  async function* csv(){yield '\uFEFF'+cell('REPORT CRITERIA')+','+cell(criteria+' | '+data.note)+'\r\n';yield columns.map(c=>cell(labels[c]??c)).concat(cell('REPORT CRITERIA')).join(',')+'\r\n';for(const r of data.rows)yield columns.map(c=>cell(r[c])).concat(cell(criteria)).join(',')+'\r\n'}
  return createIntegrityProtectedCsvStream(csv(),`revision_${data.kind}`,columns.length+1)
}
