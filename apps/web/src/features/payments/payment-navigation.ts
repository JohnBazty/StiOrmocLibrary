import { providerCheckout, type Payment } from './payments-api'

export const paymentResultPath = (payment: Pick<Payment, 'paymentId'>, checkout = false) =>
  '/payments/result?' + new URLSearchParams({ payment: payment.paymentId, ...(checkout ? { checkout: '1' } : {}) })

export const paymentWalletPath = (payment: Pick<Payment, 'paymentId'>) =>
  '/payments/wallet?' + new URLSearchParams({ payment: payment.paymentId })

/** Only the quote ID belongs in navigation; number and PIN stay in page memory. */
export function openWalletPayment(payment: Pick<Payment, 'paymentId'>) {
  window.location.assign(paymentWalletPath(payment))
}

/** Save the library confirmation page in browser history before leaving for Xendit. */
export function openPaymentReviewResult(payment: Payment) {
  if (!payment.checkoutUrl) return
  providerCheckout(payment.checkoutUrl)
  window.location.assign(paymentResultPath(payment, true))
}

export function handoffToProvider(payment: Payment) {
  if (!payment.checkoutUrl) return
  const destination = providerCheckout(payment.checkoutUrl)
  // Back returns to confirmation without automatically reopening checkout.
  window.history.replaceState(window.history.state, '', paymentResultPath(payment))
  window.location.assign(destination)
}
