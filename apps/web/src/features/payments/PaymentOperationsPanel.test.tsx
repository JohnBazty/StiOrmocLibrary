import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {PaymentOperationsPanel,SettlementReview} from './PaymentOperationsPanel'
import type {Payment} from './payments-api'
const api=vi.hoisted(()=>({operations:vi.fn(),recover:vi.fn(),readSettlement:vi.fn(),recordSettlement:vi.fn()}))
vi.mock('./payments-api',async(original)=>({...await original<typeof import('./payments-api')>(),paymentsApi:api}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('explains a paused checkout while retaining recovery and pending confirmations',async()=>{
  api.operations.mockResolvedValue({checkoutEnabled:false,needs_review:1,due_checks:2,review_events:0,pending_events:1,runnerStatus:null,events:[]})
  api.recover.mockResolvedValue({processed:1})
  render(<PaymentOperationsPanel/>)
  expect(await screen.findByText(/Existing payments still process/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Run recovery check'}))
  await waitFor(()=>expect(api.recover).toHaveBeenCalledTimes(1))
  expect(await screen.findByRole('status')).toBeTruthy()
})
it('settlement uses explicit Philippine time and shows net before saving evidence',async()=>{
  api.readSettlement.mockResolvedValueOnce(null).mockResolvedValueOnce({provider_reference:'TEST-BATCH-001',processing_cost_centavos:'140',net_centavos:'4000',settled_at:'2026-11-11T08:00:00Z'})
  api.recordSettlement.mockResolvedValue({recorded:true})
  render(<SettlementReview payment={{paymentId:'fixture',totalCentavos:4140} as Payment} onClose={()=>{}}/>)
  fireEvent.change(await screen.findByLabelText('Provider settlement reference'),{target:{value:'TEST-BATCH-001'}})
  fireEvent.change(screen.getByLabelText('Provider processing cost (PHP)'),{target:{value:'1.40'}})
  fireEvent.change(screen.getByLabelText('Settlement date and time (Asia/Manila)'),{target:{value:'2026-11-11T16:00'}})
  expect(screen.getByText('₱40.00')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Confirm settlement evidence'}))
  await waitFor(()=>expect(api.recordSettlement).toHaveBeenCalledWith('fixture',{reference:'TEST-BATCH-001',processingCost:'1.40',settledAt:'2026-11-11T16:00:00+08:00'}))
  expect(await screen.findByText('Library-recorded reference')).toBeTruthy()
})
