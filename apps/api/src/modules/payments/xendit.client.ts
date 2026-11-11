import { createHash, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'
import type { XenditSandboxConfig } from '../../config/xendit-sandbox.ts'
import { centavos, paymentError, paymentId } from './payments.validation.ts'

export type ProviderObject = Record<string, any>
export type SessionEvent = {
  eventId: string; eventType: string; paymentId: string; sessionId: string
  businessId: string; reference: string; amount: string; currency: 'PHP'; status: string
  providerPaymentId: string | null
}
const unavailable = () => paymentError('Payment provider is temporarily unavailable.','PAYMENT_PROVIDER_UNAVAILABLE',503)
const mismatch = () => paymentError('This payment needs library review.','PAYMENT_EVIDENCE_MISMATCH',409)
const sessionId = (value: unknown) => {
  if (typeof value !== 'string' || !/^ps-[a-f\d]{24}$/i.test(value)) throw mismatch()
  return value
}
export const paymentReference = (id: string) => 'sti-pay-'+paymentId(id)

export function checkoutUrl(value: unknown) {
  if (typeof value !== 'string' || value.length>2048) throw mismatch()
  let url: URL
  try { url = new URL(value) } catch { throw mismatch() }
  if (url.protocol!=='https:' || !['dev.xen.to','checkout-staging.xendit.co'].includes(url.hostname)
    || url.username || url.password || url.port || url.hash) throw mismatch()
  return url.href
}

export function authenticateCallback(value: string | undefined, configured: string) {
  if (!value || value.length>256 || !configured) return false
  const supplied = Buffer.from(value), expected = Buffer.from(configured)
  return supplied.length===expected.length && timingSafeEqual(supplied,expected)
}

export function parseSessionEvent(value: unknown): SessionEvent {
  const body = value as ProviderObject, data = body?.data as ProviderObject
  if (!body || !['payment_session.completed','payment_session.expired'].includes(body.event)
    || body.is_live===true || data?.is_live===true || (data?.metadata?.environment && data.metadata.environment!=='test')
    || typeof body.business_id!=='string' || !body.business_id || body.business_id.length>100
    || !data || data.currency!=='PHP' || data.country!=='PH' || data.session_type!=='PAY' || data.mode!=='PAYMENT_LINK'
    || !['COMPLETED','EXPIRED'].includes(data.status) || typeof data.reference_id!=='string'
    || !data.reference_id.startsWith('sti-pay-')) throw mismatch()
  const id = paymentId(data.reference_id.slice(8)), providerSessionId = sessionId(data.payment_session_id)
  const providerPaymentId = typeof data.payment_id==='string' && /^py-[A-Za-z0-9-]{1,100}$/.test(data.payment_id) ? data.payment_id : null
  if (data.payment_id && !providerPaymentId) throw mismatch()
  return {
    eventId:createHash('sha256').update(body.event+':'+providerSessionId).digest('hex'),
    eventType:body.event,paymentId:id,sessionId:providerSessionId,businessId:body.business_id,
    reference:data.reference_id,amount:centavos(data.amount).toString(),currency:'PHP',status:data.status,providerPaymentId,
  }
}

export function verifySession(session: ProviderObject, attempt: ProviderObject) {
  sessionId(session.payment_session_id)
  if (session.reference_id!==paymentReference(attempt.payment_id) || session.currency!=='PHP' || session.country!=='PH'
    || session.session_type!=='PAY' || session.mode!=='PAYMENT_LINK' || session.capture_method==='MANUAL'
    || !session.business_id || typeof session.business_id!=='string' || session.business_id.length>100
    || session.is_live===true || (session.metadata?.environment && session.metadata.environment!=='test')
    || centavos(session.amount)!==BigInt(attempt.total_centavos)
    || (attempt.provider_session_id && session.payment_session_id!==attempt.provider_session_id)
    || (attempt.provider_business_id && session.business_id!==attempt.provider_business_id)
    || !Array.isArray(session.allowed_payment_channels) || session.allowed_payment_channels.length!==1
    || session.allowed_payment_channels[0]!==attempt.channel_code
    || !['ACTIVE','COMPLETED','EXPIRED','CANCELED'].includes(session.status)) throw mismatch()
}

export function verifyCapturedPayment(payment: ProviderObject, session: ProviderObject, attempt: ProviderObject) {
  const total = BigInt(attempt.total_centavos)
  const requestId = session.payment_request_id ?? session.latest_payment_request_id
  if (payment.payment_id!==session.payment_id || payment.business_id!==session.business_id
    || !requestId || payment.payment_request_id!==requestId
    || payment.type!=='PAY' || payment.country!=='PH' || payment.currency!=='PHP' || payment.status!=='SUCCEEDED'
    || payment.capture_method!=='AUTOMATIC' || payment.channel_code!==attempt.channel_code || payment.is_live===true
    || centavos(payment.request_amount)!==total || !Array.isArray(payment.captures) || !payment.captures.length) throw mismatch()
  const captureIds = new Set<string>()
  let captured = 0n
  for (const capture of payment.captures) {
    if (typeof capture.capture_id!=='string' || !capture.capture_id || captureIds.has(capture.capture_id)) throw mismatch()
    captureIds.add(capture.capture_id)
    captured += centavos(capture.capture_amount)
  }
  if (captured!==total) throw mismatch()
}

export function createXenditClient(config: () => XenditSandboxConfig = () => env.xendit, fetcher: typeof fetch = fetch) {
  async function call(path: string, body?: ProviderObject) {
    const settings = config()
    if (!settings.enabled || !settings.secretKey.startsWith('xnd_development_')) throw unavailable()
    try {
      const response = await fetcher('https://api.xendit.co'+path,{
        method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10_000),
        headers:{Authorization:'Basic '+Buffer.from(settings.secretKey+':').toString('base64'),
          'Content-Type':'application/json',Accept:'application/json',...(path.startsWith('/v3/')?{'api-version':'2024-11-11'}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),
      })
      if (!response.ok || !response.body) { await response.body?.cancel(); throw unavailable() }
      const reader = response.body.getReader(), chunks: Uint8Array[] = []
      let size = 0
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size>65_536) { await reader.cancel(); throw unavailable() }
        chunks.push(chunk.value)
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!result || typeof result!=='object' || Array.isArray(result)) throw unavailable()
      return result as ProviderObject
    } catch { throw unavailable() }
  }
  return {
    createSession:(body: ProviderObject)=>call('/sessions',body),
    cancelSession:(id: string)=>call('/sessions/'+sessionId(id)+'/cancel',{}),
    getSession:(id: string)=>call('/sessions/'+sessionId(id)),
    getPayment:(id: string)=>{
      if (!/^py-[A-Za-z0-9-]{1,100}$/.test(id)) return Promise.reject(mismatch())
      return call('/v3/payments/'+encodeURIComponent(id))
    },
  }
}
