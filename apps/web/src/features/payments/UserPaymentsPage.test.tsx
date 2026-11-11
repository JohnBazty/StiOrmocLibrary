import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {UserPaymentsPage} from './UserPaymentsPage'
const api=vi.hoisted(()=>({mine:vi.fn(),options:vi.fn()}))
const fines=vi.hoisted(()=>({mine:vi.fn(),receipts:vi.fn(),downloadReceipt:vi.fn()}))
const printing=vi.hoisted(()=>({mine:vi.fn(),receipts:vi.fn(),downloadReceipt:vi.fn()}))
vi.mock('./payments-api',async(original)=>({...await original<typeof import('./payments-api')>(),paymentsApi:api}))
vi.mock('../fines/fines-api',()=>({finesApi:fines}))
vi.mock('../printing/printing-api',()=>({printingApi:printing}))
beforeEach(()=>{
  fines.mine.mockResolvedValue({summary:{outstanding:100},items:[{id:'F-1',fineId:1,balance:100,title:'Noise fine',reason:'Assessed library fine',paymentAllowed:true}],pagination:{page:1,totalPages:1,total:1}})
  printing.mine.mockResolvedValue([{request_id:1,file_name:'Course notes.pdf',calculated_cost:50,payment_status:'Unpaid',job_status:'Pending'},{request_id:2,file_name:'Cancelled.pdf',calculated_cost:20,payment_status:'Unpaid',job_status:'Cancelled'}])
  api.mine.mockResolvedValue({enabled:true,items:[],pagination:{page:1,total:0,limit:25}})
  api.options.mockResolvedValue({enabled:false,methods:[],active:null})
  fines.receipts.mockResolvedValue([{receiptId:5,receiptNumber:'CASH-TEST',amountReceived:40,paymentMethod:'Cash',receivedAt:'2026-11-11T10:00:00Z',status:'Issued'}])
  printing.receipts.mockResolvedValue([])
})
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('shows unpaid printing and fines, excludes canceled bills and refreshes real source readers',async()=>{
  render(<MemoryRouter><UserPaymentsPage/></MemoryRouter>)
  expect(await screen.findByText('Course notes.pdf')).toBeTruthy();expect(screen.getByText('Noise fine')).toBeTruthy()
  expect(screen.queryByText('Cancelled.pdf')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Refresh payments'}))
  await waitFor(()=>expect(printing.mine).toHaveBeenCalledTimes(2))
  expect(fines.mine).toHaveBeenCalledWith(expect.objectContaining({status:'outstanding'}))
})
it('shows cash history and a clear empty pending state',async()=>{
  render(<MemoryRouter><UserPaymentsPage/></MemoryRouter>)
  fireEvent.click(screen.getByRole('button',{name:'Pending'}))
  expect(await screen.findByText('No pending online payments')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Payment history'}))
  expect(await screen.findByText('CASH-TEST')).toBeTruthy()
  expect(screen.getByRole('button',{name:'Download CASH-TEST'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Download CASH-TEST'}))
  await waitFor(()=>expect(fines.downloadReceipt).toHaveBeenCalledWith(5,'CASH-TEST'))
})
it('retains legacy counter records and hides gateway receipts from the counter list',async()=>{
  fines.receipts.mockResolvedValue([{receiptId:6,receiptNumber:'LEGACY-GCASH',amountReceived:40,paymentMethod:'GCASH',confirmationSource:'Legacy',receivedAt:'2026-11-11T10:00:00Z',status:'Issued'},{receiptId:7,receiptNumber:'ONLINE-RECEIPT',amountReceived:40,paymentMethod:'GCASH',confirmationSource:'Xendit',receivedAt:'2026-11-11T10:00:00Z',status:'Issued'}])
  render(<MemoryRouter><UserPaymentsPage/></MemoryRouter>)
  fireEvent.click(screen.getByRole('button',{name:'Payment history'}))
  expect(await screen.findByText('LEGACY-GCASH')).toBeTruthy()
  expect(screen.queryByText('ONLINE-RECEIPT')).toBeNull()
})
