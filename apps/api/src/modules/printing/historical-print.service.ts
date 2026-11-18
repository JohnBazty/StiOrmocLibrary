import type { PoolConnection,ResultSetHeader,RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { maintenanceStore,audit } from '../inventory/maintenance-store.ts'
import { historicalInput,id,invalid,text } from '../inventory/maintenance-validation.ts'

export function createHistoricalPrintingService(store=maintenanceStore){
  async function resolveCustomer(q:PoolConnection,body:Record<string,unknown>){
    const input=historicalInput(body)
    if(!input.schoolId)return {...input,userId:null as number|null}
    const [users]=await q.execute<RowDataPacket[]>('SELECT user_id,full_name FROM users WHERE school_id=?',[input.schoolId])
    if(!users.length)throw invalid('Student / Faculty ID was not found. Correct it or leave it blank for an unlinked historical customer.')
    return {...input,userId:Number(users[0].user_id),customerName:String(users[0].full_name)}
  }
  async function duplicates(q:PoolConnection,input:Awaited<ReturnType<typeof resolveCustomer>>,except=0){
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT entry_id,customer_name,description,reference,to_char(served_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI') served,billed,
      (lower(description)=lower(?) AND billed=? AND served_at=?::timestamptz) same_entry
      FROM historical_print_entries WHERE state='Active' AND entry_id<>? AND (served_at AT TIME ZONE 'Asia/Manila')::date=(?::timestamptz AT TIME ZONE 'Asia/Manila')::date
      AND (lower(customer_name)=lower(?) OR user_id=? OR (NULLIF(?,'') IS NOT NULL AND lower(reference)=lower(?))) ORDER BY same_entry DESC,entry_id DESC LIMIT 10`,[input.description,input.billed,input.servedAt,except,input.servedAt,input.customerName,input.userId,input.reference,input.reference])
    return rows
  }
  async function existingJob(q:PoolConnection,input:ReturnType<typeof historicalInput>){
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT p.request_id FROM print_requests p JOIN users u ON u.user_id=p.user_id
      WHERE ((p.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date=(?::timestamptz AT TIME ZONE 'Asia/Manila')::date
        AND lower(u.full_name)=lower(?) AND lower(p.file_name)=lower(?) AND p.calculated_cost=?)
      OR (NULLIF(?,'') IS NOT NULL AND ? IN (CONCAT('PRINT-INV-',LPAD(p.request_id::text,8,'0')),CONCAT('PRINT-',p.request_id))) LIMIT 1`,[input.servedAt,input.customerName,input.description,input.billed,input.reference,input.reference])
    if(rows.length)throw invalid(`Print request ${rows[0].request_id} already exists. Use its original record instead of adding it again.`)
  }
  const list=(actor:number,query:Record<string,unknown>)=>store.read(actor,async q=>{
    const search=text(query.q,'Search',150)
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT h.*,u.school_id,to_char(h.served_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD"T"HH24:MI') served_local,
      to_char(h.received_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD"T"HH24:MI') received_local
      FROM historical_print_entries h LEFT JOIN users u ON u.user_id=h.user_id
      WHERE strpos(lower(CONCAT_WS(' ',h.customer_name,h.description,h.reference,u.school_id,h.entry_id::text)),lower(?))>0 ORDER BY h.served_at DESC,h.entry_id DESC LIMIT 100`,[search])
    return rows
  })
  return {list,
    preview:(actor:number,body:Record<string,unknown>)=>store.read(actor,async q=>{const input=await resolveCustomer(q,body);await existingJob(q,input);return {input,possibleDuplicates:await duplicates(q,input,body.entryId?id(body.entryId):0)}}),
    history:(actor:number,value:unknown)=>store.read(actor,async q=>{const [rows]=await q.execute<RowDataPacket[]>(`SELECT e.event_id,e.reason,e.before_data,e.after_data,e.created_at,u.full_name actor FROM library_maintenance_events e JOIN accounts a ON a.account_id=e.actor_id LEFT JOIN users u ON u.user_id=a.user_id WHERE e.scope='historical-print' AND e.record_id=? ORDER BY e.event_id DESC`,[id(value)]);return rows}),
    save:async(actor:number,body:Record<string,unknown>,value?:unknown)=>{
      const input=historicalInput(body),entryId=value==null?null:id(value),reason=entryId?text(body.reason,'Correction reason',500,true):'Historical printing entry'
      return store.write(actor,body.commandKey,{scope:'historical-print',entryId,input,version:body.version,reason,duplicateAcknowledged:body.duplicateAcknowledged===true},async q=>{
        const resolved=await resolveCustomer(q,body)
        await q.execute('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[`historical-print:${resolved.customerName.toLowerCase()}:${input.servedAt}`])
        let before:RowDataPacket|null=null
        if(entryId){const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM historical_print_entries WHERE entry_id=? FOR UPDATE',[entryId]);before=rows[0];if(!before)throw new HttpError(404,'HISTORY_NOT_FOUND','This printing record was not found.');if(before.state!=='Active'||Number(before.version)!==Number(body.version))throw new HttpError(409,'HISTORY_CHANGED','This record changed or was voided. Reload before editing.')}
        await existingJob(q,resolved)
        const possible=await duplicates(q,resolved,entryId??0)
        if(possible.some(r=>r.same_entry))throw invalid('This printing record already exists. Edit the original entry if it needs a correction.')
        if(possible.length&&body.duplicateAcknowledged!==true)throw new HttpError(409,'HISTORY_POSSIBLE_DUPLICATE','Similar records exist for this customer or reference on that date. Review them before saving.')
        const values=[input.servedAt,resolved.customerName,resolved.userId,input.reference||null,input.description,input.pages,input.copies,input.printType||null,input.paperSize||null,input.billed,input.paymentState,input.amountPaid,input.receivedAt,input.paymentMethod||null,input.paymentEvidence||null,actor]
        let savedId=entryId
        if(entryId)await q.execute(`UPDATE historical_print_entries SET served_at=?,customer_name=?,user_id=?,reference=?,description=?,pages=?,copies=?,print_type=?,paper_size=?,billed=?,payment_state=?,amount_paid=?,received_at=?,payment_method=?,payment_evidence=?,updated_by=?,version=version+1,updated_at=now() WHERE entry_id=?`,[...values,entryId])
        else {const [result]=await q.execute<ResultSetHeader>(`INSERT INTO historical_print_entries(served_at,customer_name,user_id,reference,description,pages,copies,print_type,paper_size,billed,payment_state,amount_paid,received_at,payment_method,payment_evidence,updated_by,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[...values,actor]);savedId=Number(result.insertId)}
        const [saved]=await q.execute<RowDataPacket[]>('SELECT * FROM historical_print_entries WHERE entry_id=?',[savedId])
        await audit(q,actor,'historical-print',savedId!,reason,before,saved[0]);return saved[0]
      })
    },
    void:(actor:number,value:unknown,body:Record<string,unknown>)=>store.write(actor,body.commandKey,{scope:'void-history',id:id(value),version:body.version,reason:text(body.reason,'Void reason',500,true)},async q=>{
      const entryId=id(value),[rows]=await q.execute<RowDataPacket[]>('SELECT * FROM historical_print_entries WHERE entry_id=? FOR UPDATE',[entryId]),before=rows[0]
      if(!before)throw new HttpError(404,'HISTORY_NOT_FOUND','This printing record was not found.')
      if(before.state!=='Active'||Number(before.version)!==Number(body.version))throw new HttpError(409,'HISTORY_CHANGED','This record changed. Reload before voiding it.')
      await q.execute("UPDATE historical_print_entries SET state='Voided',version=version+1,updated_by=?,updated_at=now() WHERE entry_id=?",[actor,entryId])
      const after={...before,state:'Voided',version:Number(before.version)+1};await audit(q,actor,'historical-print',entryId,String(body.reason),before,after);return after
    }),
  }
}
export const historicalPrintingService=createHistoricalPrintingService()
