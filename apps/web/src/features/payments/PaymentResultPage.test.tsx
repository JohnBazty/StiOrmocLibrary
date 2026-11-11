import {cleanup,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {PaymentResultPage} from './PaymentResultPage'
const api=vi.hoisted(()=>({check:vi.fn(),read:vi.fn()}))
vi.mock('./payments-api',async(original)=>({...await original<typeof import('./payments-api')>(),paymentsApi:api}))
const id='00000000-0000-4000-8000-000000000001'
const payment={paymentId:id,kind:'Fine',targetId:1,principalCentavos:4000,feeCentavos:140,totalCentavos:4140,remainingCentavos:6000,channelCode:'GCASH',state:'Review',isSample:true,checkoutUrl:null,receiptId:null}
afterEach(()=>{cleanup();vi.clearAllMocks()})
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
