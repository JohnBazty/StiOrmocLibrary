import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {AdminPaymentsPage} from './AdminPaymentsPage'
const api=vi.hoisted(()=>({list:vi.fn(),adminCheck:vi.fn(),adminCancel:vi.fn()}))
const identity=vi.hoisted(()=>({role:'Librarian'}))
vi.mock('../auth/auth-storage',()=>({getCurrentIdentity:()=>identity,getAccessToken:()=>null}))
vi.mock('./payments-api',async(original)=>({...await original<typeof import('./payments-api')>(),paymentsApi:api}))
const payment={paymentId:'fixture',kind:'Fine',targetId:1,principalCentavos:4000,feeCentavos:140,totalCentavos:4140,remainingCentavos:6000,channelCode:'GCASH',state:'Active',isSample:true,checkoutUrl:null,receiptId:null,payerName:'Sandbox borrower',createdAt:new Date().toISOString()}
const result={items:[payment],pagination:{page:1,limit:25,total:1},methods:[{channelCode:'GCASH',displayName:'GCash'}]}
afterEach(()=>{cleanup();vi.clearAllMocks();identity.role='Librarian'})
it('filters payments by status and friendly payment-method names',async()=>{
  api.list.mockResolvedValue(result)
  render(<AdminPaymentsPage/>)
  await screen.findByText('Sandbox borrower')
  fireEvent.change(screen.getByRole('combobox',{name:'Payment status'}),{target:{value:'Review'}})
  fireEvent.change(screen.getByRole('combobox',{name:'Payment method'}),{target:{value:'GCASH'}})
  await waitFor(()=>expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({state:'Review',channel:'GCASH',page:1})))
})
it('Staff can check payments but cannot cancel or download restricted receipts',async()=>{
  identity.role='Staff';api.list.mockResolvedValue(result)
  render(<AdminPaymentsPage/>)
  await screen.findByText('Sandbox borrower')
  expect(screen.getByRole('button',{name:'Check status'})).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Cancel online payment'})).toBeNull()
})
it('a slow earlier filter response cannot replace the latest results',async()=>{
  let resolveOld!:(value:typeof result)=>void
  api.list.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve})).mockResolvedValue(result)
  render(<AdminPaymentsPage/>)
  fireEvent.change(screen.getByRole('combobox',{name:'Payment status'}),{target:{value:'Review'}})
  await screen.findByText('Sandbox borrower')
  await act(async()=>resolveOld({...result,items:[{...payment,payerName:'Stale result'}]}))
  expect(screen.queryByText('Stale result')).toBeNull()
  expect(screen.getByText('Sandbox borrower')).toBeTruthy()
})
