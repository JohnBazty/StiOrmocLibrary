import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { RefundRequestDialog,RefundRequestHistory } from './RefundRequestDialog'
import type { Payment } from './payments-api'
const api=vi.hoisted(()=>({options:vi.fn(),create:vi.fn(),withdraw:vi.fn()}))
vi.mock('./refund-requests-api',async original=>({...await original<typeof import('./refund-requests-api')>(),refundRequestsApi:api}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
const payment={paymentId:'00000000-0000-4000-8000-000000000001',kind:'Printing',state:'Succeeded',description:'Printing payment'} as Payment
const options={refundRequestAllowed:true,refundRequestReason:null,refundableCentavos:5000,principalCentavos:5000,feeCentavos:150,quote:{principalCentavos:5000,feeCentavos:150,totalCentavos:5150}}
it('requires a reason, reviews server amounts and submits one pending request',async()=>{
  api.options.mockResolvedValue(options);api.create.mockResolvedValue({reference:'RR-123',state:'PendingReview'})
  const saved=vi.fn();render(<RefundRequestDialog payment={payment} onSaved={saved} onClose={()=>{}}/> )
  const review=await screen.findByRole('button',{name:'Review request'});expect(review).toHaveProperty('disabled',true)
  fireEvent.change(screen.getByLabelText('Refund reason'),{target:{value:'REQUESTED_BY_CUSTOMER'}})
  fireEvent.change(screen.getByLabelText('Explain your request'),{target:{value:'Cancel this unstarted printing request'}})
  fireEvent.click(review);await screen.findByText('Review your request');expect(api.create).not.toHaveBeenCalled();expect(screen.getByText('₱51.50')).toBeTruthy()
  const submit=screen.getByRole('button',{name:'Submit refund request'});fireEvent.click(submit);fireEvent.click(submit)
  await screen.findByText('Pending librarian review');expect(api.create).toHaveBeenCalledOnce();expect(saved).toHaveBeenCalledOnce()
  expect(api.create.mock.calls[0][1]).toMatchObject({amount:'50.00',expectedTotalCentavos:5150})
})
it('explains ineligibility without offering submission',async()=>{
  api.options.mockResolvedValue({...options,refundRequestAllowed:false,refundRequestReason:'Printing has already started.'})
  render(<RefundRequestDialog payment={payment} onSaved={()=>{}} onClose={()=>{}}/> )
  await screen.findByText('Printing has already started.');expect(screen.queryByRole('button',{name:'Review request'})).toBeNull()
})
it('failure preserves the reviewed amount for retry',async()=>{
  api.options.mockResolvedValue(options);api.create.mockRejectedValue(new Error('Connection unavailable.'))
  render(<RefundRequestDialog payment={payment} onSaved={()=>{}} onClose={()=>{}}/> )
  await screen.findByLabelText('Refund reason');fireEvent.change(screen.getByLabelText('Refund reason'),{target:{value:'DUPLICATE'}});fireEvent.change(screen.getByLabelText('Explain your request'),{target:{value:'I accidentally paid twice'}})
  fireEvent.click(screen.getByRole('button',{name:'Review request'}));fireEvent.click(await screen.findByRole('button',{name:'Submit refund request'}))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Connection unavailable.');expect(screen.getByText('₱51.50')).toBeTruthy()
})
it('withdrawal requires confirmation and uses the current version',async()=>{
  api.withdraw.mockResolvedValue({});const saved=vi.fn()
  render(<RefundRequestHistory rows={[{id:'request',reference:'RR-123',state:'PendingReview',status:'Pending librarian review',version:3,createdAt:'2026-11-15T01:00:00Z',requestedPrincipalCentavos:5000,requestedFeeCentavos:150} as never]} onSaved={saved}/> )
  fireEvent.click(screen.getByRole('button',{name:'Withdraw request'}));expect(api.withdraw).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Confirm withdrawal of request'}));await waitFor(()=>expect(api.withdraw).toHaveBeenCalledWith('request',3))
})
