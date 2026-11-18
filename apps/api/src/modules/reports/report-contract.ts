/** Shared by the preview metadata and both export formats. Keys remain compatible. */
export const reportKinds = {
  holdings: 'Book and research holdings', circulation: 'Book loans', returns: 'Returned books',
  requests: 'Book reservations & handovers', inlibrary: 'In-library use', attendance: 'Attendance and usage',
  fines: 'Fines and replacement obligations', payments: 'Fine payment records', printing: 'Printing transactions',
  printRevenue: 'Printing revenue', stockExpenses: 'Supply restock expenses', supplies: 'Current print supplies', clearance: 'Student clearance',
} as const
export type ReportKind = keyof typeof reportKinds

const labels: Record<string,string> = {
  id:'Record reference', source:'Source',specifications:'Specifications',unit:'Stock unit',school_id:'Student / Faculty ID', role:'Role', borrower:'Borrower', name:'Name', title:'Book / research title',
  status:'Status', barcode:'Barcode', borrowed:'Borrowed on',due:'Due on',returned:'Returned on',
  request_type:'Request type',queue_position:'Queue position',copy:'Assigned copy',requested:'Requested on',ready:'Ready on',pickup_deadline:'Claim deadline',
  condition_out:'Condition when issued',condition_in:'Condition when returned',started:'Started on',hand_back_by:'Return to desk by',ended:'Returned to desk on',
  visitor_name:'Visitor',email:'School email',attendance_date:'Visit date',time_in:'Entry time',time_out:'Exit time',checkout_source:'Exit recorded by',duration_minutes:'Minutes',purpose:'Visit purpose',presence:'Presence',
  type:'Obligation type',assessed:'Amount assessed (PHP)',paid:'Paid (PHP)',adjusted:'Adjusted (PHP)',outstanding:'Outstanding (PHP)',
  receipt_number:'Payment reference',amount_received:'Amount received (PHP)',payment_method:'Payment method',received:'Received on',
  file_name:'Document',page_count:'Pages',number_of_copies:'Copies',print_type:'Print type',paper_size:'Paper size',calculated_cost:'Amount billed (PHP)',payment_status:'Payment status',submitted:'Submitted on',
  request_id:'Print request',amount_paid:'Revenue (PHP)',supply_type:'Supply type',supply:'Supply',quantity:'Quantity',unit_cost:'Unit cost (PHP)',expense:'Expense (PHP)',recorded:'Recorded on',
  available:'Available stock',threshold:'Low-stock threshold',program:'Program / strand',account_status:'Account status',unreturned:'Unreturned items',reason:'Reason',
  recordType:'Resource type',authors:'Authors',isbn:'ISBN',category:'Category',publicationYear:'Publication year',accessionNumber:'Accession number',shelfLocation:'Shelf location',condition:'Condition',availability:'Availability',researchCode:'Research code',adviser:'Adviser',
}

const columns: Record<ReportKind,string[]> = {
  holdings:['recordType','title','authors','isbn','category','publicationYear','accessionNumber','barcode','shelfLocation','condition','availability','researchCode','adviser'],
  circulation:['id','borrower','school_id','role','title','barcode','status','borrowed','due','returned'],
  returns:['id','borrower','school_id','role','title','barcode','status','borrowed','due','returned'],
  requests:['id','request_type','borrower','school_id','role','title','queue_position','status','copy','requested','ready','pickup_deadline'],
  inlibrary:['id','borrower','school_id','role','title','status','condition_out','condition_in','started','hand_back_by','ended'],
  attendance:['id','visitor_name','school_id','role','attendance_date','time_in','time_out','checkout_source','duration_minutes','purpose','status'],
  fines:['id','borrower','school_id','title','type','status','assessed','paid','adjusted','outstanding'],
  payments:['id','receipt_number','name','school_id','role','amount_received','payment_method','status','received'],
  printing:['id','source','name','school_id','role','file_name','page_count','number_of_copies','print_type','paper_size','calculated_cost','payment_status','status','submitted'],
  printRevenue:['id','request_id','source','name','school_id','role','file_name','amount_paid','received'],
  stockExpenses:['id','supply_type','supply','quantity','unit','unit_cost','expense','recorded'],
  supplies:['supply_type','name','specifications','unit','available','threshold','status'],
  clearance:['school_id','name','program','account_status','status','unreturned','outstanding','reason'],
}
const statuses: Partial<Record<ReportKind,string[]>> = {
  holdings:['Available','Borrowed','Reserved','Unavailable','Available for Viewing','Missing'],
  circulation:['Pending','Borrowed','Overdue','Returned','Cancelled'],returns:['Returned'],
  requests:['Waiting for a copy','Preparing','Ready for pickup','Awaiting handover','Collected','Cancelled','Expired'],
  inlibrary:['In use','Returned','Needs review'],attendance:['Inside','Exited'],
  fines:['Accruing','Unpaid','Partially Paid','Paid','Waived','Voided'],payments:['Issued','Reversed'],
  printing:['Pending','Printing','Ready for Pickup','Completed','Cancelled','Historical entry'],supplies:['Low stock','In stock'],
  clearance:['Cleared','Not Cleared'],
}
const search:Record<ReportKind,string> = {
  holdings:'Title, author, ISBN, accession or barcode',circulation:'Borrower, Student / Faculty ID, title, barcode or loan reference',returns:'Borrower, Student / Faculty ID, title, barcode or loan reference',
  requests:'Borrower, Student / Faculty ID, title, request reference or status',inlibrary:'Borrower, Student / Faculty ID, title or use reference',
  attendance:'Visitor, user ID, visit reference or purpose',fines:'Name, Student / Faculty ID, title or obligation reference',payments:'Name, Student / Faculty ID or payment reference',
  printing:'Name, Student / Faculty ID, document or print request',printRevenue:'Name, Student / Faculty ID, document or print request',
  stockExpenses:'Supply name, type or restock reference',supplies:'Supply name, type or stock status',clearance:'Student name, Student ID, program or clearance status',
}
const dateBasis:Record<ReportKind,string> = {
  holdings:'Current active physical book copies and research title records. A record count is not a total-copy count.',
  circulation:'Dates use the borrowing date, or creation date for a legacy pending request.',returns:'Dates use the actual return date.',
  requests:'Dates use the request date. Reservations and cart handovers remain distinct; neither is a loan before handover.',
  inlibrary:'Dates use the start of in-library use.',attendance:'Dates use the library visit date. Printing-only service visits do not occupy seats.',
  fines:'Dates use the assessment date or confirmed replacement-charge date.',payments:'Dates use the payment receipt date; reversed receipts retain their recorded status.',
  printing:'Dates use the online submission date or actual service date for a historical entry. Missing historical counts stay unrecorded.',printRevenue:'Dates use the confirmed payment received date, not the service date. Unverified historical payments are excluded.',
  stockExpenses:'Dates use the restock movement date.',supplies:'Current stock only. A past date does not reconstruct past stock.',clearance:'Current Student clearance only. A past date does not reconstruct historical standing.',
}
export function reportDefinition(kind:ReportKind) {
  const overrides:Record<string,string> = kind==='clearance'?{school_id:'Student ID'}:kind==='attendance'?{school_id:'User ID'}:kind==='supplies'?{name:'Supply'}:kind==='printing'?{submitted:'Service / submission date'}:kind==='printRevenue'?{request_id:'Request / historical reference'}:{}
  return {key:kind,title:reportKinds[kind],snapshot:['holdings','supplies','clearance'].includes(kind),
    searchHint:search[kind],dateBasis:dateBasis[kind],statuses:statuses[kind]??[],columns:columns[kind],columnLabels:{...labels,...overrides}}
}
export const reportDefinitions = Object.keys(reportKinds).map(key=>reportDefinition(key as ReportKind))
