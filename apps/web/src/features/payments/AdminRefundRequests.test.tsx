import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { AdminRefundRequests } from './AdminRefundRequests'
const requestApi=vi.hoisted(()=>({list:vi.fn(),details:vi.fn(),reject:vi.fn()}))
const moneyApi=vi.hoisted(()=>({options:vi.fn(),refund:vi.fn(),confirm:vi.fn(),check:vi.fn(),cancel:vi.fn(),recover:vi.fn(async()=>({}))}))
vi.mock('./refund-requests-api',async original=>({...await original<typeof import('./refund-requests-api')>(),refundRequestsApi:requestApi}))
vi.mock('./money-out-api',async original=>({...await original<typeof import('./money-out-api')>(),moneyOutApi:moneyApi}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
const row={id:'request',paymentId:'payment',reference:'RR-123',kind:'Printing',state:'PendingReview',status:'Pending librarian review',version:1,requestedPrincipalCentavos:5000,requestedFeeCentavos:150,reasonCode:'REQUESTED_BY_CUSTOMER',reason:'Cancel my unstarted print request',payerName:'QA Student',schoolId:'QA-001',createdAt:'2026-11-15T01:00:00Z',operation:null}
const operation={id:'operation',type:'Refund',state:'Draft',principalCentavos:5000,feeCentavos:150,totalCentavos:5150,decision:'Cancel',destination:null,reference:'REF-123',events:[]}
function setup(){requestApi.list.mockResolvedValue({items:[row],pending:1,pagination:{total:1,page:1,limit:25}});requestApi.details.mockResolvedValue({request:row,payment:{state:'Succeeded',createdAt:row.createdAt,totalCentavos:5150,refundEligible:true},evidence:{assessed:'50',paid:'0',adjusted:'0',jobStatus:'Pending',history:[]}});moneyApi.options.mockResolvedValue({eligible:true,enabled:true,refundableCentavos:5000});moneyApi.refund.mockResolvedValue(operation);moneyApi.confirm.mockResolvedValue({...operation,state:'Processing'});moneyApi.check.mockResolvedValue({...operation,state:'Succeeded'})}
it('requires verification and final approval, then checks the same provider operation without another send',async()=>{
  setup();render(<AdminRefundRequests/>);fireEvent.click(await screen.findByRole('button',{name:'Review request'}))
  const review=await screen.findByRole('button',{name:'Review refund'});expect(review).toHaveProperty('disabled',true)
  fireEvent.change(screen.getByLabelText('Verification note'),{target:{value:'Payment and pending job history checked'}});fireEvent.click(screen.getByRole('checkbox',{name:/I checked/}));fireEvent.click(review)
  const approve=await screen.findByRole('button',{name:'Approve and send refund'});expect(approve).toHaveProperty('disabled',true);expect(moneyApi.confirm).not.toHaveBeenCalled()
  expect(moneyApi.refund.mock.calls[0][1]).toMatchObject({requestId:'request',requestVersion:1,verified:true})
  fireEvent.click(screen.getByRole('checkbox',{name:/I reviewed/}));fireEvent.click(approve);fireEvent.click(approve)
  fireEvent.click(await screen.findByRole('button',{name:'Check refund status'}));await screen.findByText(/provider confirmed the refund/)
  expect(moneyApi.confirm).toHaveBeenCalledOnce();expect(moneyApi.check).toHaveBeenCalledWith('operation');expect(screen.queryByRole('button',{name:'Approve and send refund'})).toBeNull()
})
it('rejection requires an explanation and sends no refund',async()=>{
  setup();requestApi.reject.mockResolvedValue({...row,state:'Rejected'});render(<AdminRefundRequests/>);fireEvent.click(await screen.findByRole('button',{name:'Review request'}));fireEvent.click(await screen.findByRole('button',{name:'Reject request'}))
  const reject=screen.getByRole('button',{name:'Confirm rejection'});expect(reject).toHaveProperty('disabled',true)
  fireEvent.change(screen.getByLabelText('Reason for rejection'),{target:{value:'Only one valid payment was captured'}});fireEvent.click(reject)
  await waitFor(()=>expect(requestApi.reject).toHaveBeenCalledWith('request',1,'Only one valid payment was captured'));expect(moneyApi.confirm).not.toHaveBeenCalled();expect(moneyApi.refund).not.toHaveBeenCalled()
})
