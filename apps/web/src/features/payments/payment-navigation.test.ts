import { afterEach, expect, it, vi } from 'vitest'
import { handoffToProvider, openPaymentReviewResult, openWalletPayment } from './payment-navigation'
import type { Payment } from './payments-api'

const payment = { paymentId: '00000000-0000-4000-8000-000000000001', checkoutUrl: 'https://dev.xen.to/payment' } as Payment
afterEach(() => vi.unstubAllGlobals())

it('opens the dedicated wallet page with only the quote ID in its address',()=>{
 const assign=vi.fn();vi.stubGlobal('window',{location:{assign}})
 openWalletPayment(payment)
 expect(assign).toHaveBeenCalledWith('/payments/wallet?payment='+payment.paymentId)
})

it('keeps our confirmation in history before opening the verified provider checkout', () => {
  const browser = { location: { assign: vi.fn() }, history: { state: { idx: 2 }, replaceState: vi.fn() } }
  vi.stubGlobal('window', browser)
  openPaymentReviewResult(payment)
  expect(browser.location.assign).toHaveBeenCalledWith('/payments/result?payment=' + payment.paymentId + '&checkout=1')
  browser.location.assign.mockClear()
  handoffToProvider(payment)
  expect(browser.history.replaceState).toHaveBeenCalledWith({ idx: 2 }, '', '/payments/result?payment=' + payment.paymentId)
  expect(browser.location.assign).toHaveBeenCalledWith(payment.checkoutUrl)
  expect(browser.history.replaceState.mock.invocationCallOrder[0]).toBeLessThan(browser.location.assign.mock.invocationCallOrder[0])
})

it('refuses an untrusted checkout without changing the page or browser history', () => {
  const browser = { location: { assign: vi.fn() }, history: { state: null, replaceState: vi.fn() } }
  vi.stubGlobal('window', browser)
  expect(() => handoffToProvider({ ...payment, checkoutUrl: 'https://untrusted.example/payment' })).toThrow()
  expect(browser.history.replaceState).not.toHaveBeenCalled()
  expect(browser.location.assign).not.toHaveBeenCalled()
})
