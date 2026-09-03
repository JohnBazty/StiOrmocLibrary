import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudentFinesPage } from './StudentFinesPage'

const api=vi.hoisted(()=>({mine:vi.fn(),receipts:vi.fn(),downloadReceipt:vi.fn()}))
vi.mock('./fines-api',()=>({finesApi:api}))

const empty={range:{from:'2000-01-01',to:'2026-09-02',label:'Fine history',termId:null},summary:{assessed:0,outstanding:0,collected:0,waived:0,accountsWithBalance:0},items:[],pagination:{page:1,limit:100,total:0,totalPages:1}}

describe('StudentFinesPage',()=>{
  it('loads full history with the compatible custom range and does not show a period warning',async()=>{
    api.mine.mockResolvedValue(empty);api.receipts.mockResolvedValue([])
    render(<StudentFinesPage/>)
    await waitFor(()=>expect(api.mine).toHaveBeenCalledWith(expect.objectContaining({period:'custom',from:'2000-01-01'})))
    expect(screen.queryByText(/Select daily, weekly, monthly, semester, or custom/i)).toBeNull()
    expect(await screen.findByText('You have no fine records.')).toBeTruthy()
  })
})

afterEach(()=>{cleanup();vi.clearAllMocks()})
