import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminPrintSuppliesPage } from './AdminPrintSuppliesPage'

const api=vi.hoisted(()=>({supplies:vi.fn(),revenueSummary:vi.fn(),revenueEntries:vi.fn(),expenseSummary:vi.fn(),restockHistory:vi.fn(),stockUsage:vi.fn(),restock:vi.fn(),createInk:vi.fn(),useInkBottle:vi.fn(),openPaperReam:vi.fn(),revenueReport:vi.fn(),stockExpenseReport:vi.fn()}))
vi.mock('./printing-api',()=>({printingApi:api}))

const supplyData={ink:[{ink_id:1,cartridge_type:'Dye ink',color_variation:'Black',available_bottles:2,low_stock_threshold_bottles:1,cost_per_bottle:100,is_low:0}],paper:[{paper_stock_id:1,paper_size_dimension:'A4',unopened_reams:2,remaining_reams:2,low_stock_threshold_reams:2,average_expense_cost:100,is_low:1}],summary:{low_ink_items:0,low_paper_items:1,monthly_expense:0}}
const revenue={period:'monthly',label:'2026-08',from:'2026-08-01',to:'2026-08-31',paid_requests:2,total_sheets:20,total_copies:4,total_revenue:100}
const expenses={period:'monthly',label:'2026-08',from:'2026-08-01',to:'2026-08-31',restock_entries:2,ink_expenses:20,paper_expenses:30,total_expenses:50}

function mockReads(){api.supplies.mockResolvedValue(supplyData);api.revenueSummary.mockResolvedValue(revenue);api.revenueEntries.mockResolvedValue([]);api.expenseSummary.mockResolvedValue(expenses);api.restockHistory.mockResolvedValue([]);api.stockUsage.mockResolvedValue([])}

describe('AdminPrintSuppliesPage',()=>{
  it('uses a simple paper restock form with required per-ream cost',async()=>{
    mockReads();api.restock.mockResolvedValue({})
    render(<AdminPrintSuppliesPage/>)
    fireEvent.click((await screen.findAllByRole('button',{name:'Restock'}))[1])
    expect(screen.getByLabelText('Reams to add')).toBeTruthy()
    expect(screen.getByLabelText('Cost per ream')).toBeTruthy()
    expect(screen.queryByLabelText('Movement')).toBeNull()
    expect(screen.queryByLabelText('Notes')).toBeNull()
    fireEvent.change(screen.getByLabelText('Reams to add'),{target:{value:'3'}})
    fireEvent.change(screen.getByLabelText('Cost per ream'),{target:{value:'125'}})
    fireEvent.click(screen.getByRole('button',{name:'Add paper stock'}))
    await waitFor(()=>expect(api.restock).toHaveBeenCalledWith('paper',1,{quantity:3,unit_cost:125}))
  })

  it('separates revenue and expenses without net result presentation',async()=>{
    mockReads()
    render(<AdminPrintSuppliesPage/>)
    expect(await screen.findByText('Printing revenue')).toBeTruthy()
    expect(screen.getAllByText('₱100.00').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Net gain|Net loss|Net impact/i)).toBeNull()
    expect(screen.getByRole('button',{name:/Export revenue/i})).toBeTruthy()
    expect(screen.getByRole('button',{name:/Export stock expenses/i})).toBeTruthy()
  })

  it('confirms one whole bottle usage through the dedicated action',async()=>{
    mockReads();api.useInkBottle.mockResolvedValue({})
    render(<AdminPrintSuppliesPage/>)
    fireEvent.click(await screen.findByRole('button',{name:'Use one bottle'}))
    fireEvent.click(screen.getByRole('button',{name:'Confirm usage'}))
    await waitFor(()=>expect(api.useInkBottle).toHaveBeenCalledWith(1))
  })
})

afterEach(()=>{cleanup();vi.clearAllMocks()})
