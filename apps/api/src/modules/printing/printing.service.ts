import { requireLibraryActor } from '../../core/library-permissions.ts'
import { printingPaidSql } from './printing-paid.ts'
import { parsePrintCash, printBalance } from './printing-cash.rules.ts'
import { lockPaperPrice, loadPaperBrand } from './paper-pricing.ts'
import {adjustPaperBrandStock,addPaperBrandStock,paperBrand} from './paper-brands.ts'
import { requireOperationalService } from '../attendance/attendance-operations.service.ts'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { db } from '../../config/db.js'
import { guardCounterPayment } from '../payments/payments.guard.ts'
import { localPaymentPreview } from '../payments/payments.preview.ts'
import { excluded } from '../../config/sql-dialect.js'
import { HttpError } from '../../core/http-error.ts'
import { removePrintDocument, resolvePrintDocument, storePrintDocument } from './printing.storage.ts'
import { inspectPrintDocument } from './printing.document.ts'
import { parseFinanceFilters, parseNewInkStock, parsePrintRequest, parseQueueFilters, parseRestock, parseServiceStatus, parseStatusUpdate, parseStockMovement } from './printing.validation.ts'
import { PrintingRepository, printingRepository } from './printing.repository.ts'
import type { PrintingPaymentView } from './printing-payment-view.ts'
import { centavos, paymentId, positiveId } from '../payments/payments.validation.ts'

type Actor = { accountId?: number; schoolId?: string; role?: string }
import { insertUserNotice, rolePath } from '../notifications/user-notices.ts'

/** One notice per user with an open print request for this switch; runs on the caller's transaction connection. */
export async function notifyPrintingServiceChange(q: Pick<PoolConnection, 'execute'>, accepting: boolean, reason: string | null) {
  const [users] = await q.execute<RowDataPacket[]>(`SELECT DISTINCT pr.user_id,u.user_role FROM print_requests pr JOIN users u ON u.user_id=pr.user_id WHERE pr.job_status NOT IN ('Completed','Cancelled')`)
  const event = randomUUID(), publicReason = String(reason ?? '').trim()
  for (const user of users) await insertUserNotice(q, {
    userId: Number(user.user_id), title: accepting ? 'Printing resumed' : 'Printing paused',
    body: accepting ? 'Printing has resumed. Your open requests will continue.' : `Printing is paused${publicReason ? `: ${publicReason}` : ''}. Your open requests are kept.`,
    triggerType: 'Printing Update', sourceType: 'Printing Service', sourceId: 1, actionPath: rolePath(user.user_role, 'printing'),
    priority: accepting ? 'Normal' : 'Important', dedupeKey: `print-service:${event}:${accepting ? 'resumed' : 'paused'}`,
  })
}
const transitions: Record<string, string[]> = { Pending:['Printing','Cancelled'],Printing:['Ready for Pickup'], 'Ready for Pickup':['Completed'],Completed:[],Cancelled:[] }
function receiptDateKey(value: Date) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(value).replaceAll('-','') }
function receiptId(value: unknown) { const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new HttpError(422,'PRINT_RECEIPT_INVALID','The printing receipt ID is invalid.');return id }

type LocalPrintingPayments={
  withPrintingLock<T>(run:()=>Promise<T>):Promise<T>
  guard(kind:string,requestId:number):Promise<void>
  printingProjection():Promise<PrintingPaymentView[]>
}
export function createPrintingService(pool: Pool = db, repository: PrintingRepository = printingRepository,
  localPayments:LocalPrintingPayments|null=pool===db&&localPaymentPreview?localPaymentPreview.moneyOut:null) {
  async function actorUserId(schoolId?: string) {
    if (!schoolId) throw new HttpError(401,'PRINT_AUTH_REQUIRED','Sign in before using the printing service.')
    const user=await repository.userBySchoolId(schoolId)
    if (!user || user.account_status!=='Active') throw new HttpError(403,'PRINT_ACCOUNT_BLOCKED','Your library account is not active.')
    return Number(user.user_id)
  }

  return {
    serviceStatus:async()=>({...await repository.serviceStatus(),docx_auto_count_available:true}), availability:()=>repository.serviceStatus(), pricing:()=>repository.pricing(),
    ownRequests:async(actor:Actor)=>{await actorUserId(actor.schoolId);return repository.ownRequests(actor.schoolId!)},
    ownReceipts:async(actor:Actor)=>{await actorUserId(actor.schoolId);return repository.ownReceipts(actor.schoolId!)},
    ownReceipt:async(actor:Actor,receiptIdValue:unknown)=>{await actorUserId(actor.schoolId);const row=await repository.receiptById(receiptId(receiptIdValue),actor.schoolId);if(!row)throw new HttpError(404,'PRINT_RECEIPT_NOT_FOUND','The printing receipt was not found.');return row},
    adminReceipt:async(actor:Actor,receiptIdValue:unknown)=>{await actorUserId(actor.schoolId);const row=await repository.receiptById(receiptId(receiptIdValue));if(!row)throw new HttpError(404,'PRINT_RECEIPT_NOT_FOUND','The printing receipt was not found.');return row},
    queue:async(query:Record<string,unknown>)=>repository.queue(parseQueueFilters(query),pool===db&&localPaymentPreview?await localPaymentPreview.moneyOut.printingProjection():[]),
    summary:async()=>({...await repository.summary(pool===db&&localPaymentPreview?await localPaymentPreview.moneyOut.printingProjection():[]),localPreview:pool===db&&Boolean(localPaymentPreview)}), supplies:()=>repository.supplies(), movements:(limit:unknown)=>repository.movements(Number(limit)||100),
    financeSummary:(query:Record<string,unknown>)=>repository.financeSummary(parseFinanceFilters(query)),
    financeEntries:(query:Record<string,unknown>)=>repository.financeEntries(parseFinanceFilters(query)),
    revenueSummary:(query:Record<string,unknown>)=>repository.revenueSummary(parseFinanceFilters(query)),
    revenueEntries:(query:Record<string,unknown>)=>repository.revenueEntries(parseFinanceFilters(query)),
    expenseSummary:(query:Record<string,unknown>)=>repository.expenseSummary(parseFinanceFilters(query)),
    restockHistory:(query:Record<string,unknown>)=>repository.restockHistory(parseFinanceFilters(query)),
    stockUsageHistory:(limit:unknown)=>repository.stockUsageHistory(Number(limit)||100),

    async quote(actor:Actor, body:Record<string,unknown>, file?:Express.Multer.File) {
      await actorUserId(actor.schoolId)
      const document=await inspectPrintDocument(file)
      const input=parsePrintRequest(body,document.pageCount)
      const pricing=await repository.pricing(),rule=pricing.find(row=>row.print_type===input.printType&&row.paper_size===input.paperSize)
      if(!rule)throw new HttpError(422,'PAPER_SIZE_UNAVAILABLE','Choose an available paper size for this print type.')
      return {price_per_page:Number(rule.price_per_page),paper_brand_stock_id:rule.price_brand_stock_id==null?null:Number(rule.price_brand_stock_id),paper_brand:rule.paper_brand??null,page_count:input.pageCount,total_sheets:input.totalSheets,calculated_cost:Number((Number(rule.price_per_page)*input.totalSheets).toFixed(2)),document_sha256:document.sourceHash,printable_file_name:document.printableName}
    },

    async submit(actor:Actor, body:Record<string,unknown>, file?:Express.Multer.File) {
      const userId=await actorUserId(actor.schoolId)
      const serviceStatus=await repository.serviceStatus()
      if (!Number(serviceStatus.accepting_requests)) throw new HttpError(422,'PRINTING_UNAVAILABLE',String(serviceStatus.unavailable_reason??'Printing requests are temporarily unavailable.'))
      const document=await inspectPrintDocument(file)
      const input=parsePrintRequest(body,document.pageCount)
      if(body.document_sha256 && body.document_sha256!==document.sourceHash)throw new HttpError(409,'PRINT_DOCUMENT_CHANGED','The document changed after its price was calculated. Check the new page count before submitting.')
      if(body.page_count != null && Number(body.page_count)!==input.pageCount)throw new HttpError(409,'PRINT_PAGE_COUNT_CHANGED','The page count changed. Review the updated price before submitting.')
      const pricing=await repository.pricing(),rule=pricing.find(row=>row.print_type===input.printType&&row.paper_size===input.paperSize)
      if(!rule)throw new HttpError(422,'PAPER_SIZE_UNAVAILABLE','Choose an available paper size for this print type.')
      const calculatedCost=Number((Number(rule.price_per_page)*input.totalSheets).toFixed(2))
      if(body.quoted_cost != null && Number(body.quoted_cost)!==calculatedCost)throw new HttpError(409,'PRINT_PRICE_CHANGED','The printing price changed. Review the updated price before submitting.')
      const stored=await storePrintDocument(document.printableFile)
      const connection=await pool.getConnection()
      try{
        await connection.beginTransaction()
        // Match setup's paper-then-pricing lock order so disabling a size cannot race submission.
        const lockedPrice=await lockPaperPrice(connection,input.paperSize,input.printType)
        const quotedBrand=body.paper_brand_stock_id==null||body.paper_brand_stock_id===''?null:Number(body.paper_brand_stock_id)
        if(Number((lockedPrice.price*input.totalSheets).toFixed(2))!==calculatedCost || (body.paper_brand_stock_id!==undefined&&quotedBrand!==lockedPrice.brandId))throw new HttpError(409,'PRINT_PRICE_CHANGED','The loaded paper or printing price changed. Review the updated price before submitting.')
        const[result]=await connection.execute<ResultSetHeader>(`INSERT INTO print_requests (user_id,file_name,file_path,number_of_copies,print_type,paper_size,page_count,total_sheets,optional_notes,calculated_cost,payment_status,job_status,paper_brand_stock_id,paper_brand_snapshot,unit_price_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,'Unpaid','Pending',?,?,?)`,[userId,stored.originalName,stored.storedPath,input.numberOfCopies,input.printType,input.paperSize,input.pageCount,input.totalSheets,input.notes,calculatedCost,lockedPrice.brandId,lockedPrice.brandName,lockedPrice.price])
        await connection.execute(`INSERT INTO print_status_history(request_id,from_status,to_status,changed_by_user_id,reason) VALUES (?,NULL,'Pending',?,'Submitted through the printing service')`,[result.insertId,userId])
        await connection.commit()
        return {request_id:Number(result.insertId),file_name:stored.originalName,...input,calculated_cost:calculatedCost,payment_status:'Unpaid',job_status:'Pending'}
      }catch(error){await connection.rollback();await removePrintDocument(stored.storedPath);throw error}finally{connection.release()}
    },

    async cancelOwn(actor:Actor,requestIdValue:unknown){const userId=await actorUserId(actor.schoolId),requestId=Number(requestIdValue);if(!Number.isSafeInteger(requestId)||requestId<1)throw new HttpError(422,'PRINT_REQUEST_INVALID','The print request ID is invalid.');const run=async()=>{const connection=await pool.getConnection();try{await connection.beginTransaction();const[rows]=await connection.execute<RowDataPacket[]>(`SELECT request_id,job_status,payment_status FROM print_requests WHERE request_id=? AND user_id=? FOR UPDATE`,[requestId,userId]);const row=rows[0];if(!row)throw new HttpError(404,'PRINT_REQUEST_NOT_FOUND','The print request was not found.');if(row.job_status!=='Pending')throw new HttpError(422,'PRINT_CANCELLATION_BLOCKED','Only pending print requests can be cancelled.');if(['Paid','Partially Paid'].includes(String(row.payment_status)))throw new HttpError(409,'PRINT_REFUND_REVIEW_REQUIRED','A paid print request needs library refund review before cancellation.');await guardCounterPayment(connection,{kind:'Printing',targetId:requestId});await connection.execute(`UPDATE print_requests SET job_status='Cancelled',cancelled_at=NOW(),cancelled_reason='Cancelled by requester',updated_at=NOW(),row_version=row_version+1 WHERE request_id=?`,[requestId]);await connection.execute(`INSERT INTO print_status_history(request_id,from_status,to_status,changed_by_user_id,reason) VALUES (?,'Pending','Cancelled',?,'Cancelled by requester')`,[requestId,userId]);await connection.commit();return{request_id:requestId,job_status:'Cancelled'}}catch(error){await connection.rollback();throw error}finally{connection.release()}};return localPayments?localPayments.withPrintingLock(run):run()},

    async recordCash(actor:Actor,requestIdValue:unknown,body:Record<string,unknown>){
      if(!['Librarian','Staff'].includes(String(actor.role)))throw new HttpError(403,'PRINT_PAYMENT_FORBIDDEN','Only library personnel can record cash.')
      const staffId=await actorUserId(actor.schoolId),requestId=receiptId(requestIdValue)
      const run=async()=>{
        const connection=await pool.getConnection()
        try{
          await connection.beginTransaction()
          await requireLibraryActor(connection,positiveId(actor.accountId),'desk.operate')
          const [staffAccounts]=await connection.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=?',[actor.accountId])
          if(Number(staffAccounts[0]?.user_id)!==staffId)throw new HttpError(403,'PRINT_PAYMENT_FORBIDDEN','Your account cannot record this payment.')
          const[rows]=await connection.execute<RowDataPacket[]>(`SELECT pr.*,u.full_name student_name,u.school_id,u.user_role
            FROM print_requests pr INNER JOIN users u ON u.user_id=pr.user_id WHERE pr.request_id=? FOR UPDATE OF pr`,[requestId])
          const row=rows[0]
          if(!row)throw new HttpError(404,'PRINT_REQUEST_NOT_FOUND','The print request was not found.')
          if(row.pricing_review_state&&row.pricing_review_state!=='Ready')throw new HttpError(409,'PRINT_PRICE_REVIEW_REQUIRED','The requester must accept the reviewed price before payment.')
          const requestKey=paymentId(body.request_key)
          const [duplicates]=await connection.execute<RowDataPacket[]>(`SELECT r.print_receipt_id,p.amount_paid,r.receipt_status FROM print_cash_payments p
            JOIN print_payment_receipts r ON r.print_cash_payment_id=p.print_cash_payment_id WHERE p.request_id=? AND p.request_key=?::uuid`,[requestId,requestKey||null])
          if(duplicates[0]){
            if(Number(duplicates[0].amount_paid)!==Number(body.amount_paid))throw new HttpError(409,'PRINT_PAYMENT_RETRY_CHANGED','This payment reference was already used for a different amount.')
            await connection.commit()
            return {request_id:requestId,payment_status:row.payment_status,already_recorded:true,receipt:await repository.receiptById(Number(duplicates[0].print_receipt_id))}
          }
          if(row.job_status==='Cancelled')throw new HttpError(422,'PRINT_PAYMENT_BLOCKED','A cancelled print request cannot be paid.')
          const [balances]=await connection.execute<RowDataPacket[]>(`SELECT ${printingPaidSql('pr')} AS paid FROM print_requests pr WHERE pr.request_id=?`,[requestId])
          const balance=printBalance(row.calculated_cost,balances[0]?.paid??0),input=parsePrintCash(body,balance)
          await guardCounterPayment(connection,{kind:'Printing',targetId:requestId})
          const amount=Number(input.amount)/100,remaining=Number(balance-input.amount)/100,status=remaining===0?'Paid':'Partially Paid'
          const[staffRows]=await connection.execute<RowDataPacket[]>('SELECT full_name FROM users WHERE user_id=? LIMIT 1',[staffId])
          const receivedBy=String(staffRows[0]?.full_name??'Authorized library personnel'),receivedAt=new Date()
          const[payment]=await connection.execute<ResultSetHeader>(`INSERT INTO print_cash_payments(request_id,amount_paid,received_by_user_id,received_at,notes,request_key) VALUES (?,?,?,?,?,?)`,[requestId,amount,staffId,receivedAt,input.notes,input.requestKey])
          const receiptNumber=`PR-${receiptDateKey(receivedAt)}-${String(payment.insertId).padStart(6,'0')}`,verificationCode=randomBytes(8).toString('hex').toUpperCase()
          const[receipt]=await connection.execute<ResultSetHeader>(`INSERT INTO print_payment_receipts
            (print_cash_payment_id,request_id,user_id,receipt_number,verification_code,student_name_snapshot,school_id_snapshot,file_name_snapshot,page_count_snapshot,copies_snapshot,total_sheets_snapshot,print_type_snapshot,paper_size_snapshot,amount_received,payment_method,received_by_user_id,received_by_name_snapshot,received_at,balance_before,balance_after)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Cash',?,?,?,?,?)`,[payment.insertId,requestId,row.user_id,receiptNumber,verificationCode,row.student_name,row.school_id,row.file_name,row.page_count,row.number_of_copies,row.total_sheets,row.print_type,row.paper_size,amount,staffId,receivedBy,receivedAt,Number(balance)/100,remaining])
          await connection.execute(`UPDATE print_requests SET payment_status=?,paid_at=?,processed_by_user_id=?,updated_at=NOW(),row_version=row_version+1 WHERE request_id=?`,[status,status==='Paid'?receivedAt:null,staffId,requestId])
          const actionPath=row.user_role==='Faculty'?'/faculty/printing':'/student/printing'
          await connection.execute(`INSERT INTO notifications
            (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,delivered_at)
            VALUES (?,'Printing receipt available',?,'Printing Update','Printing Receipt',?,?,'Normal',?,NOW())
            ON CONFLICT (user_id, dedupe_key) DO NOTHING`,[row.user_id,`Cash payment PHP ${amount.toFixed(2)} recorded. Balance PHP ${remaining.toFixed(2)}. Payment record ${receiptNumber}.`,receipt.insertId,actionPath,`printing-receipt:${receipt.insertId}`])
          await connection.commit()
          return{request_id:requestId,payment_status:status,amount_paid:amount,balance:remaining,receipt:{print_receipt_id:Number(receipt.insertId),request_id:requestId,receipt_number:receiptNumber,verification_code:verificationCode,receipt_status:'Issued',student_name:String(row.student_name),school_id:String(row.school_id),file_name:String(row.file_name),page_count:Number(row.page_count),number_of_copies:Number(row.number_of_copies),total_sheets:Number(row.total_sheets),print_type:String(row.print_type),paper_size:String(row.paper_size),amount_received:amount,payment_method:'Cash',received_by:receivedBy,received_at:receivedAt,balance_before:Number(balance)/100,balance_after:remaining}}
        }catch(error){await connection.rollback();throw error}finally{connection.release()}
      }
      return localPayments?localPayments.withPrintingLock(run):run()
    },

    async updateStatus(actor:Actor,requestIdValue:unknown,body:Record<string,unknown>){const staffId=await actorUserId(actor.schoolId),requestId=Number(requestIdValue),input=parseStatusUpdate(body);
      // Refund review and print start acquire the local lock before the print-row lock.
      // Keep that order so a refund cannot pass the paid check while printing starts.
      const run=async()=>{const connection=await pool.getConnection();try{await connection.beginTransaction();if(input.status==='Printing')await requireOperationalService(connection,'Printing');const[rows]=await connection.execute<RowDataPacket[]>(`SELECT * FROM print_requests WHERE request_id=? FOR UPDATE`,[requestId]);const row=rows[0];if(!row)throw new HttpError(404,'PRINT_REQUEST_NOT_FOUND','The print request was not found.');if(!transitions[String(row.job_status)]?.includes(input.status))throw new HttpError(422,'PRINT_STATUS_TRANSITION_INVALID',`A ${row.job_status} job cannot move to ${input.status}.`)
      if(localPayments)await localPayments.guard('Printing',requestId)
      const online=localPayments?(await localPayments.printingProjection()).find(view=>view.request_id===requestId&&view.user_id===Number(row.user_id)):undefined
      const [balances]=await connection.execute<RowDataPacket[]>(`SELECT ${printingPaidSql('pr')} AS paid FROM print_requests pr WHERE request_id=?`,[requestId]);const cashPaid=Number(balances[0]?.paid??0);
      const paid=row.payment_status==='Paid'||Boolean(online&&online.payment_status==='Paid'&&!online.refund_pending&&!online.cancel_job
        &&(online.paid_centavos??0)+Math.round(cashPaid*100)>=Number(centavos(row.calculated_cost)))
      if(input.status==='Cancelled'){if(paid||cashPaid>0)throw new HttpError(409,'PRINT_REFUND_REVIEW_REQUIRED','A paid print request needs library refund review before cancellation.');await guardCounterPayment(connection,{kind:'Printing',targetId:requestId})}
      if(input.status==='Printing'&&row.pricing_review_state&&row.pricing_review_state!=='Ready')throw new HttpError(409,'PRINT_PRICE_REVIEW_REQUIRED','The requester must accept the reviewed price before printing.');
      if(input.status==='Printing'&&!paid){const [approvals]=await connection.execute<RowDataPacket[]>(`SELECT request_id FROM print_deferred_approvals WHERE request_id=? AND revoked_at IS NULL AND acknowledged_at IS NOT NULL AND assessed_amount=? AND pricing_snapshot IS NOT DISTINCT FROM ?::jsonb FOR SHARE`,[requestId,row.calculated_cost,JSON.stringify(row.pricing_snapshot??null)]);if(!approvals[0])throw new HttpError(422,'PRINT_PAYMENT_REQUIRED','Record payment or obtain librarian approval and borrower acknowledgment before printing.')}
      const timestamp=input.status==='Printing'?'started_at':input.status==='Ready for Pickup'?'ready_at':input.status==='Completed'?'completed_at':'cancelled_at'
      await connection.execute(`UPDATE print_requests SET job_status=?,printer_id=NULL,processed_by_user_id=?,${timestamp}=NOW(),cancelled_reason=?,updated_at=NOW(),row_version=row_version+1 WHERE request_id=?`,[input.status,staffId,input.status==='Cancelled'?input.reason:null,requestId])
      await connection.execute(`INSERT INTO print_status_history(request_id,from_status,to_status,changed_by_user_id,reason) VALUES (?,?,?,?,?)`,[requestId,row.job_status,input.status,staffId,input.reason])
      if(input.status==='Printing'){
        const notificationSql=`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
             VALUES (?,'Print request printing',?,'Printing Update','Print Request',?,'/student/printing','Normal',?,NOW(),NOW())
             ON CONFLICT (user_id,dedupe_key) DO NOTHING`
        await connection.execute(notificationSql,[row.user_id,`${row.file_name} is now printing. Request #${requestId}.`,requestId,`print:${requestId}:printing`])
      }
      await connection.commit();return{request_id:requestId,job_status:input.status}
    }catch(error){await connection.rollback();throw error}finally{connection.release()}}
      return localPayments?localPayments.withPrintingLock(run):run()
    },

    async setServiceStatus(actor:Actor,body:Record<string,unknown>){
      const staffId=await actorUserId(actor.schoolId),input=parseServiceStatus(body),connection=await pool.getConnection()
      try{
        await connection.beginTransaction()
        const[previous]=await connection.execute<RowDataPacket[]>('SELECT accepting_requests FROM printing_service_settings WHERE settings_id=1 FOR UPDATE')
        const wasAccepting=previous[0]?Number(previous[0].accepting_requests)!==0:true
        await connection.execute(`INSERT INTO printing_service_settings(settings_id,accepting_requests,unavailable_reason,updated_by_user_id,updated_at) VALUES (1,?,?,?,NOW()) ON CONFLICT (settings_id) DO UPDATE SET accepting_requests=${excluded('accepting_requests')},unavailable_reason=${excluded('unavailable_reason')},updated_by_user_id=${excluded('updated_by_user_id')},updated_at=NOW()`,[input.acceptingRequests?1:0,input.reason,staffId])
        if(wasAccepting!==input.acceptingRequests)await notifyPrintingServiceChange(connection,input.acceptingRequests,input.reason)
        await connection.commit()
        return{accepting_requests:input.acceptingRequests,unavailable_reason:input.reason}
      }catch(error){await connection.rollback();throw error}finally{connection.release()}
    },

    async downloadDocument(actor:Actor,requestIdValue:unknown,metadata:{sourceIp?:string;userAgent?:string}){const staffId=await actorUserId(actor.schoolId),requestId=Number(requestIdValue);if(!Number.isSafeInteger(requestId)||requestId<1)throw new HttpError(422,'PRINT_REQUEST_INVALID','The print request ID is invalid.');const[rows]=await pool.execute<RowDataPacket[]>(`SELECT request_id,file_name,file_path,service_kind,documents_expired_at FROM print_requests WHERE request_id=? LIMIT 1`,[requestId]);const row=rows[0];if(!row)throw new HttpError(404,'PRINT_REQUEST_NOT_FOUND','The print request was not found.');if(row.documents_expired_at)throw new HttpError(410,'PRINT_DOCUMENT_EXPIRED','The document expired after ten days. Receipts and history remain available.');if(row.service_kind==='Photocopy')throw new HttpError(404,'PRINT_DOCUMENT_UNAVAILABLE','This request uses physical originals.');const contents=await resolvePrintDocument(String(row.file_path));await pool.execute(`INSERT INTO print_file_download_audit(request_id,downloaded_by_user_id,source_ip,user_agent) VALUES (?,?,?,?)`,[requestId,staffId,String(metadata.sourceIp??'').slice(0,45)||null,String(metadata.userAgent??'').slice(0,255)||null]);const fileName=String(row.file_name),mime=fileName.toLowerCase().endsWith('.pdf')?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';return{contents,fileName,mime}},

    async createInkStock(actor:Actor,body:Record<string,unknown>){const staffId=await actorUserId(actor.schoolId),input=parseNewInkStock(body),connection=await pool.getConnection();try{await connection.beginTransaction();const[result]=await connection.execute<ResultSetHeader>(`INSERT INTO ink_repository(printer_id,cartridge_type,color_variation,available_bottles,low_stock_threshold_bottles,cost_per_bottle,remaining_fluid_percentage,low_ink_threshold,last_replenished_at) VALUES (NULL,?,?,?,?,?,100,20,CASE WHEN ?>0 THEN NOW() ELSE NULL END)`,[input.cartridgeType,input.color,input.bottles,input.threshold,input.cost,input.bottles]);await connection.execute(`INSERT INTO ink_stock_movements(ink_id,movement_type,activity_code,quantity_bottles,unit_cost_per_bottle,expense_amount,balance_before,balance_after,recorded_by_user_id,notes) VALUES (?,'Restock','Restock',?,?,?,?,?,?, 'Initial bottle stock')`,[result.insertId,input.bottles,input.cost,Number((input.cost*input.bottles).toFixed(2)),0,input.bottles,staffId]);await connection.commit();return{ink_id:Number(result.insertId),...input,total_expense:Number((input.cost*input.bottles).toFixed(2))}}catch(error){await connection.rollback();throw error}finally{connection.release()}},

    async restockInk(actor:Actor,inkIdValue:unknown,body:Record<string,unknown>){const staffId=await actorUserId(actor.schoolId),inkId=Number(inkIdValue),input=parseRestock(body,'bottles'),connection=await pool.getConnection();try{await connection.beginTransaction();const[rows]=await connection.execute<RowDataPacket[]>(`SELECT available_bottles FROM ink_repository WHERE ink_id=? AND deleted_at IS NULL FOR UPDATE`,[inkId]);if(!rows[0])throw new HttpError(404,'INK_STOCK_NOT_FOUND','The ink stock item was not found.');const current=Number(rows[0].available_bottles),next=current+input.quantity;await connection.execute(`UPDATE ink_repository SET available_bottles=?,cost_per_bottle=?,last_replenished_at=NOW(),updated_at=NOW() WHERE ink_id=?`,[next,input.unitCost,inkId]);await connection.execute(`INSERT INTO ink_stock_movements(ink_id,movement_type,activity_code,quantity_bottles,unit_cost_per_bottle,expense_amount,balance_before,balance_after,recorded_by_user_id) VALUES (?,'Restock','Restock',?,?,?,?,?,?)`,[inkId,input.quantity,input.unitCost,input.totalExpense,current,next,staffId]);await connection.commit();return{ink_id:inkId,available_bottles:next,unit_cost_per_bottle:input.unitCost,total_expense:input.totalExpense}}catch(error){await connection.rollback();throw error}finally{connection.release()}},

    async restockPaper(actor:Actor,paperIdValue:unknown,body:Record<string,unknown>){const staffId=await actorUserId(actor.schoolId),paperId=Number(paperIdValue),input=parseRestock(body,'reams'),connection=await pool.getConnection();try{await connection.beginTransaction();const[rows]=await connection.execute<RowDataPacket[]>(`SELECT unopened_reams,average_expense_cost FROM bond_paper_stocks WHERE paper_stock_id=? AND deleted_at IS NULL FOR UPDATE`,[paperId]);if(!rows[0])throw new HttpError(404,'PAPER_STOCK_NOT_FOUND','The paper stock item was not found.');const brandId=await addPaperBrandStock(connection,paperId,paperBrand(body.brand??'Unspecified brand'),input.quantity,input.unitCost);const current=Number(rows[0].unopened_reams),next=current+input.quantity,average=Number((((current*Number(rows[0].average_expense_cost))+(input.quantity*input.unitCost))/next).toFixed(2));await connection.execute(`UPDATE bond_paper_stocks SET unopened_reams=?,remaining_reams=?,average_expense_cost=?,updated_at=NOW() WHERE paper_stock_id=?`,[next,next,average,paperId]);await connection.execute(`INSERT INTO paper_stock_movements(paper_stock_id,movement_type,activity_code,quantity_reams,unit_cost_per_ream,expense_amount,balance_before,balance_after,recorded_by_user_id,paper_brand_stock_id) VALUES (?,'Restock','Restock',?,?,?,?,?,?,?)`,[paperId,input.quantity,input.unitCost,input.totalExpense,current,next,staffId,brandId]);await connection.execute(`INSERT INTO paper_replenishments(paper_stock_id,recorded_by_user_id,replenishment_date,quantity_added_reams,expense_cost) VALUES (?,?,NOW(),?,?)`,[paperId,staffId,input.quantity,input.totalExpense]);await connection.commit();return{paper_stock_id:paperId,unopened_reams:next,remaining_reams:next,unit_cost_per_ream:input.unitCost,total_expense:input.totalExpense}}catch(error){await connection.rollback();throw error}finally{connection.release()}},

    async useInkBottle(actor:Actor,inkIdValue:unknown){const staffId=await actorUserId(actor.schoolId),inkId=Number(inkIdValue),connection=await pool.getConnection();try{await connection.beginTransaction();const[rows]=await connection.execute<RowDataPacket[]>(`SELECT available_bottles FROM ink_repository WHERE ink_id=? AND deleted_at IS NULL FOR UPDATE`,[inkId]);if(!rows[0])throw new HttpError(404,'INK_STOCK_NOT_FOUND','The ink stock item was not found.');const current=Number(rows[0].available_bottles);if(current<1)throw new HttpError(422,'INK_STOCK_INSUFFICIENT','No unopened ink bottle is available for this item.');const next=current-1;await connection.execute(`UPDATE ink_repository SET available_bottles=?,updated_at=NOW() WHERE ink_id=?`,[next,inkId]);await connection.execute(`INSERT INTO ink_stock_movements(ink_id,movement_type,activity_code,quantity_bottles,unit_cost_per_bottle,expense_amount,balance_before,balance_after,recorded_by_user_id,notes) VALUES (?,'Issued','LoadedIntoPrinter',1,0,0,?,?,?,'Bottle loaded into printer')`,[inkId,current,next,staffId]);await connection.commit();return{ink_id:inkId,available_bottles:next,used_at:new Date().toISOString()}}catch(error){await connection.rollback();throw error}finally{connection.release()}},

    async openPaperReam(actor:Actor,paperIdValue:unknown,body:Record<string,unknown>={}){const staffId=await actorUserId(actor.schoolId),paperId=Number(paperIdValue),connection=await pool.getConnection();try{await connection.beginTransaction();const[rows]=await connection.execute<RowDataPacket[]>(`SELECT unopened_reams FROM bond_paper_stocks WHERE paper_stock_id=? AND deleted_at IS NULL FOR UPDATE`,[paperId]);if(!rows[0])throw new HttpError(404,'PAPER_STOCK_NOT_FOUND','The paper stock item was not found.');const current=Number(rows[0].unopened_reams);if(current<1)throw new HttpError(422,'PAPER_STOCK_INSUFFICIENT','No unopened paper ream is available for this paper size.');const brandId=await adjustPaperBrandStock(connection,paperId,body.paper_brand_stock_id,-1);const loaded=await loadPaperBrand(connection,paperId,brandId);const next=current-1;await connection.execute(`UPDATE bond_paper_stocks SET unopened_reams=?,remaining_reams=?,updated_at=NOW() WHERE paper_stock_id=?`,[next,next,paperId]);await connection.execute(`INSERT INTO paper_stock_movements(paper_stock_id,print_request_id,movement_type,activity_code,quantity_reams,unit_cost_per_ream,expense_amount,balance_before,balance_after,recorded_by_user_id,notes,paper_brand_stock_id) VALUES (?,NULL,'Issued','OpenedReam',1,0,0,?,?,?,'Ream opened for manual printing',?)`,[paperId,current,next,staffId,brandId]);await connection.commit();return{paper_stock_id:paperId,unopened_reams:next,remaining_reams:next,loaded_paper_brand_stock_id:brandId,paper_brand:loaded.brand,monochrome_price:loaded.monochromePrice,colored_price:loaded.coloredPrice,opened_at:new Date().toISOString()}}catch(error){await connection.rollback();throw error}finally{connection.release()}},

    async inkMovement(actor:Actor,inkIdValue:unknown,body:Record<string,unknown>){const staffId=await actorUserId(actor.schoolId),inkId=Number(inkIdValue),input=parseStockMovement(body,'bottles'),connection=await pool.getConnection();try{await connection.beginTransaction();const[rows]=await connection.execute<RowDataPacket[]>(`SELECT available_bottles FROM ink_repository WHERE ink_id=? AND deleted_at IS NULL FOR UPDATE`,[inkId]);if(!rows[0])throw new HttpError(404,'INK_STOCK_NOT_FOUND','The ink stock item was not found.');const current=Number(rows[0].available_bottles),subtract=input.movementType==='Issued',next=current+(subtract?-input.quantity:input.quantity);if(next<0)throw new HttpError(422,'INK_STOCK_INSUFFICIENT','The bottle stock cannot become negative.');await connection.execute(`UPDATE ink_repository SET available_bottles=?,updated_at=NOW() WHERE ink_id=?`,[next,inkId]);await connection.execute(`INSERT INTO ink_stock_movements(ink_id,movement_type,activity_code,quantity_bottles,unit_cost_per_bottle,expense_amount,balance_before,balance_after,recorded_by_user_id,notes) VALUES (?,?,'LegacyAdjustment',?,0,0,?,?,?,?)`,[inkId,input.movementType,input.quantity,current,next,staffId,input.notes]);await connection.commit();return{ink_id:inkId,available_bottles:next}}catch(error){await connection.rollback();throw error}finally{connection.release()}},

    async paperMovement(actor:Actor,paperIdValue:unknown,body:Record<string,unknown>){const staffId=await actorUserId(actor.schoolId),paperId=Number(paperIdValue),input=parseStockMovement(body,'reams'),connection=await pool.getConnection();try{await connection.beginTransaction();const[rows]=await connection.execute<RowDataPacket[]>(`SELECT unopened_reams FROM bond_paper_stocks WHERE paper_stock_id=? AND deleted_at IS NULL FOR UPDATE`,[paperId]);if(!rows[0])throw new HttpError(404,'PAPER_STOCK_NOT_FOUND','The paper stock item was not found.');const current=Number(rows[0].unopened_reams),subtract=input.movementType==='Issued',next=current+(subtract?-input.quantity:input.quantity);if(next<0)throw new HttpError(422,'PAPER_STOCK_INSUFFICIENT','The unopened ream stock cannot become negative.');const brandId=await adjustPaperBrandStock(connection,paperId,body.paper_brand_stock_id,subtract?-input.quantity:input.quantity);await connection.execute(`UPDATE bond_paper_stocks SET unopened_reams=?,remaining_reams=?,updated_at=NOW() WHERE paper_stock_id=?`,[next,next,paperId]);await connection.execute(`INSERT INTO paper_stock_movements(paper_stock_id,movement_type,activity_code,quantity_reams,unit_cost_per_ream,expense_amount,balance_before,balance_after,recorded_by_user_id,notes,paper_brand_stock_id) VALUES (?,?,'LegacyAdjustment',?,0,0,?,?,?,?,?)`,[paperId,input.movementType,input.quantity,current,next,staffId,input.notes,brandId]);await connection.commit();return{paper_stock_id:paperId,unopened_reams:next,remaining_reams:next}}catch(error){await connection.rollback();throw error}finally{connection.release()}},
  }
}

export const printingService=createPrintingService()
