import { paymentId } from './payments.validation.ts'

/** Only server configuration supplies this address; the payer cannot choose it. */
export function paymentReturnUrl(base: string | null | undefined, id: string) {
  if (!base) return null
  let url: URL
  try { url = new URL(base) } catch { throw new Error('Payment return address must be a valid HTTPS URL.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || url.pathname !== '/payments/result' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Payment return address must use HTTPS and the /payments/result path.')
  }
  url.searchParams.set('payment', paymentId(id))
  return url.href
}
