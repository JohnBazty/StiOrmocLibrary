import { cleanup,render,screen } from '@testing-library/react'
import { afterEach,expect,it } from 'vitest'
import { RefundTimeline,DestinationForm,MoneyOutSummary } from './RefundReview'
import type { MoneyOutRecord } from './money-out-api'
afterEach(cleanup)
const row={id:'refund',type:'Refund',state:'Processing',appliedPrincipalCentavos:5000,rail:'Native',reason:'Verified payment correction',expiresAt:'2026-11-15T01:15:00Z',principalCentavos:5000,feeCentavos:101,totalCentavos:5101,decision:'Restore',destination:null,reference:'REF-123',createdAt:'2026-11-15T01:00:00Z',events:[]} as MoneyOutRecord
it('shows pending history without claiming the bill was already reopened',()=>{render(<RefundTimeline rows={[row]}/>);expect(screen.getByText(/original payment stays applied/)).toBeTruthy()})
it('summarizes principal and matching fee to the original source',()=>{render(<MoneyOutSummary row={row}/>);expect(screen.getByText('₱51.01')).toBeTruthy();expect(screen.getByText(/Returns to the original payment method/)).toBeTruthy()})
it('legacy recipient verification requires review',()=>{render(<DestinationForm onSaved={()=>{}} onCancel={()=>{}}/>);expect(screen.getByRole('button',{name:'Review destination'})).toHaveProperty('disabled',true)})
