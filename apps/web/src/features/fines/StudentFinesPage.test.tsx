import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudentFinesPage } from './StudentFinesPage'
import { MemoryRouter } from 'react-router-dom'

const api=vi.hoisted(()=>({mine:vi.fn(),receipts:vi.fn(),downloadReceipt:vi.fn()}))
vi.mock('./fines-api',()=>({finesApi:api}))

const empty={range:{from:'2000-01-01',to:'2026-09-02',label:'Fine history',termId:null},summary:{assessed:0,outstanding:0,collected:0,waived:0,accountsWithBalance:0},items:[],pagination:{page:1,limit:100,total:0,totalPages:1}}

describe('StudentFinesPage',()=>{
  it('loads full history with the compatible custom range and does not show a period warning',async()=>{
    api.mine.mockResolvedValue(empty);api.receipts.mockResolvedValue([])
    render(<MemoryRouter><StudentFinesPage/></MemoryRouter>)
    await waitFor(()=>expect(api.mine).toHaveBeenCalledWith(expect.objectContaining({period:'custom',from:'2000-01-01'})))
    expect(screen.queryByText(/Select daily, weekly, monthly, semester, or custom/i)).toBeNull()
    expect(await screen.findByText('You have no fine records.')).toBeTruthy()
  })
  it('shows confirmed payment status and updated summary without another Pay action',async()=>{
    api.mine.mockResolvedValue({...empty,summary:{...empty.summary,assessed:190,collected:190,outstanding:0},items:[{id:'F-1',fineId:1,lostBookReportId:null,title:'Returned book',type:'Overdue',typeLabel:'Overdue',reason:'Final charge',occurredAt:'2026-11-12T00:00:00Z',assessed:190,paid:190,adjusted:0,balance:0,status:'Paid',paymentAllowed:false,localPaymentId:'00000000-0000-4000-8000-000000000001'}]})
    render(<MemoryRouter><StudentFinesPage/></MemoryRouter>)
    expect(await screen.findByText('Paid')).toBeTruthy()
    expect(screen.getByRole('link',{name:'View payment'}).getAttribute('href')).toBe('/payments/result?payment=00000000-0000-4000-8000-000000000001')
    expect(screen.queryByRole('button',{name:'Pay'})).toBeNull()
    expect(screen.getAllByText('₱190.00').length).toBeGreaterThan(1)
  })
  it('shows a violation fine by category and how many warnings are left in each category',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>({success:true,data:url.includes('service-charges')?[]:url.includes('/standing')?[{category:'Noise',warningsUsed:2,warningsBeforeFine:2,warningsLeft:0,fineAmount:50},{category:'Eating or food',warningsUsed:0,warningsBeforeFine:2,warningsLeft:2,fineAmount:50}]:{items:[],total:0}})})))
    api.mine.mockResolvedValue({...empty,items:[{id:'F-5',fineId:5,lostBookReportId:null,title:'Noise',type:'Infraction',typeLabel:'Violation · Noise',category:'Noise',incidentId:3,reason:'Loud talking',occurredAt:'2026-11-12T00:00:00Z',assessed:50,paid:0,adjusted:0,balance:50,status:'Unpaid',paymentAllowed:true}]})
    render(<MemoryRouter><StudentFinesPage/></MemoryRouter>)
    expect(await screen.findByText(/Violation · Noise · /)).toBeTruthy()
    expect(await screen.findByText('2 of 2 warnings left')).toBeTruthy()
    expect(screen.getByText('No warnings left. The next offense is a fine of PHP 50.00')).toBeTruthy()
    vi.unstubAllGlobals()
  })
})

afterEach(()=>{cleanup();vi.clearAllMocks()})
