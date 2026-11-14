import { HttpError } from '../../core/http-error.ts'

export const MAX_CENTAVOS = 9999999999n
export const paymentError = (message: string, code = 'PAYMENT_REVIEW_REQUIRED', status = 422) =>
  new HttpError(status, code, message)

function object(value: unknown, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) throw paymentError('Review the payment details and try again.')
  return value as Record<string, unknown>
}

export function centavos(value: unknown): bigint {
  if (!['string','number'].includes(typeof value) || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(String(value))) {
    throw paymentError('Enter a valid peso amount with up to two decimal places.')
  }
  const [whole, fraction = ''] = String(value).split('.')
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (amount < 1n || amount > MAX_CENTAVOS) throw paymentError('Enter an amount within the payable balance.')
  return amount
}

export function paymentId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) {
    throw paymentError('Choose a valid payment record.')
  }
  return value.toLowerCase()
}

function integer(value: unknown, max: number) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) throw paymentError('Review the fee settings.')
  return Number(value)
}

export function positiveId(value: unknown) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw paymentError('Choose a valid record.')
  return Number(value)
}

function channel(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Z0-9_]{2,50}$/.test(value)) throw paymentError('Choose a supported payment method.')
  return value
}

function retryKey(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{8,64}$/.test(value)) throw paymentError('Refresh the payment review and try again.')
  return value
}

export function parseQuote(value: unknown) {
  const body = object(value, ['kind','targetId','channelCode','amount'])
  if (!['Printing','Fine','LostBook'].includes(String(body.kind))) throw paymentError('Choose a printing bill or library fine.')
  return {
    kind: body.kind as 'Printing' | 'Fine' | 'LostBook', targetId: positiveId(body.targetId),
    channelCode: channel(body.channelCode), amount: body.amount === undefined ? null : centavos(body.amount),
  }
}

export function parseCheckout(value: unknown) {
  const body = object(value, ['quoteId','requestKey'])
  return { quoteId: paymentId(body.quoteId), requestKey: retryKey(body.requestKey) }
}

export function parseTarget(value: unknown) {
  const body=object(value,['kind','targetId'])
  if (!['Printing','Fine','LostBook'].includes(String(body.kind))) throw paymentError('Choose a printing bill or fine.')
  return {kind:body.kind as 'Printing'|'Fine'|'LostBook',targetId:positiveId(body.targetId)}
}

export function parseFeeRule(value: unknown) {
  const body = object(value, ['channelCode','displayName','fixedFee','percentageBasisPoints','taxBasisPoints','minTotal','maxTotal','requestKey'])
  const name = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  if (!name || name.length > 80) throw paymentError('Enter a short payment method name.')
  const fixed = /^0(?:\.0{1,2})?$/.test(String(body.fixedFee)) ? 0n : centavos(body.fixedFee)
  const min = centavos(body.minTotal), max = centavos(body.maxTotal)
  if (min > max) throw paymentError('The maximum payment must be at least the minimum payment.')
  return { channelCode: channel(body.channelCode), displayName: name, fixed,
    percentage: integer(body.percentageBasisPoints,10000), tax: integer(body.taxBasisPoints,10000),
    min, max, requestKey: retryKey(body.requestKey) }
}

export function feeTotal(principal: bigint, rule: {fixed: bigint; percentage: number; tax: number}) {
  const base = rule.fixed + (principal * BigInt(rule.percentage) + 5000n) / 10000n
  const fee = base + (base * BigInt(rule.tax) + 5000n) / 10000n
  const total = principal + fee
  if (total > MAX_CENTAVOS) throw paymentError('This amount exceeds the supported payment limit.')
  return { principal, fee, total }
}

export function parsePaymentFilters(query: Record<string, unknown>) {
  const state = query.state === undefined || query.state === '' ? null : String(query.state)
  if (state && !['Quoted','Prepared','Creating','Active','Succeeded','Expired','Cancelled','Review'].includes(state)) {
    throw paymentError('Choose a valid payment status.')
  }
  const page = query.page === undefined ? 1 : positiveId(query.page)
  if (page > 10000) throw paymentError('Choose an earlier results page.')
  const method=query.channel===undefined||query.channel===''?null:channel(query.channel)
  const kind=query.kind===undefined||query.kind===''?null:parseTarget({kind:query.kind,targetId:1}).kind
  return { state, channel:method, kind, page, limit: 25 }
}
