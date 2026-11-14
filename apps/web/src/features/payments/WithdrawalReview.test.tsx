import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { WithdrawalReview } from './WithdrawalReview'
import type { FundsOverview } from './money-out-api'
const api=vi.hoisted(()=>({withdrawal:vi.fn(),confirm:vi.fn(),cancel:vi.fn()}))
vi.mock('./money-out-api',async original=>({...await original<typeof import('./money-out-api')>(),moneyOutApi:api}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
const row={id:'withdrawal-1',type:'Withdrawal',state:'Draft',reference:'WDR-123',principalCentavos:5000,feeCentavos:500,totalCentavos:5000,appliedPrincipalCentavos:0,rail:'Transfer',reason:'School collections withdrawal',createdAt:'2026-11-12T00:00:00Z',expiresAt:'2026-11-12T00:15:00Z',destination:{name:'SAMPLE SCHOOL',bank:'BNORPHMM',account:'•••• 8888'},events:[]}
const data={beneficiaries:[{id:'bank-1',type:'SchoolBank',label:'School bank',account:'•••• 8888'}],balance:{availableCentavos:10000},payoutFeeCentavos:500,operations:[]} as unknown as FundsOverview
it('uses the provider withdrawal endpoint, reviews fee and sends only the saved intent',async()=>{
  api.withdrawal.mockResolvedValue(row);api.confirm.mockResolvedValue({...row,state:'Processing',providerReference:'po-fixture'})
  render(<WithdrawalReview data={data} onClose={()=>{}} onSaved={()=>{}}/> )
  fireEvent.change(screen.getByLabelText('Amount in pesos'),{target:{value:'50'}})
  fireEvent.change(screen.getByLabelText('Purpose'),{target:{value:row.reason}})
  fireEvent.click(screen.getByRole('button',{name:'Review withdrawal'}))
  await screen.findByRole('button',{name:'Confirm withdrawal'})
  expect(api.confirm).not.toHaveBeenCalled();expect(screen.getByText('₱55.00')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Confirm withdrawal'}))
  await screen.findByText('Processing')
  expect(api.confirm).toHaveBeenCalledWith('withdrawal-1')
  expect(screen.queryByRole('button',{name:'Confirm withdrawal'})).toBeNull()
})
it('updates the open dialog from refreshed Xendit state without another payout submission',async()=>{
  api.withdrawal.mockResolvedValue(row);api.confirm.mockResolvedValue({...row,state:'Processing'})
  const props={onClose:()=>{},onSaved:()=>{}}
  const view=render(<WithdrawalReview data={data} {...props}/> )
  fireEvent.change(screen.getByLabelText('Amount in pesos'),{target:{value:'50'}})
  fireEvent.change(screen.getByLabelText('Purpose'),{target:{value:row.reason}})
  fireEvent.click(screen.getByRole('button',{name:'Review withdrawal'}))
  fireEvent.click(await screen.findByRole('button',{name:'Confirm withdrawal'}))
  await screen.findByText('Processing')
  view.rerender(<WithdrawalReview data={{...data,operations:[{...row,state:'Succeeded',providerState:'SUCCEEDED',providerReference:'po-confirmed'} as never]}} {...props}/> )
  await waitFor(()=>expect(screen.getByText('Completed')).toBeTruthy())
  expect(screen.getByText('po-confirmed')).toBeTruthy();expect(api.confirm).toHaveBeenCalledTimes(1)
})
