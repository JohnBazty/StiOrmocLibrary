import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PaymentWalletPage } from './PaymentWalletPage'

const api=vi.hoisted(()=>({read:vi.fn(),options:vi.fn(),demoCheckout:vi.fn()}))
const handoff=vi.hoisted(()=>vi.fn())
vi.mock('./payments-api',async original=>({...await original<typeof import('./payments-api')>(),paymentsApi:api}))
vi.mock('./payment-navigation',async original=>({...await original<typeof import('./payment-navigation')>(),openPaymentReviewResult:handoff}))
const id='00000000-0000-4000-8000-000000000001'
const quote={paymentId:id,kind:'Printing',targetId:24,state:'Quoted',channelCode:'GCASH',principalCentavos:200,feeCentavos:102,totalCentavos:302,expiresAt:'2099-11-13T00:00:00Z'}
const options={enabled:true,paymentAllowed:true,demoWalletEnabled:true,active:null,demoAccounts:[{number:'09174826315',pin:'4826'}]}
beforeEach(()=>{vi.clearAllMocks();api.read.mockResolvedValue(quote);api.options.mockResolvedValue(options)})
afterEach(cleanup)
function setup(payment=id){render(<MemoryRouter initialEntries={['/payments/wallet?payment='+payment]}><PaymentWalletPage/></MemoryRouter>)}
async function review(){
 const number=await screen.findByLabelText('Mobile number')
 fireEvent.change(number,{target:{value:'+639174826315'}});fireEvent.click(screen.getByRole('button',{name:'Next'}))
 fireEvent.change(screen.getByLabelText('PIN'),{target:{value:'4826'}});fireEvent.click(screen.getByRole('button',{name:'Review payment'}))
}
it('preserves number/PIN during focus and visibility changes without reading or quoting again',async()=>{
 setup();const number=await screen.findByLabelText('Mobile number')
 fireEvent.change(number,{target:{value:'9174826315'}});fireEvent.click(screen.getByRole('button',{name:'Next'}))
 const pin=screen.getByLabelText('PIN');fireEvent.change(pin,{target:{value:'48'}})
 fireEvent.focus(window);fireEvent(document,new Event('visibilitychange'))
 expect(screen.getByLabelText('PIN')).toBe(pin)
 expect((pin as HTMLInputElement).value).toBe('48')
 expect(api.read).toHaveBeenCalledTimes(1);expect(api.options).toHaveBeenCalledTimes(1)
 expect(api.demoCheckout).not.toHaveBeenCalled()
})
it('confirms once, keeps the original total and never reports success from a PIN alone',async()=>{
 let finish!: (value:unknown)=>void
 api.demoCheckout.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 setup();await review()
 expect(screen.getByRole('heading',{name:'Confirm payment'})).toBeTruthy()
 const pay=screen.getByRole('button',{name:'Pay ₱3.02'});fireEvent.click(pay);fireEvent.click(pay)
 expect(api.demoCheckout).toHaveBeenCalledTimes(1)
 expect(api.demoCheckout).toHaveBeenCalledWith(id,expect.any(String),'09174826315','4826')
 expect(screen.getByRole('button',{name:'Opening payment…'}).hasAttribute('disabled')).toBe(true)
 expect(handoff).not.toHaveBeenCalled();expect(screen.queryByText('Payment complete')).toBeNull()
 await act(async()=>finish({...quote,state:'Active',checkoutUrl:'https://dev.xen.to/payment'}))
 expect(handoff).toHaveBeenCalledTimes(1)
 expect(screen.getByRole('link',{name:'View payment'}).getAttribute('href')).toContain(id)
})
it('keeps request idempotency when a failed checkout is retried, clearing the entered PIN',async()=>{
 api.demoCheckout.mockRejectedValue(new Error('Connection interrupted. Please try again.'))
 setup();await review();fireEvent.click(screen.getByRole('button',{name:'Pay ₱3.02'}))
 await screen.findByRole('alert')
 const key=api.demoCheckout.mock.calls[0][1]
 expect((await screen.findByLabelText('PIN') as HTMLInputElement).value).toBe('')
 fireEvent.change(screen.getByLabelText('PIN'),{target:{value:'4826'}})
 fireEvent.click(screen.getByRole('button',{name:'Review payment'}));fireEvent.click(screen.getByRole('button',{name:'Pay ₱3.02'}))
 await waitFor(()=>expect(api.demoCheckout).toHaveBeenCalledTimes(2))
 expect(api.demoCheckout.mock.calls[1][1]).toBe(key)
})
it.each([
 ['expired',{...quote,expiresAt:'2000-01-01T00:00:00Z'},options],
 ['disabled',quote,{...options,demoWalletEnabled:false}],
 ['non-wallet',{...quote,channelCode:'QRPH'},options],
 ['already paid',{...quote,state:'Succeeded'},options],
 ['existing attempt',quote,{...options,active:{...quote,paymentId:'00000000-0000-4000-8000-000000000002',state:'Active'}}],
])('does not collect credentials for an %s payment',async(_label,payment,nextOptions)=>{
 api.read.mockResolvedValue(payment);api.options.mockResolvedValue(nextOptions)
 setup();await waitFor(()=>expect(screen.queryByText('Loading payment…')).toBeNull())
 expect(screen.queryByLabelText('Mobile number')).toBeNull()
 expect(api.demoCheckout).not.toHaveBeenCalled()
 expect(screen.getByRole('link',{name:'Return to bill'})).toBeTruthy()
})
it('rejects an invalid payment link before contacting the API and exposes no credential fields',async()=>{
 setup('bad-link');await screen.findByRole('alert')
 expect(api.read).not.toHaveBeenCalled();expect(api.options).not.toHaveBeenCalled()
 expect(screen.queryByLabelText('Mobile number')).toBeNull()
})
