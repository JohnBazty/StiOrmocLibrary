import {db,type Pool,type RowDataPacket} from '../../config/db.js'
import {env} from '../../config/env.js'
import type {XenditSandboxConfig} from '../../config/xendit-sandbox.ts'
import {requireLibraryActor} from '../../core/library-permissions.ts'
import {createPaymentGatewayService} from './payments.gateway.ts'
import type {PaymentActor} from './payments.service.ts'
import {centavos,paymentError,paymentId,positiveId} from './payments.validation.ts'

export function parseSettlement(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw paymentError('Enter the settlement details.')
  const body=value as Record<string,unknown>
  if(Object.keys(body).some(key=>!['reference','processingCost','settledAt'].includes(key)))throw paymentError('Review the settlement details.')
  if(typeof body.reference!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 ._:/-]{2,119}$/.test(body.reference))throw paymentError('Enter the reference from the provider settlement record.')
  const cost=/^0(?:\.0{1,2})?$/.test(String(body.processingCost))?0n:centavos(body.processingCost)
  if(typeof body.settledAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(body.settledAt)||!Number.isFinite(Date.parse(body.settledAt)))throw paymentError('Choose a settlement date and time with its timezone.')
  const date=body.settledAt.slice(0,10)
  if(new Date(date).toISOString().slice(0,10)!==date)throw paymentError('Choose a valid settlement date.')
  return {reference:body.reference.trim(),cost,settledAt:new Date(body.settledAt)}
}

export function createPaymentOperations(database:Pool=db,options:{config?:()=>XenditSandboxConfig;clock?:()=>Date;gateway?:ReturnType<typeof createPaymentGatewayService>}={}){
  const config=options.config??(()=>env.xendit)
  const gateway=options.gateway??createPaymentGatewayService(database,{config})
  async function transaction<T>(actor:PaymentActor,run:(q:Awaited<ReturnType<Pool['getConnection']>>)=>Promise<T>){
    if(!config().enabled)throw paymentError('Online payments are disabled.','ONLINE_PAYMENTS_UNAVAILABLE',503)
    const q=await database.getConnection()
    try{await q.beginTransaction();await requireLibraryActor(q,positiveId(actor.accountId),'library.manage');const value=await run(q);await q.commit();return value}
    catch(error){await q.rollback();throw error}finally{q.release()}
  }
  return {
    async recover(){if(!config().enabled)return {skipped:true,reason:'payments disabled'};return gateway.recover(5)},
    async status(actor:PaymentActor){return transaction(actor,async q=>{
      const [counts]=await q.execute<RowDataPacket[]>(`SELECT count(*) FILTER(WHERE state='Review')::int needs_review,
        count(*) FILTER(WHERE state IN ('Creating','Active','Review') AND next_check_at<=now())::int due_checks
        FROM online_payment_attempts WHERE environment='test'`)
      const [events]=await q.execute<RowDataPacket[]>(`SELECT event_id,payment_id,event_type,state,attempts,last_error_code,
        received_at,next_attempt_at,lease_until FROM online_payment_events WHERE environment='test' AND state<>'Processed'
        ORDER BY CASE WHEN state='Review' THEN 0 ELSE 1 END,received_at LIMIT 25`)
      const [totals]=await q.execute<RowDataPacket[]>(`SELECT count(*) FILTER(WHERE state='Review')::int review_events,
        count(*) FILTER(WHERE state IN ('Pending','Processing'))::int pending_events FROM online_payment_events WHERE environment='test'`)
      const c=config()
      const [runner]=await q.execute<RowDataPacket[]>("SELECT last_success_at AT TIME ZONE 'UTC' last_success_at,last_error_message AS last_error FROM scheduled_job_state WHERE job_name='payment-recovery'")
      return {...counts[0],...totals[0],checkoutEnabled:c.enabled&&c.checkoutEnabled!==false,events,
        runner:'payment-recovery',runnerStatus:runner[0]??null,batchLimit:5}
    })},
    async readSettlement(actor:PaymentActor,id:unknown){const target=paymentId(id);return transaction(actor,async q=>{
      const [rows]=await q.execute<RowDataPacket[]>('SELECT provider_reference,processing_cost_centavos,net_centavos,settled_at,recorded_at FROM online_payment_settlements WHERE payment_id=?',[target])
      return rows[0]??null
    })},
    async settlement(actor:PaymentActor,id:unknown,body:unknown){
      const target=paymentId(id),input=parseSettlement(body)
      if(input.settledAt.getTime()>(options.clock?.().getTime()??Date.now())+60_000)throw paymentError('Settlement cannot be in the future.')
      return transaction(actor,async q=>{
        const [rows]=await q.execute<RowDataPacket[]>("SELECT state,total_centavos,created_at FROM online_payment_attempts WHERE payment_id=? AND environment='test' FOR UPDATE",[target])
        const payment=rows[0]
        if(!payment||payment.state!=='Succeeded')throw paymentError('Only verified paid records can have settlement evidence.')
        if(input.cost>BigInt(payment.total_centavos)||input.settledAt<new Date(payment.created_at))throw paymentError('Check the processing cost and settlement date against the payment.')
        const [previous]=await q.execute<RowDataPacket[]>('SELECT * FROM online_payment_settlements WHERE payment_id=?',[target])
        if(previous[0]){
          if(previous[0].provider_reference!==input.reference||BigInt(previous[0].processing_cost_centavos)!==input.cost||new Date(previous[0].settled_at).getTime()!==input.settledAt.getTime())throw paymentError('Settlement is already recorded. Keep the original evidence.','SETTLEMENT_ALREADY_RECORDED',409)
          return {recorded:true}
        }
        await q.execute(`INSERT INTO online_payment_settlements(payment_id,provider_reference,gross_centavos,processing_cost_centavos,settled_at,recorded_by_account_id)
          VALUES(?,?,?,?,?,?)`,[target,input.reference,payment.total_centavos,input.cost.toString(),input.settledAt,actor.accountId])
        return {recorded:true}
      })
    },
  }
}
export const paymentOperations=createPaymentOperations()
