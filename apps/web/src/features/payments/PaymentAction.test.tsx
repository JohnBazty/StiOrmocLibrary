import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { PaymentAction } from './PaymentAction'
const api=vi.hoisted(()=>({options:vi.fn(),quote:vi.fn(),checkout:vi.fn(),check:vi.fn(),resume:vi.fn(),cancel:vi.fn()}))
vi.mock('./payments-api',async(importOriginal)=>({...await importOriginal<typeof import('./payments-api')>(),paymentsApi:api}))
const method={channelCode:'GCASH',displayName:'GCash',minTotalCentavos:100,maxTotalCentavos:1000000}
const quoted={paymentId:'00000000-0000-4000-8000-000000000001',kind:'Fine',targetId:1,principalCentavos:4000,feeCentavos:140,totalCentavos:4140,remainingCentavos:6000,state:'Quoted',isSample:true,channelCode:'GCASH',receiptId:null,checkoutUrl:null}
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('shows a reviewed partial payment with separate fees and prevents duplicate checkout clicks',async()=>{
  api.options.mockResolvedValue({enabled:true,paymentAllowed:true,methods:[method],active:null,balanceCentavos:10000,isSample:true})
  api.quote.mockResolvedValue(quoted)
  let finish:(value:unknown)=>void=()=>{}
  api.checkout.mockReturnValue(new Promise(resolve=>{finish=resolve}))
  render(<PaymentAction kind="Fine" targetId={1} title="Library fine"/>)
  fireEvent.click(await screen.findByRole('button',{name:'Pay online'}))
  fireEvent.click(screen.getByLabelText('Pay part of the balance'))
  fireEvent.change(screen.getByLabelText('Amount to pay'),{target:{value:'40'}})
  await waitFor(()=>expect(api.quote).toHaveBeenLastCalledWith({kind:'Fine',targetId:1,channelCode:'GCASH',amount:'40'}))
  expect(await screen.findByText('₱41.40')).toBeTruthy()
  expect(screen.getByText('₱1.40')).toBeTruthy()
  const button=screen.getByRole('button',{name:'Continue to Xendit'})
  fireEvent.click(button);fireEvent.click(button)
  expect(api.checkout).toHaveBeenCalledTimes(1)
  finish({...quoted,state:'Review'})
  expect(await screen.findByText('Needs review')).toBeTruthy()
})
it('keeps the cash option when online payments are disabled',async()=>{
  api.options.mockResolvedValue({enabled:false,methods:[],active:null})
  render(<PaymentAction kind="Printing" targetId={1} title="Print bill"/>)
  fireEvent.click(screen.getByRole('button',{name:'Pay cash at library'}))
  expect(await screen.findByText(/No online transaction fee/)).toBeTruthy()
  await waitFor(()=>expect(api.options).toHaveBeenCalled())
  expect(screen.queryByRole('button',{name:'Pay online'})).toBeNull()
})
