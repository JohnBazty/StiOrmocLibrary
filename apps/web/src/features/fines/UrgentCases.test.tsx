import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,it,vi,expect} from 'vitest'
import {UrgentCases} from './UrgentCases'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('requires review before saving optional urgency thresholds',async()=>{
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({data:{settings:{version:1,amount:null,overdue_days:null,unpaid_days:null,email_enabled:false},items:[]}})}));vi.stubGlobal('fetch',fetch)
 render(<UrgentCases setup/>);await screen.findByText('Set urgent alert rules')
 fireEvent.change(screen.getByLabelText('Outstanding amount (PHP)'),{target:{value:'100'}})
 fireEvent.click(screen.getByRole('button',{name:'Review rules'}));expect(fetch.mock.calls.length).toBe(1)
 fireEvent.click(screen.getByRole('button',{name:'Save reviewed rules'}));await screen.findByText('Alert rules saved. Existing charges are unchanged.')
})
