import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {UserPaymentsPage} from './UserPaymentsPage'
const api=vi.hoisted(()=>({transactions:vi.fn(),sync:vi.fn().mockResolvedValue({checked:0,failed:0})}))
vi.mock('./payments-api',async(original)=>({...await original<typeof import('./payments-api')>(),paymentsApi:api}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('shows onsite and online records together and filters the same list',async()=>{
  api.transactions.mockResolvedValue({items:[{id:'Fine:1',channel:'Onsite',kind:'Fine',reference:'CASH-ONE',description:'Fine payment',method:'Cash',status:'Issued',date:'2026-11-11T10:00:00Z',amountCentavos:4000,principalCentavos:4000,feeCentavos:0,receiptId:1,payment:null},{id:'Online:1',channel:'Online',kind:'Printing',reference:'ONLINE-ONE',description:'Printing payment',method:'GCASH',status:'Cancelled',date:'2026-11-11T11:00:00Z',amountCentavos:5150,principalCentavos:5000,feeCentavos:150,receiptId:null,payment:null}],pagination:{page:1,limit:12,total:2}})
  render(<MemoryRouter><UserPaymentsPage/></MemoryRouter>)
  expect(await screen.findByText('CASH-ONE')).toBeTruthy();expect(screen.getByText('ONLINE-ONE')).toBeTruthy()
  expect(screen.getByRole('heading',{name:'Transactions'})).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Unpaid'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Onsite'}))
  await waitFor(()=>expect(api.transactions).toHaveBeenLastCalledWith({channel:'Onsite',search:'',page:1}))
})
it('keeps a failed load distinct from no transactions',async()=>{
  api.transactions.mockRejectedValue(new Error('Records unavailable'))
  render(<MemoryRouter><UserPaymentsPage/></MemoryRouter>)
  expect((await screen.findByRole('alert')).textContent).toContain('Records unavailable')
  expect(screen.queryByText('No transactions yet.')).toBeNull()
})
it('opens owned online status from a normal Sandbox transaction row',async()=>{
  const paymentId='00000000-0000-4000-8000-000000000001'
  api.transactions.mockResolvedValue({items:[{id:'Sandbox:one',channel:'Online',kind:'Fine',reference:'PAY-00000000',description:'Test checkout — bill remains unpaid',method:'GCASH',status:'Succeeded',date:'2026-11-12T01:00:00Z',amountCentavos:4140,principalCentavos:4000,feeCentavos:140,receiptId:null,payment:{paymentId,localPreview:true,isSample:true,state:'Succeeded',remainingCentavos:10000}}],pagination:{page:1,limit:12,total:1}})
  render(<MemoryRouter><UserPaymentsPage/></MemoryRouter>)
  expect(await screen.findByText('Payment successful')).toBeTruthy()
  expect(screen.getByText('Payment successful')).toBeTruthy()
  expect(screen.getByRole('link',{name:'View status'}).getAttribute('href')).toBe('/payments/result?payment='+paymentId)
  expect(screen.queryByText(/Test checkout/)).toBeNull()
  expect(screen.queryByRole('button',{name:/Download/})).toBeNull()
})
