import { randomUUID } from 'node:crypto'
import { db, type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from '../../config/db.js'
import { env } from '../../config/env.js'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import type { XenditSandboxConfig } from '../../config/xendit-sandbox.ts'
import { createPaymentsRepository, type PaymentRow } from './payments.repository.ts'
import { createPaymentsService, publicPayment, targetOf, type PaymentActor } from './payments.service.ts'
import { centavos, paymentError, paymentId } from './payments.validation.ts'
import { settleVerifiedPayment, pesos } from './payments.settlement.ts'
import { authenticateCallback, checkoutUrl, createXenditClient, parseSessionEvent, paymentReference,
  verifyCapturedPayment, verifySession, type SessionEvent, type ProviderObject } from './xendit.client.ts'

type Options = {
  config?: () => XenditSandboxConfig; clock?: () => Date
  provider?: ReturnType<typeof createXenditClient>
}
type EventRow = RowDataPacket & {event_id: string; verified_fields: SessionEvent; lease_token: string; attempts: number}
const money = (value: unknown) => /^0(?:\.0{1,2})?$/.test(String(value)) ? 0n : centavos(value)
const wait = (minutes: number, now: Date) => new Date(now.getTime()+minutes*60_000)

export function createPaymentGatewayService(database: Pool = db, options: Options = {}) {
  const config = options.config ?? (()=>env.xendit), clock = options.clock ?? (()=>new Date())
  const provider = options.provider ?? createXenditClient(config)
  const payments = createPaymentsService(database,{enabled:()=>config().enabled,clock})
  function available() {
    const settings = config()
    if (!settings.enabled) throw paymentError('Online payments are currently unavailable.','ONLINE_PAYMENTS_UNAVAILABLE',503)
    return settings
  }
  async function transaction<T>(run: (connection: PoolConnection) => Promise<T>) {
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const result = await run(connection)
      await connection.commit()
      return result
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }
  async function row(connection: Pick<PoolConnection,'execute'>, id: string, lock = false) {
    const [rows] = await connection.execute<PaymentRow[]>(
      "SELECT * FROM online_payment_attempts WHERE payment_id=? AND environment='test'"+(lock?' FOR UPDATE':''),[id])
    return rows[0] ?? null
  }
  async function review(connection: PoolConnection, id: string, code: string) {
    await connection.execute(`UPDATE online_payment_attempts SET state='Review',review_code=?,updated_at=?,next_check_at=?
      WHERE payment_id=? AND environment='test' AND state<>'Succeeded'`,[code,clock(),wait(60,clock()),id])
  }
  async function currentBalance(connection: PoolConnection, attempt: PaymentRow) {
    const charge = await createPaymentsRepository(connection).charge(targetOf(attempt),Number(attempt.user_id))
    if (!charge || charge.accruing || charge.job_status==='Cancelled' || ['Paid','Waived','Voided'].includes(charge.status)) return null
    return money(charge.assessed)-money(charge.paid)-money(charge.adjusted)
  }

  async function attachSession(id: string, session: ProviderObject) {
    return transaction(async connection=>{
      const attempt = await row(connection,id,true)
      if (!attempt) throw paymentError('This payment is unavailable.','PAYMENT_NOT_FOUND',404)
      verifySession(session,attempt)
      const url = checkoutUrl(session.payment_link_url), expires = new Date(session.expires_at)
      if (!Number.isFinite(expires.getTime()) || expires<=new Date(attempt.created_at)) {
        throw paymentError('This payment needs library review.','PAYMENT_EVIDENCE_MISMATCH',409)
      }
      await connection.execute(`UPDATE online_payment_attempts SET provider_session_id=?,provider_business_id=?,
        checkout_url=?,expires_at=?,state=CASE WHEN state IN ('Creating','Prepared') THEN 'Active' ELSE state END,
        updated_at=? WHERE payment_id=?`,[session.payment_session_id,session.business_id,url,expires,clock(),id])
      return publicPayment((await row(connection,id))!)
    })
  }

  async function reconcile(id: string, event?: SessionEvent) {
    const snapshot = await row(database,id)
    if (!snapshot) return
    if (snapshot.state==='Succeeded') {
      if (event && (event.businessId!==snapshot.provider_business_id || event.sessionId!==snapshot.provider_session_id)) {
        throw paymentError('This payment needs library review.','PAYMENT_EVIDENCE_MISMATCH',409)
      }
      return
    }
    if (!snapshot.creation_started_at || ['Quoted','Prepared'].includes(snapshot.state)) {
      throw paymentError('This payment needs library review.','PAYMENT_EVIDENCE_MISMATCH',409)
    }
    const sessionId = snapshot.provider_session_id ?? event?.sessionId
    if (!sessionId) return
    let session = await provider.getSession(sessionId)
    verifySession(session,snapshot)
    if (snapshot.cancel_requested_at && session.status==='ACTIVE') {
      // Cancellation may have succeeded despite a lost response. Always read its actual outcome afterward.
      try { await provider.cancelSession(sessionId) } catch { /* A verified GET below determines the outcome. */ }
      session = await provider.getSession(sessionId)
      verifySession(session,snapshot)
    }
    if (event && (event.sessionId!==session.payment_session_id || event.reference!==session.reference_id
      || event.businessId!==session.business_id || event.amount!==String(snapshot.total_centavos)
      || (event.providerPaymentId && session.payment_id && event.providerPaymentId!==session.payment_id))) {
      throw paymentError('This payment needs library review.','PAYMENT_EVIDENCE_MISMATCH',409)
    }
    if (session.status==='COMPLETED') {
      if (!session.payment_id) throw paymentError('Payment confirmation is still pending.','PAYMENT_CONFIRMATION_PENDING',503)
      const captured = await provider.getPayment(session.payment_id)
      if (['PENDING','AUTHORIZED'].includes(captured.status)) {
        throw paymentError('Payment confirmation is still pending.','PAYMENT_CONFIRMATION_PENDING',503)
      }
      verifyCapturedPayment(captured,session,snapshot)
    }
    await transaction(async connection=>{
      // Use the same lock order as owner checkout. Settlement remains valid after account deactivation.
      await connection.execute('SELECT account_id FROM accounts WHERE account_id=? FOR UPDATE',[snapshot.account_id])
      const attempt = await row(connection,id,true)
      if (!attempt || attempt.state==='Succeeded') return
      verifySession(session,attempt)
      await connection.execute(`UPDATE online_payment_attempts SET provider_session_id=?,provider_business_id=?,
        provider_request_id=?,last_checked_at=?,next_check_at=?,updated_at=? WHERE payment_id=?`,
        [session.payment_session_id,session.business_id,session.payment_request_id??null,clock(),wait(1,clock()),clock(),id])
      if (session.status==='COMPLETED') {
        const remaining = await currentBalance(connection,attempt)
        if (remaining===null || remaining!==BigInt(attempt.balance_before_centavos)) {
          await connection.execute('UPDATE online_payment_attempts SET provider_payment_id=? WHERE payment_id=?',[session.payment_id,id])
          await review(connection,id,'PAYMENT_BALANCE_CHANGED')
          return
        }
        await connection.execute(`UPDATE online_payment_attempts SET state='Succeeded',provider_payment_id=?,
          review_code=NULL,updated_at=? WHERE payment_id=?`,[session.payment_id,clock(),id])
        await settleVerifiedPayment(connection,{...attempt,state:'Succeeded',provider_payment_id:session.payment_id},clock())
      } else if (['EXPIRED','CANCELED'].includes(session.status)) {
        await connection.execute(`UPDATE online_payment_attempts SET state=?,review_code=NULL WHERE payment_id=?`,
          [session.status==='EXPIRED'?'Expired':'Cancelled',id])
      } else {
        const url = checkoutUrl(session.payment_link_url)
        await connection.execute("UPDATE online_payment_attempts SET state='Active',checkout_url=?,review_code=NULL WHERE payment_id=?",[url,id])
      }
    })
  }

  const gateway = {
    async checkout(actor: PaymentActor, body: unknown) {
      const settings = available()
      const prepared = await payments.prepare(actor,body)
      const claim = await transaction(async connection=>{
        const repository = createPaymentsRepository(connection)
        if (!await repository.owner(Number(actor.accountId))) throw paymentError('Sign in again.','PAYMENT_OWNER_UNAVAILABLE',401)
        const attempt = await row(connection,prepared.paymentId,true)
        if (!attempt || Number(attempt.account_id)!==Number(actor.accountId)) throw paymentError('This payment is unavailable.','PAYMENT_NOT_FOUND',404)
        if (attempt.state!=='Prepared') return {attempt,claimed:false}
        if (new Date(attempt.expires_at)<=clock()) throw paymentError('Review this payment again.','PAYMENT_QUOTE_EXPIRED',409)
        if (await currentBalance(connection,attempt)!==BigInt(attempt.balance_before_centavos)) {
          throw paymentError('The balance changed. Review it again.','PAYMENT_QUOTE_CHANGED',409)
        }
        const rule = await repository.fee(attempt.channel_code)
        if (Number(rule?.fee_rule_id)!==Number(attempt.fee_rule_id)) throw paymentError('The fee changed. Review it again.','PAYMENT_QUOTE_CHANGED',409)
        await connection.execute(`UPDATE online_payment_attempts SET state='Creating',creation_started_at=?,next_check_at=?,updated_at=?
          WHERE payment_id=?`,[clock(),wait(1,clock()),clock(),attempt.payment_id])
        return {attempt,claimed:true}
      })
      if (!claim.claimed) return payments.read(actor,prepared.paymentId)
      const attempt = claim.attempt
      const customerRef = 'Sandbox'+attempt.payment_id.replaceAll('-','')
      const bodyForProvider: ProviderObject = {
        reference_id:paymentReference(attempt.payment_id),session_type:'PAY',mode:'PAYMENT_LINK',country:'PH',currency:'PHP',
        amount:Number(pesos(attempt.total_centavos)),capture_method:'AUTOMATIC',allow_save_payment_method:'DISABLED',
        allowed_payment_channels:[attempt.channel_code],expires_at:wait(30,clock()).toISOString(),
        metadata:{environment:'test',library_payment_id:attempt.payment_id},description:'Library sandbox payment',
        customer:{reference_id:customerRef,type:'INDIVIDUAL',individual_detail:{given_names:'Sandbox',surname:'Payer'}},
      }
      if (settings.returnUrl) {
        bodyForProvider.success_return_url=settings.returnUrl+'?payment='+attempt.payment_id
        bodyForProvider.cancel_return_url=settings.returnUrl+'?payment='+attempt.payment_id
      }
      try {
        const session = await provider.createSession(bodyForProvider)
        return await attachSession(attempt.payment_id,session)
      } catch {
        // POST /sessions has no documented idempotency key or lookup-by-reference API.
        // Never automatically retry an uncertain creation. An authenticated callback can recover its session ID.
        await transaction(connection=>review(connection,attempt.payment_id,'PAYMENT_CREATION_UNCERTAIN'))
        return payments.read(actor,attempt.payment_id)
      }
    },

    async check(actor: PaymentActor, value: unknown) {
      available()
      const payment = await payments.read(actor,value), id = payment.paymentId
      if (payment.state==='Succeeded') return payment
      const claimed = await transaction(async connection=>{
        const [result] = await connection.execute<ResultSetHeader>(`UPDATE online_payment_attempts SET next_check_at=?,check_count=check_count+1
          WHERE payment_id=? AND next_check_at<=? AND environment='test' RETURNING payment_id`,[wait(1,clock()),id,clock()])
        return result.affectedRows>0
      })
      if (claimed) await reconcile(id)
      return payments.read(actor,id)
    },

    async resume(actor: PaymentActor, value: unknown) {
      available()
      const saved = await payments.read(actor,value)
      const attempt = await row(database,saved.paymentId)
      if (!attempt?.request_key || attempt.cancel_requested_at) return saved
      return gateway.checkout(actor,{quoteId:saved.paymentId,requestKey:attempt.request_key})
    },

    async cancel(actor: PaymentActor, value: unknown, administrative = false) {
      available()
      const id = paymentId(value)
      if (administrative) await transaction(connection=>requireLibraryActor(connection,Number(actor.accountId),'library.manage'))
      else await payments.read(actor,id)
      const claimed = await transaction(async connection=>{
        const attempt = await row(connection,id,true)
        if (!attempt) throw paymentError('This payment is unavailable.','PAYMENT_NOT_FOUND',404)
        if (!administrative && Number(attempt.account_id)!==Number(actor.accountId)) throw paymentError('This payment is unavailable.','PAYMENT_NOT_FOUND',404)
        if (['Succeeded','Expired','Cancelled'].includes(attempt.state)) return false
        if (attempt.provider_payment_id) throw paymentError('This payment was captured. The library must review a provider refund.','ONLINE_REFUND_REQUIRED',409)
        if (!attempt.provider_session_id && !attempt.creation_started_at && ['Quoted','Prepared'].includes(attempt.state)) {
          await connection.execute(`UPDATE online_payment_attempts SET state='Cancelled',request_key=COALESCE(request_key,?),
            cancel_requested_at=?,updated_at=? WHERE payment_id=?`,['cancel:'+id,clock(),clock(),id])
          return false
        }
        await connection.execute('UPDATE online_payment_attempts SET cancel_requested_at=?,next_check_at=? WHERE payment_id=?',[clock(),clock(),id])
        return true
      })
      if (claimed) await reconcile(id)
      return publicPayment((await row(database,id))!)
    },

    async adminCheck(actor: PaymentActor, value: unknown) {
      available()
      await transaction(connection=>requireLibraryActor(connection,Number(actor.accountId),'desk.operate'))
      const id=paymentId(value)
      const attempt=await row(database,id)
      if (!attempt) throw paymentError('This payment is unavailable.','PAYMENT_NOT_FOUND',404)
      // Share the same per-attempt throttle with borrower checks.
      const [claim]=await database.execute<ResultSetHeader>(`UPDATE online_payment_attempts SET next_check_at=?,check_count=check_count+1
        WHERE payment_id=? AND next_check_at<=?`,[wait(1,clock()),id,clock()])
      if (claim.affectedRows) await reconcile(id)
      return publicPayment((await row(database,id))!)
    },

    async receive(token: string | undefined, body: unknown) {
      const settings = available()
      if (!authenticateCallback(token,settings.webhookToken)) throw paymentError('Callback authentication failed.','PAYMENT_CALLBACK_INVALID',401)
      const event = parseSessionEvent(body)
      await transaction(async connection=>{
        const attempt = await row(connection,event.paymentId)
        await connection.execute(`INSERT INTO online_payment_events(environment,provider_event_id,payment_id,event_type,verified_fields,state,next_attempt_at)
          VALUES('test',?,?,?,?,?::text,?) ON CONFLICT(environment,provider_event_id) DO NOTHING`,
          [event.eventId,attempt?.payment_id??null,event.eventType,JSON.stringify(event),attempt?'Pending':'Review',clock()])
      })
      return {received:true}
    },

    async recover(limit = 10) {
      available()
      if (!Number.isInteger(limit) || limit<1 || limit>25) throw paymentError('Invalid recovery batch.')
      let processed = 0, pending = 0, reviewed = 0
      for (let index=0;index<limit;index++) {
        const event = await transaction(async connection=>{
          const [rows] = await connection.execute<EventRow[]>(`SELECT * FROM online_payment_events WHERE environment='test'
            AND (state='Pending' OR (state='Processing' AND lease_until<=?)) AND next_attempt_at<=?
            ORDER BY event_id LIMIT 1 FOR UPDATE SKIP LOCKED`,[clock(),clock()])
          if (!rows[0]) return null
          const item = rows[0], token = randomUUID()
          await connection.execute(`UPDATE online_payment_events SET state='Processing',lease_token=?,lease_until=?,attempts=attempts+1
            WHERE event_id=?`,[token,wait(2,clock()),item.event_id])
          return {...item,lease_token:token,attempts:Number(item.attempts)+1}
        })
        if (!event) break
        try {
          await reconcile(event.verified_fields.paymentId,event.verified_fields)
          await database.execute(`UPDATE online_payment_events SET state='Processed',processed_at=?,lease_until=NULL,lease_token=NULL,
            last_error_code=NULL WHERE event_id=? AND lease_token=?`,[clock(),event.event_id,event.lease_token])
          processed++
        } catch (error) {
          const code = error && typeof error==='object' && 'code' in error ? String(error.code) : 'PAYMENT_RECOVERY_FAILED'
          const reviewNeeded = code==='PAYMENT_EVIDENCE_MISMATCH' || event.attempts>=8
          await database.execute(`UPDATE online_payment_events SET state=?,last_error_code=?,next_attempt_at=?,lease_until=NULL,
            lease_token=NULL WHERE event_id=? AND lease_token=?`,
            [reviewNeeded?'Review':'Pending',code.slice(0,64),wait(Math.min(60,2**event.attempts),clock()),event.event_id,event.lease_token])
          if (reviewNeeded) await transaction(connection=>review(connection,event.verified_fields.paymentId,code.slice(0,64)))
          if (reviewNeeded) reviewed++; else pending++
        }
      }
      // Recover sessions with no callback. Work is bounded and reuses the saved attempt, never another POST.
      await database.execute(`UPDATE online_payment_attempts SET state='Review',review_code='PAYMENT_RECONCILIATION_REQUIRED'
        WHERE environment='test' AND state IN ('Creating','Active') AND check_count>=24`)
      const [due] = await database.execute<PaymentRow[]>(`SELECT * FROM online_payment_attempts WHERE environment='test'
        AND state IN ('Creating','Active','Review') AND check_count<24 AND next_check_at<=?
        AND (review_code IS NULL OR review_code='PAYMENT_CREATION_UNCERTAIN') ORDER BY next_check_at LIMIT ?`,[clock(),limit])
      for (const attempt of due) {
        const [claim] = await database.execute<ResultSetHeader>(`UPDATE online_payment_attempts SET next_check_at=?,check_count=check_count+1
          WHERE payment_id=? AND next_check_at<=?`,[wait(1,clock()),attempt.payment_id,clock()])
        if (!claim.affectedRows) continue
        if (!attempt.provider_session_id) {
          await transaction(connection=>review(connection,attempt.payment_id,'PAYMENT_CREATION_UNCERTAIN'))
          reviewed++
          continue
        }
        try { await reconcile(attempt.payment_id) }
        catch {
          await database.execute('UPDATE online_payment_attempts SET next_check_at=? WHERE payment_id=?',[wait(5,clock()),attempt.payment_id])
          pending++
        }
      }
      return {processed,pending,reviewed}
    },
  }
  return gateway
}

export const paymentGatewayService = createPaymentGatewayService()
