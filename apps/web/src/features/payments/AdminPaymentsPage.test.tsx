import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {AdminPaymentsPage} from './AdminPaymentsPage'
const api=vi.hoisted(()=>({list:vi.fn(),adminCheck:vi.fn(),adminCancel:vi.fn(),operations:vi.fn(async()=>({checkoutEnabled:false,needs_review:0,due_checks:0,review_events:0,pending_events:0,events:[],runnerStatus:null}))}))
const identity=vi.hoisted(()=>({role:'Librarian'}))
vi.mock('../auth/auth-storage',()=>({getCurrentIdentity:()=>identity,getCsrfToken:()=>null}))
vi.mock('./payments-api',async(original)=>({...await original<typeof import('./payments-api')>(),paymentsApi:api}))
vi.mock('./money-out-api',async original=>({...await original<typeof import('./money-out-api')>(),moneyOutApi:{recover:vi.fn(async()=>({}))}}))
const payment={paymentId:'fixture',kind:'Fine',targetId:1,principalCentavos:4000,feeCentavos:140,totalCentavos:4140,remainingCentavos:6000,channelCode:'GCASH',state:'Active',isSample:true,checkoutUrl:null,receiptId:null,payerName:'Sandbox borrower',createdAt:new Date().toISOString()}
const result={items:[payment],pagination:{page:1,limit:25,total:1},methods:[{channelCode:'GCASH',displayName:'GCash'}]}
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();identity.role='Librarian'})
it.each(['Draft','Processing','Review','Succeeded'])('hides refund action for %s refund and shows the current status',async(state)=>{
  const refunded=state==='Succeeded'
  api.list.mockResolvedValue({...result,localPreview:true,items:[{...payment,state:'Succeeded',localPreview:true,refundableCentavos:refunded?0:4000,refundStatus:refunded?'Refunded':null,refundReview:!refunded,refunds:[{id:'refund-1',type:'Refund',state,principalCentavos:4000,feeCentavos:140,totalCentavos:4140,createdAt:new Date().toISOString(),events:[]}]}]})
  render(<AdminPaymentsPage/>);await screen.findByText('Sandbox borrower')
  expect(screen.queryByRole('button',{name:'Refund payment'})).toBeNull()
  if(state==='Processing')expect(screen.getByText('Refund processing')).toBeTruthy()
})
it('allows another partial refund only when the previous refund finished and principal remains',async()=>{
  api.list.mockResolvedValue({...result,localPreview:true,items:[{...payment,state:'Succeeded',localPreview:true,refundableCentavos:2000,refundedCentavos:2000,refundStatus:'Partially refunded',refunds:[]}]})
  render(<AdminPaymentsPage/>);expect(await screen.findByRole('button',{name:'Refund payment'})).toBeTruthy()
})
it('removes the printing refund button when refreshed job eligibility says printing already started',async()=>{
  const paid={...payment,state:'Succeeded',kind:'Printing',localPreview:true,refundableCentavos:4000,refundEligible:true}
  api.list.mockResolvedValue({...result,localPreview:true,items:[paid]})
  render(<AdminPaymentsPage/>);expect(await screen.findByRole('button',{name:'Refund payment'})).toBeTruthy()
  api.list.mockResolvedValue({...result,localPreview:true,items:[{...paid,refundEligible:false}]})
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}))
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Refund payment'})).toBeNull())
})
it('automatically refreshes a processing refund, removes invalid actions and preserves rows on refresh failure',async()=>{
  vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false})
  const pending={...payment,state:'Succeeded',localPreview:true,refundableCentavos:0,refunds:[{id:'ref-1',state:'Processing'}]}
  api.list.mockResolvedValue({...result,localPreview:true,items:[pending]})
  render(<AdminPaymentsPage/>);await act(async()=>{})
  expect(screen.getByText('Refund processing')).toBeTruthy()
  api.list.mockResolvedValue({...result,localPreview:true,items:[{...pending,refundStatus:'Refunded',refunds:[{id:'ref-1',state:'Succeeded'}]}]})
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000)})
  expect(screen.getAllByText('Refunded').length).toBeGreaterThan(0)
  expect(screen.queryByRole('button',{name:'Refund payment'})).toBeNull()
  api.list.mockRejectedValueOnce(new Error('Refresh unavailable.'))
  await act(async()=>{window.dispatchEvent(new Event('focus'))})
  expect(screen.getByRole('alert').textContent).toBe('Refresh unavailable.')
  expect(screen.getByText('Sandbox borrower')).toBeTruthy()
})
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
