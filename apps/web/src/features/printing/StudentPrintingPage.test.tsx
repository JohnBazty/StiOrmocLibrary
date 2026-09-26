import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StudentPrintingPage } from './StudentPrintingPage'

const api=vi.hoisted(()=>({serviceStatus:vi.fn(),pricing:vi.fn(),mine:vi.fn(),receipts:vi.fn(),quote:vi.fn(),submit:vi.fn(),cancel:vi.fn(),downloadReceipt:vi.fn()}))
vi.mock('./printing-api',()=>({printingApi:api}))

const receipt={print_receipt_id:8,request_id:4,receipt_number:'PR-20260923-000021',verification_code:'A1B2C3D4E5F60708',receipt_status:'Issued',student_name:'Student User',school_id:'0200000001',file_name:'capstone.pdf',page_count:6,number_of_copies:2,total_sheets:12,print_type:'Monochrome',paper_size:'A4',amount_received:36,payment_method:'Cash',received_by:'Library Admin',received_at:'2026-09-23T10:30:00+08:00'}

beforeEach(()=>{api.serviceStatus.mockResolvedValue({accepting_requests:1,unavailable_reason:null});api.pricing.mockResolvedValue([{pricing_rule_id:1,print_type:'Monochrome',paper_size:'A4',price_per_page:3}]);api.mine.mockResolvedValue([{request_id:4,file_name:'capstone.pdf',number_of_copies:2,print_type:'Monochrome',paper_size:'A4',page_count:6,total_sheets:12,calculated_cost:36,payment_status:'Paid',job_status:'Ready for Pickup',created_at:'2026-09-23T09:00:00+08:00',print_receipt_id:8,receipt_number:receipt.receipt_number,verification_code:receipt.verification_code,receipt_status:'Issued'}]);api.receipts.mockResolvedValue([receipt]);api.downloadReceipt.mockResolvedValue(undefined)})
afterEach(cleanup)

it('shows printing-only digital receipts inside the Printing Service page',async()=>{
  render(<StudentPrintingPage/>)
  expect(await screen.findByText('Digital receipts')).toBeTruthy()
  expect(screen.getByText('Printing payments only. Fine receipts are kept separately in Fines.')).toBeTruthy()
  expect(screen.getAllByText('PR-20260923-000021').length).toBeGreaterThan(0)
})

it('opens the digital printing receipt without using the fines page',async()=>{
  render(<StudentPrintingPage/>)
  await screen.findByText('Digital receipts')
  fireEvent.click(screen.getAllByRole('button',{name:/View receipt/i}).at(-1)!)
  expect(screen.getByRole('dialog',{name:'Printing digital receipt'})).toBeTruthy()
  expect(screen.getByText('This receipt belongs only to the Printing Service.')).toBeTruthy()
})

it('reads pages automatically and requotes when copies change', async () => {
  api.quote.mockImplementation(async(form:FormData)=>({page_count:12,total_sheets:12*Number(form.get('number_of_copies')),calculated_cost:36*Number(form.get('number_of_copies')),document_sha256:'abc',printable_file_name:'course.pdf'}))
  render(<StudentPrintingPage />)
  await screen.findByText('Digital receipts')
  const copies = screen.getByLabelText('Copies') as HTMLInputElement
  fireEvent.change(screen.getByLabelText('Print document'), { target: { files: [new File(['%PDF-test'],'course.pdf',{type:'application/pdf'})] } })
  await waitFor(()=>expect(screen.getByLabelText('Pages in document').textContent).toBe('12'))
  fireEvent.change(copies, { target: { value: '' } })
  expect(copies.value).toBe('')
  fireEvent.change(copies, { target: { value: '2' } })
  expect(copies.value).toBe('2')
  await waitFor(()=>expect(screen.getByText('₱72.00')).toBeTruthy())
})
