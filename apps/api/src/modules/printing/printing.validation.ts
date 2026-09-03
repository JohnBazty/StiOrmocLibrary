import { HttpError } from '../../core/http-error.ts'

export type PrintType = 'Colored' | 'Monochrome'
export type PaperSize = 'Short' | 'A4' | 'Long'
export type PrintStatus = 'Pending' | 'Printing' | 'Ready for Pickup' | 'Completed' | 'Cancelled'

function integer(value: unknown, field: string, minimum: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpError(422, 'PRINT_VALIDATION_FAILED', 'Please correct the print request fields.', {
      errors: { [field]: `${field.replaceAll('_', ' ')} must be between ${minimum} and ${maximum}.` },
    })
  }
  return parsed
}

export function parsePrintRequest(body: Record<string, unknown>) {
  const numberOfCopies = integer(body.number_of_copies, 'number_of_copies', 1, 50)
  const pageCount = integer(body.page_count, 'page_count', 1, 500)
  const printType = String(body.print_type ?? '') as PrintType
  const paperSize = String(body.paper_size ?? '') as PaperSize
  if (!['Colored', 'Monochrome'].includes(printType)) throw new HttpError(422, 'PRINT_TYPE_INVALID', 'Choose Colored or Monochrome printing.')
  if (!['Short', 'A4', 'Long'].includes(paperSize)) throw new HttpError(422, 'PAPER_SIZE_INVALID', 'Choose Short, A4, or Long paper.')
  const notes = String(body.optional_notes ?? '').trim()
  if (notes.length > 1000) throw new HttpError(422, 'PRINT_NOTES_TOO_LONG', 'Printing notes must not exceed 1,000 characters.')
  return { numberOfCopies, pageCount, printType, paperSize, notes: notes || null, totalSheets: numberOfCopies * pageCount }
}

export type QueueFilters = { q: string; status: string; payment: string; page: number; limit: number }
export function parseQueueFilters(query: Record<string, unknown>): QueueFilters {
  const status = String(query.status ?? '')
  const payment = String(query.payment_status ?? '')
  if (status && !['Pending','Printing','Ready for Pickup','Completed','Cancelled'].includes(status)) throw new HttpError(422, 'PRINT_STATUS_INVALID', 'Choose a valid print status.')
  if (payment && !['Unpaid','Paid'].includes(payment)) throw new HttpError(422, 'PAYMENT_STATUS_INVALID', 'Choose a valid cash payment status.')
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? '25'), 10) || 25))
  return { q: String(query.q ?? '').trim().slice(0, 150), status, payment, page, limit }
}

export function parseStatusUpdate(body: Record<string, unknown>) {
  const status = String(body.status ?? '') as PrintStatus
  if (!['Printing','Ready for Pickup','Completed','Cancelled'].includes(status)) throw new HttpError(422, 'PRINT_STATUS_INVALID', 'Choose a valid next print status.')
  const reason = String(body.reason ?? '').trim()
  if (status === 'Cancelled' && reason.length < 3) throw new HttpError(422, 'PRINT_CANCELLATION_REASON_REQUIRED', 'A cancellation reason is required.')
  return { status, reason: reason || null }
}

export function parseServiceStatus(body: Record<string, unknown>) {
  const accepting = body.accepting_requests
  if (accepting !== true && accepting !== false && accepting !== 1 && accepting !== 0) {
    throw new HttpError(422, 'PRINT_SERVICE_STATUS_INVALID', 'Choose whether the printing service is accepting requests.')
  }
  const acceptingRequests = accepting === true || accepting === 1
  const reason = String(body.unavailable_reason ?? '').trim()
  if (!acceptingRequests && reason.length < 3) throw new HttpError(422, 'PRINT_SERVICE_REASON_REQUIRED', 'Provide a reason when pausing print requests.')
  if (reason.length > 255) throw new HttpError(422, 'PRINT_SERVICE_REASON_TOO_LONG', 'The printing service reason must not exceed 255 characters.')
  return { acceptingRequests, reason: acceptingRequests ? null : reason }
}

export function parseNewInkStock(body: Record<string, unknown>) {
  const cartridgeType=String(body.cartridge_type??'').trim(),color=String(body.color_variation??'')
  if(cartridgeType.length<2||cartridgeType.length>100)throw new HttpError(422,'INK_TYPE_INVALID','Enter the ink bottle or cartridge type.')
  if(!['Cyan','Magenta','Yellow','Black'].includes(color))throw new HttpError(422,'INK_COLOR_INVALID','Choose Cyan, Magenta, Yellow, or Black.')
  const bottles=integer(body.available_bottles,'available_bottles',1,10000),threshold=integer(body.low_stock_threshold_bottles??1,'low_stock_threshold_bottles',0,10000),cost=Number(body.cost_per_bottle)
  if(!Number.isFinite(cost)||cost<=0||cost>1000000)throw new HttpError(422,'INK_COST_INVALID','Cost per bottle is required and must be greater than zero.')
  return{cartridgeType,color,bottles,threshold,cost}
}

export function parseRestock(body: Record<string, unknown>, unit: 'bottles' | 'reams') {
  const quantity = Number(body.quantity)
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new HttpError(422, 'STOCK_QUANTITY_INVALID', `Enter a whole number of ${unit} between 1 and 10,000.`)
  }
  const unitCost = Number(body.unit_cost)
  if (!Number.isFinite(unitCost) || unitCost <= 0 || unitCost > 1000000) {
    throw new HttpError(422, 'STOCK_UNIT_COST_INVALID', `Cost per ${unit === 'bottles' ? 'bottle' : 'ream'} is required and must be greater than zero.`)
  }
  return { quantity, unitCost, totalExpense: Number((quantity * unitCost).toFixed(2)) }
}

export type FinancePeriod = 'daily' | 'weekly' | 'monthly'
export type FinanceFilters = { period: FinancePeriod; date: string; month: string; week: number | null; from: string; to: string; label: string }

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`
}
function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function parseFinanceFilters(query: Record<string, unknown>): FinanceFilters {
  const period=String(query.period??'monthly') as FinancePeriod
  if(!['daily','weekly','monthly'].includes(period))throw new HttpError(422,'PRINT_FINANCE_PERIOD_INVALID','Choose a daily, weekly, or monthly reporting period.')
  const date=String(query.date??manilaToday())
  if(!isoDatePattern.test(date))throw new HttpError(422,'PRINT_FINANCE_DATE_INVALID','Choose a valid reporting date.')
  const [year,month,day]=date.split('-').map(Number),anchor=new Date(Date.UTC(year,month-1,day))
  if(formatDate(anchor)!==date)throw new HttpError(422,'PRINT_FINANCE_DATE_INVALID','Choose a valid reporting date.')
  const requestedMonth=String(query.month??date.slice(0,7))
  if(!/^\d{4}-\d{2}$/.test(requestedMonth))throw new HttpError(422,'PRINT_FINANCE_MONTH_INVALID','Choose a valid reporting month.')
  const [reportYear,reportMonth]=requestedMonth.split('-').map(Number),monthAnchor=new Date(Date.UTC(reportYear,reportMonth-1,1))
  if(`${monthAnchor.getUTCFullYear()}-${String(monthAnchor.getUTCMonth()+1).padStart(2,'0')}`!==requestedMonth)throw new HttpError(422,'PRINT_FINANCE_MONTH_INVALID','Choose a valid reporting month.')
  if(period==='daily')return{period,date,month:date.slice(0,7),week:null,from:date,to:date,label:date}
  if(period==='weekly'){
    const week=Number(query.week??Math.ceil(day/7))
    if(!Number.isSafeInteger(week)||week<1||week>4)throw new HttpError(422,'PRINT_FINANCE_WEEK_INVALID','Choose week 1, 2, 3, or 4.')
    const lastDay=new Date(Date.UTC(reportYear,reportMonth,0)).getUTCDate(),startDay=((week-1)*7)+1
    if(startDay>lastDay)throw new HttpError(422,'PRINT_FINANCE_WEEK_INVALID','The selected week does not exist in this month.')
    const endDay=Math.min(startDay+6,lastDay),from=`${requestedMonth}-${String(startDay).padStart(2,'0')}`,to=`${requestedMonth}-${String(endDay).padStart(2,'0')}`
    return{period,date:from,month:requestedMonth,week,from,to,label:`${requestedMonth} · Week ${week} (${from} to ${to})`}
  }
  const first=new Date(Date.UTC(reportYear,reportMonth-1,1)),last=new Date(Date.UTC(reportYear,reportMonth,0))
  return{period,date:formatDate(first),month:requestedMonth,week:null,from:formatDate(first),to:formatDate(last),label:requestedMonth}
}

export function parseStockMovement(body: Record<string, unknown>, unit: 'bottles' | 'reams') {
  const movementType = String(body.movement_type ?? '')
  if (!['Issued','Adjustment','Reversal'].includes(movementType)) throw new HttpError(422, 'STOCK_MOVEMENT_INVALID', 'Choose a valid stock adjustment. Use the dedicated restock action when adding purchased supplies.')
  const quantity = Number(body.quantity)
  const valid = Number.isSafeInteger(quantity)
  if (!valid || quantity <= 0 || quantity > 10000) throw new HttpError(422, 'STOCK_QUANTITY_INVALID', `Enter a valid positive quantity in ${unit}.`)
  const expense = Number(body.expense_amount ?? 0)
  if (!Number.isFinite(expense) || expense < 0 || expense > 10000000) throw new HttpError(422, 'STOCK_EXPENSE_INVALID', 'Enter a valid non-negative expense amount.')
  const notes = String(body.notes ?? '').trim().slice(0, 255)
  return { movementType, quantity, expense, notes: notes || null }
}
