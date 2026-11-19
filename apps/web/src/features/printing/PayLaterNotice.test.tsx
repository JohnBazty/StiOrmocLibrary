import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PayLaterNotice } from './PayLaterNotice'
import type { PrintRequest } from './printing-api'

const api=vi.hoisted(()=>({acknowledgeDeferred:vi.fn(async()=>({}))}))
vi.mock('./printing-api',()=>({printingApi:api}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('requires the borrower to acknowledge the unpaid balance before confirming',async()=>{
 const row={request_id:2,calculated_cost:100,balance:60,payment_status:'Partially Paid',job_status:'Pending',deferred_version:1,deferred_approved_at:'2026-11-17',deferred_reason:'Pay after class'} as PrintRequest
 const updated=vi.fn(async()=>{})
 render(<PayLaterNotice row={row} onUpdated={updated}/>)
 const button=screen.getByRole('button',{name:'Confirm pay-later agreement'}) as HTMLButtonElement
 expect(button.disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.click(button)
 await waitFor(()=>expect(api.acknowledgeDeferred).toHaveBeenCalledWith(row))
 expect(updated).toHaveBeenCalled()
})
