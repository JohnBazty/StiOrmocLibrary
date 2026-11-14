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
    api.mine.mockResolvedValue({...empty,summary:{...empty.summary,assessed:190,collected:190,outstanding:0},items:[{id:'F-1',fineId:1,lostBookReportId:null,title:'Returned book',type:'Overdue',reason:'Final charge',occurredAt:'2026-11-12T00:00:00Z',assessed:190,paid:190,adjusted:0,balance:0,status:'Paid',paymentAllowed:false,localPaymentId:'00000000-0000-4000-8000-000000000001'}]})
    render(<MemoryRouter><StudentFinesPage/></MemoryRouter>)
    expect(await screen.findByText('Paid')).toBeTruthy()
    expect(screen.getByRole('link',{name:'View payment'}).getAttribute('href')).toBe('/payments/result?payment=00000000-0000-4000-8000-000000000001')
    expect(screen.queryByRole('button',{name:'Pay'})).toBeNull()
    expect(screen.getAllByText('₱190.00').length).toBeGreaterThan(1)
  })
})

afterEach(()=>{cleanup();vi.clearAllMocks()})
