import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StudentPrintingPage } from './StudentPrintingPage'

const api=vi.hoisted(()=>({serviceStatus:vi.fn(),pricing:vi.fn(),mine:vi.fn(),receipts:vi.fn(),quote:vi.fn(),submit:vi.fn(),cancel:vi.fn(),downloadReceipt:vi.fn()}))
vi.mock('./printing-api',()=>({printingApi:api}))
vi.mock('../../components/PdfFilePreview',()=>({default:()=> <div>PDF preview</div>}))

const receipt={print_receipt_id:8,request_id:4,receipt_number:'PR-20260923-000021',verification_code:'A1B2C3D4E5F60708',receipt_status:'Issued',document_label:'Payment Record',student_name:'Student User',school_id:'0200000001',file_name:'capstone.pdf',page_count:6,number_of_copies:2,total_sheets:12,print_type:'Monochrome',paper_size:'A4',amount_received:36,payment_method:'Cash',received_by:'Library Admin',received_at:'2026-09-23T10:30:00+08:00'}

beforeEach(()=>{vi.resetAllMocks();api.serviceStatus.mockResolvedValue({accepting_requests:1,unavailable_reason:null,docx_auto_count_available:true});api.pricing.mockResolvedValue([{pricing_rule_id:1,print_type:'Monochrome',paper_size:'A4',price_per_page:3}]);api.mine.mockResolvedValue([{request_id:4,file_name:'capstone.pdf',number_of_copies:2,print_type:'Monochrome',paper_size:'A4',page_count:6,total_sheets:12,calculated_cost:36,payment_status:'Paid',job_status:'Ready for Pickup',created_at:'2026-09-23T09:00:00+08:00',print_receipt_id:8,receipt_number:receipt.receipt_number,verification_code:receipt.verification_code,receipt_status:'Issued'}]);api.receipts.mockResolvedValue([receipt]);api.downloadReceipt.mockResolvedValue(undefined)})
afterEach(cleanup)

it('shows printing payment records inside the Printing Service page',async()=>{
  render(<StudentPrintingPage/>)
  expect(await screen.findByText('Payment records')).toBeTruthy()
  expect(screen.getByText('Your printing cash payments appear here after the library records them.')).toBeTruthy()
  expect(screen.getAllByText('PR-20260923-000021').length).toBeGreaterThan(0)
})

it('opens the printing payment record without using the fines page',async()=>{
  render(<StudentPrintingPage/>)
  await screen.findByText('Payment records')
  fireEvent.click(screen.getAllByRole('button',{name:/View payment/i}).at(-1)!)
  expect(screen.getByRole('dialog',{name:'Printing payment record'})).toBeTruthy()
  expect(screen.getByText('This confirms a printing cash payment. It is not a tax invoice.')).toBeTruthy()
})

it('reads pages automatically and requotes when copies change', async () => {
  api.quote.mockImplementation(async(form:FormData)=>({page_count:12,total_sheets:12*Number(form.get('number_of_copies')),calculated_cost:36*Number(form.get('number_of_copies')),document_sha256:'abc',printable_file_name:'course.pdf'}))
  render(<StudentPrintingPage />)
  await screen.findByText('Payment records')
  const copies = screen.getByLabelText('Copies') as HTMLInputElement
  fireEvent.change(screen.getByLabelText('Print document'), { target: { files: [new File(['%PDF-test'],'course.pdf',{type:'application/pdf'})] } })
  await waitFor(()=>expect(screen.getByLabelText('Pages in document').textContent).toBe('12'))
  fireEvent.change(copies, { target: { value: '' } })
  expect(copies.value).toBe('')
  expect(screen.getByLabelText('Pages in document').textContent).toBe('12')
  expect((screen.getByRole('button',{name:'Submit print request'}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(copies, { target: { value: '2' } })
  expect(copies.value).toBe('2')
  await waitFor(()=>expect(screen.getByText('₱72.00')).toBeTruthy())
})

const quoteResult={page_count:3,total_sheets:3,calculated_cost:9,document_sha256:'abc',printable_file_name:'course.pdf'}
function uploadDocument(extension='pdf'){
  fireEvent.change(screen.getByLabelText('Print document'),{target:{files:[new File(['test document'],`course.${extension}`,{type:extension==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})]}})
}

it('removes the selected document and ignores an analysis result arriving afterward', async () => {
  let finish!: (result: typeof quoteResult) => void
  api.quote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<StudentPrintingPage />); uploadDocument()
  await waitFor(() => expect(api.quote).toHaveBeenCalledOnce())
  expect(screen.getByText('course.pdf')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected file' }))
  finish(quoteResult)
  await waitFor(() => expect(screen.getByLabelText('Pages in document').textContent).toBe('—'))
  expect(screen.queryByText('course.pdf')).toBeNull()
  expect(screen.getByRole('button', { name: 'Submit print request' }).hasAttribute('disabled')).toBe(true)
  expect((screen.getByLabelText('Print document') as HTMLInputElement).value).toBe('')
  expect(api.submit).not.toHaveBeenCalled()
})

it.each(['pdf','docx'])('counts a %s even when printing is paused',async(extension)=>{
  api.serviceStatus.mockResolvedValue({accepting_requests:0,unavailable_reason:'Paused by the library.',docx_auto_count_available:true})
  api.quote.mockResolvedValue(quoteResult)
  render(<StudentPrintingPage/>);uploadDocument(extension)
  expect(screen.getByRole('img', { name: `${extension.toUpperCase()} file` })).toBeTruthy()
  expect(screen.queryByText('PDF preview')).toBeNull()
  expect(screen.queryByText(/Word preview:/)).toBeNull()
  await waitFor(()=>expect(screen.getByLabelText('Pages in document').textContent).toBe('3'))
  expect((screen.getByRole('button',{name:'Submit print request'}) as HTMLButtonElement).disabled).toBe(true)
})

it('keeps counting and availability working if payment history fails to load',async()=>{
  api.receipts.mockRejectedValue(new Error('Payment history is temporarily unavailable.'))
  api.quote.mockResolvedValue(quoteResult)
  render(<StudentPrintingPage/>);uploadDocument()
  await screen.findByText('Payment history is temporarily unavailable.')
  await waitFor(()=>expect(screen.getByLabelText('Pages in document').textContent).toBe('3'))
  expect(screen.getByText('Accepting requests')).toBeTruthy()
  expect((screen.getByRole('button',{name:'Submit print request'}) as HTMLButtonElement).disabled).toBe(false)
})

it('counts the file while Copies is empty without offering an invalid price or submission',async()=>{
  api.quote.mockResolvedValue(quoteResult)
  render(<StudentPrintingPage/>)
  fireEvent.change(screen.getByLabelText('Copies'),{target:{value:''}});uploadDocument()
  await waitFor(()=>expect(screen.getByLabelText('Pages in document').textContent).toBe('3'))
  expect(screen.queryByText('₱9.00')).toBeNull()
  expect((screen.getByRole('button',{name:'Submit print request'}) as HTMLButtonElement).disabled).toBe(true)
})

it.each(['Retry page count','Refresh'])('recovers a failed count with %s without reselecting the file',async(button)=>{
  api.quote.mockRejectedValueOnce(new Error('The database is temporarily unavailable.')).mockResolvedValue(quoteResult)
  render(<StudentPrintingPage/>);uploadDocument()
  await screen.findByText('The database is temporarily unavailable.')
  fireEvent.click(screen.getByRole('button',{name:button}))
  await waitFor(()=>expect(screen.getByLabelText('Pages in document').textContent).toBe('3'))
  expect(screen.queryByText('The database is temporarily unavailable.')).toBeNull()
})
