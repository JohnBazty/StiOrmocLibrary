import {act,cleanup,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {PaymentResultPage} from './PaymentResultPage'
const api=vi.hoisted(()=>({check:vi.fn(),read:vi.fn()}))
const navigation=vi.hoisted(()=>({handoff:vi.fn()}))
vi.mock('./payments-api',async(original)=>({...await original<typeof import('./payments-api')>(),paymentsApi:api}))
vi.mock('./payment-navigation',async(original)=>({...await original<typeof import('./payment-navigation')>(),handoffToProvider:navigation.handoff}))
const id='00000000-0000-4000-8000-000000000001'
const payment={paymentId:id,kind:'Fine',targetId:1,principalCentavos:4000,feeCentavos:140,totalCentavos:4140,remainingCentavos:6000,channelCode:'GCASH',state:'Review',isSample:true,checkoutUrl:null,receiptId:null}
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers()})
it('refreshes a pending return automatically and stops once the server verifies payment',async()=>{
  vi.useFakeTimers()
  api.check.mockResolvedValueOnce({...payment,state:'Active'}).mockResolvedValue({...payment,state:'Succeeded',remainingCentavos:0})
  await act(async()=>{render(<MemoryRouter initialEntries={['/payments/result?payment='+id]}><PaymentResultPage/></MemoryRouter>)})
  await act(async()=>{await vi.advanceTimersByTimeAsync(15000)})
  expect(screen.getByText('Paid')).toBeTruthy()
  await act(async()=>{await vi.advanceTimersByTimeAsync(60000)})
  expect(api.check).toHaveBeenCalledTimes(2)
})
it('a claimed success in the return URL never overrides saved server status',async()=>{
  api.check.mockResolvedValue(payment)
  render(<MemoryRouter initialEntries={['/payments/result?payment='+id+'&status=paid']}><PaymentResultPage/></MemoryRouter>)
  expect(await screen.findByText('Needs review')).toBeTruthy()
  expect(screen.queryByText('Paid')).toBeNull()
  expect(screen.queryByRole('button',{name:'Download payment record'})).toBeNull()
})
it('rejects a malformed payment reference without a provider lookup',async()=>{
  render(<MemoryRouter initialEntries={['/payments/result?payment=not-a-payment']}><PaymentResultPage/></MemoryRouter>)
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Choose a payment'))
  expect(api.check).not.toHaveBeenCalled()
})
it('hands off only once and refreshes the saved payment when the user returns',async()=>{
  api.check.mockResolvedValue({...payment,state:'Active',checkoutUrl:'https://dev.xen.to/payment'})
  render(<MemoryRouter initialEntries={['/payments/result?payment='+id+'&checkout=1']}><PaymentResultPage/></MemoryRouter>)
  await waitFor(()=>expect(navigation.handoff).toHaveBeenCalledTimes(1))
  await act(async()=>{window.dispatchEvent(new Event('focus'))})
  expect(api.check).toHaveBeenCalledTimes(2)
  expect(navigation.handoff).toHaveBeenCalledTimes(1)
})
it('uses normal confirmation labels and discloses Sandbox without paying the school bill',async()=>{
  api.check.mockResolvedValue({...payment,state:'Succeeded',localPreview:true,remainingCentavos:10000,description:'Test checkout — real bill remains unpaid'})
  render(<MemoryRouter initialEntries={['/payments/result?payment='+id]}><PaymentResultPage/></MemoryRouter>)
  expect(await screen.findByRole('heading',{name:'Payment complete'})).toBeTruthy()
  expect(screen.getByText('Payment successful')).toBeTruthy()
  expect(screen.queryByText(/No real money|Sandbox/)).toBeNull()
  expect(screen.queryByText(/unchanged/)).toBeNull()
  expect(screen.queryByText(/Test checkout/)).toBeNull()
  expect(screen.queryByRole('button',{name:'Download payment record'})).toBeNull()
})
