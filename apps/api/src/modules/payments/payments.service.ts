import { db, type Pool, type RowDataPacket } from '../../config/db.js'
import { env } from '../../config/env.js'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { createPaymentsRepository, type PaymentRow, type PaymentTarget } from './payments.repository.ts'
import { centavos, feeTotal, parseCheckout, parseFeeRule, parsePaymentFilters, parseQuote, parseTarget, paymentError, paymentId, positiveId } from './payments.validation.ts'

export type PaymentActor = { accountId?: number; role?: string }
type Options = { enabled?: () => boolean; checkoutEnabled?: () => boolean; clock?: () => Date }
const zeroOrCentavos = (value: unknown) => /^0(?:\.0{1,2})?$/.test(String(value)) ? 0n : centavos(value)

export function targetOf(row: PaymentRow): PaymentTarget {
  if (row.print_request_id) return {kind:'Printing',targetId:Number(row.print_request_id)}
  if (row.fine_id) return {kind:'Fine',targetId:Number(row.fine_id)}
  return {kind:'LostBook',targetId:Number(row.lost_book_report_id)}
}

export function publicPayment(row: PaymentRow) {
  return {
    paymentId:row.payment_id,kind:targetOf(row).kind,targetId:targetOf(row).targetId,
    principalCentavos:Number(row.principal_centavos),feeCentavos:Number(row.fee_centavos),
    totalCentavos:Number(row.total_centavos),remainingCentavos:Number(BigInt(row.balance_before_centavos)-BigInt(row.principal_centavos)),
    channelCode:row.channel_code,currency:'PHP',environment:'test',isSample:true,state:row.state,
    expiresAt:row.expires_at,createdAt:row.created_at,gatewayConnected:Boolean(row.provider_session_id),
    checkoutUrl:row.state==='Active' && !row.cancel_requested_at ? row.checkout_url ?? null : null,
    cancellationPending:Boolean(row.cancel_requested_at && !row.provider_payment_id && ['Active','Creating','Review'].includes(row.state)),
    refundReview:Boolean(row.state==='Review'&&row.provider_payment_id),
    receiptId:row.receipt_id?Number(row.receipt_id):null,payerName:row.payer_name??null,schoolId:row.school_id??null,
    description:row.description??null,reviewCode:row.review_code??null,
  }
}

export function createPaymentsService(database: Pool = db, options: Options = {}) {
  const enabled = options.enabled ?? (() => env.xendit.enabled)
  const checkoutEnabled=options.checkoutEnabled??(()=>options.enabled?true:env.xendit.enabled&&env.xendit.checkoutEnabled!==false)
  const clock = options.clock ?? (() => new Date())

  function available() {
    if (!enabled()) throw paymentError('Online payments are currently unavailable. You can pay at the library.', 'ONLINE_PAYMENTS_UNAVAILABLE',503)
  }
  function borrower(actor: PaymentActor) {
    available()
    if (!['Student','Faculty'].includes(String(actor.role))) throw paymentError('Use a borrower account for this payment.','PAYMENT_ROLE_FORBIDDEN',403)
    return positiveId(actor.accountId)
  }
  async function transaction<T>(run: (repository: ReturnType<typeof createPaymentsRepository>, connection: Awaited<ReturnType<Pool['getConnection']>>) => Promise<T>) {
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const result = await run(createPaymentsRepository(connection),connection)
      await connection.commit()
      return result
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }
  async function owner(repository: ReturnType<typeof createPaymentsRepository>, accountId: number) {
    const row = await repository.owner(accountId)
    if (!row || !['Student','Faculty'].includes(row.role)) throw paymentError('Sign in again to review this payment.','PAYMENT_OWNER_UNAVAILABLE',401)
    return Number(row.user_id)
  }
  async function balance(repository: ReturnType<typeof createPaymentsRepository>, target: PaymentTarget, userId: number) {
    const row = await repository.charge(target,userId)
    if (!row) throw paymentError('This bill or fine is unavailable.','PAYMENT_TARGET_NOT_FOUND',404)
    if (row.accruing) throw paymentError('Return the overdue book before paying its changing fine.','FINE_STILL_ACCRUING')
    if (row.job_status === 'Cancelled' || ['Paid','Waived','Voided'].includes(row.status)) throw paymentError('This bill or fine is already settled or unavailable.')
    const remaining = zeroOrCentavos(row.assessed)-zeroOrCentavos(row.paid)-zeroOrCentavos(row.adjusted)
    if (remaining <= 0n) throw paymentError('This bill or fine is already settled.')
    return remaining
  }

  return {
    async userList(actor:PaymentActor,query:Record<string,unknown>){
      if(!['Student','Faculty'].includes(String(actor.role)))throw paymentError('Use a borrower account.','PAYMENT_ROLE_FORBIDDEN',403)
      const accountId=positiveId(actor.accountId),filters=parsePaymentFilters(query),view=query.view??'pending'
      if(typeof view!=='string'||!['pending','history'].includes(view))throw paymentError('Choose pending payments or payment history.')
      const onlineEnabled=enabled()
      if(!onlineEnabled){
        const [installed]=await database.execute<RowDataPacket[]>("SELECT to_regclass('public.online_payment_attempts') IS NOT NULL AS installed")
        if(!installed[0]?.installed)return {enabled:false,items:[],pagination:{page:filters.page,limit:filters.limit,total:0}}
      }
      return transaction(async repository=>{
        const userId=await owner(repository,accountId)
        const result=await repository.userList(filters,accountId,userId,view as 'pending'|'history')
        return {enabled:onlineEnabled,items:result.rows.map(publicPayment),pagination:{page:filters.page,limit:filters.limit,total:result.total}}
      })
    },
    async options(actor: PaymentActor, query: unknown) {
      if (!['Student','Faculty'].includes(String(actor.role))) throw paymentError('Use a borrower account.','PAYMENT_ROLE_FORBIDDEN',403)
      const target=parseTarget(query),accountId=positiveId(actor.accountId)
      if (!enabled()) return {enabled:false,isSample:true,methods:[],active:null,balanceCentavos:0,paymentAllowed:false}
      return transaction(async repository=>{
        const userId=await owner(repository,accountId),charge=await repository.charge(target,userId)
        if (!charge) throw paymentError('This bill or fine is unavailable.','PAYMENT_TARGET_NOT_FOUND',404)
        const remaining=zeroOrCentavos(charge.assessed)-zeroOrCentavos(charge.paid)-zeroOrCentavos(charge.adjusted)
        const {rules,active}=await repository.options(accountId,target)
        return {enabled:true,isSample:true,balanceCentavos:Number(remaining>0n?remaining:0n),
          paymentAllowed:checkoutEnabled() && remaining>0n && !charge.accruing && charge.job_status!=='Cancelled' && !['Paid','Waived','Voided'].includes(charge.status),
          active:active?publicPayment(active):null,methods:rules.filter(rule=>rule.is_sample).map(rule=>({
            channelCode:String(rule.channel_code),displayName:String(rule.display_name),
            minTotalCentavos:Number(rule.min_total_centavos),maxTotalCentavos:Number(rule.max_total_centavos),
          }))}
      })
    },
    async quote(actor: PaymentActor, body: unknown) {
      const accountId = borrower(actor), input = parseQuote(body)
      if(!checkoutEnabled())throw paymentError('New online payments are paused. Existing payments can still be checked.','ONLINE_CHECKOUT_PAUSED',503)
      return transaction(async repository => {
        const userId = await owner(repository,accountId)
        const remaining = await balance(repository,input,userId)
        const principal = input.amount ?? remaining
        if (principal > remaining || (input.kind !== 'Fine' && principal !== remaining)) {
          throw paymentError(input.kind === 'Fine' ? 'Enter an amount within the remaining balance.' : 'Pay the full amount of this bill or replacement charge.')
        }
        const rule = await repository.fee(input.channelCode)
        if (!rule || !rule.is_sample) throw paymentError('This payment method needs a configured sandbox fee.')
        const amounts = feeTotal(principal,{fixed:BigInt(rule.fixed_centavos),percentage:Number(rule.percentage_basis_points),tax:Number(rule.tax_basis_points)})
        if (amounts.total < BigInt(rule.min_total_centavos) || amounts.total > BigInt(rule.max_total_centavos)) {
          throw paymentError('This amount is outside the selected method’s limits. Choose another method or pay cash.','PAYMENT_CHANNEL_LIMIT')
        }
        const now = clock()
        const quote = await repository.insertQuote({
          accountId,userId,target:input,ruleId:Number(rule.fee_rule_id),channel:input.channelCode,
          ...amounts,balance:remaining,now,expires:new Date(now.getTime()+5*60_000),
        })
        return publicPayment(quote)
      })
    },

    async prepare(actor: PaymentActor, body: unknown) {
      const accountId = borrower(actor), input = parseCheckout(body)
      return transaction(async repository => {
        const userId = await owner(repository,accountId)
        const retry = await repository.retry(input.requestKey,accountId)
        if (retry) {
          if (retry.payment_id !== input.quoteId) throw paymentError('This retry key belongs to another payment.','PAYMENT_RETRY_CONFLICT',409)
          return publicPayment(retry)
        }
        const quote = await repository.payment(input.quoteId,accountId)
        if (!quote || Number(quote.user_id)!==userId) throw paymentError('This payment review is unavailable.','PAYMENT_NOT_FOUND',404)
        const now = clock()
        if (quote.state !== 'Quoted' || new Date(quote.expires_at).getTime()<=now.getTime()) {
          throw paymentError('Review the current amount and payment method again.','PAYMENT_QUOTE_EXPIRED',409)
        }
        const target = targetOf(quote)
        const remaining = await balance(repository,target,userId)
        const rule = await repository.fee(quote.channel_code)
        if (remaining !== BigInt(quote.balance_before_centavos) || Number(rule?.fee_rule_id)!==Number(quote.fee_rule_id)) {
          throw paymentError('The balance or fee changed. Review the new total before continuing.','PAYMENT_QUOTE_CHANGED',409)
        }
        await repository.expirePrepared(target,now)
        if (await repository.active(target)) throw paymentError('A payment is already being prepared for this bill. Open its existing payment review.','PAYMENT_ALREADY_ACTIVE',409)
        return publicPayment(await repository.prepare(quote.payment_id,input.requestKey,now,new Date(now.getTime()+10*60_000)))
      })
    },

    async read(actor: PaymentActor, value: unknown) {
      const accountId = borrower(actor), id = paymentId(value)
      return transaction(async repository => {
        const userId = await owner(repository,accountId)
        const row = await repository.payment(id,accountId)
        if (!row || Number(row.user_id)!==userId) throw paymentError('This payment record is unavailable.','PAYMENT_NOT_FOUND',404)
        return publicPayment(row)
      })
    },

    async setFee(actor: PaymentActor, body: unknown) {
      available()
      const accountId = positiveId(actor.accountId), input = parseFeeRule(body)
      return transaction(async (repository,connection) => {
        await requireLibraryActor(connection,accountId,'library.manage')
        await connection.execute('SELECT account_id FROM accounts WHERE account_id=? FOR UPDATE',[accountId])
        await connection.execute('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',['online-fee:'+input.channelCode])
        const previous = await repository.feeRetry(accountId,input.requestKey)
        if (previous) {
          const matches = previous.channel_code===input.channelCode && previous.display_name===input.displayName
            && BigInt(previous.fixed_centavos)===input.fixed && Number(previous.percentage_basis_points)===input.percentage
            && Number(previous.tax_basis_points)===input.tax && BigInt(previous.min_total_centavos)===input.min
            && BigInt(previous.max_total_centavos)===input.max
          if (!matches) throw paymentError('This retry key belongs to another fee change.','PAYMENT_RETRY_CONFLICT',409)
          return {feeRuleId:Number(previous.fee_rule_id),environment:'test',isSample:true}
        }
        const row = await repository.insertFee(accountId,input)
        return {feeRuleId:Number(row.fee_rule_id),environment:'test',isSample:true}
      })
    },

    async list(actor: PaymentActor, query: Record<string, unknown>) {
      available()
      const accountId = positiveId(actor.accountId), filters = parsePaymentFilters(query)
      return transaction(async (repository,connection) => {
        await requireLibraryActor(connection,accountId,'desk.operate')
        const result = await repository.list(filters)
        const methods=await repository.methods()
        return {items:result.rows.map(publicPayment),pagination:{page:filters.page,limit:filters.limit,total:result.total},
          methods:methods.map(method=>({channelCode:String(method.channel_code),displayName:String(method.display_name)}))}
      })
    },
  }
}

export const paymentsService = createPaymentsService()
