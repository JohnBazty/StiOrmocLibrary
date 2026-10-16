import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PrintingInvoice } from './PrintingInvoice'
import type { PrintRequest } from './printing-api'
const api = vi.hoisted(() => ({ downloadInvoice:vi.fn() }))
vi.mock('./printing-api', () => ({ printingApi:api }))
const sample = {request_id:3,file_name:'sample.pdf',page_count:2,number_of_copies:3,total_sheets:6,calculated_cost:18,payment_status:'Unpaid',job_status:'Pending',print_type:'Monochrome',paper_size:'A4'} as PrintRequest
afterEach(() => {cleanup();vi.resetAllMocks()})
it('shows an unpaid bill and a stable invoice number before payment', () => {
  render(<PrintingInvoice request={sample}/>)
  fireEvent.click(screen.getByText(/Invoice · PRINT-INV-00000003/))
  expect(screen.getByText('This is your bill before payment. Pay at the library counter.')).toBeTruthy()
  expect(screen.getAllByText('₱18.00')).toHaveLength(2)
})
it('shows zero due after payment and keeps payment confirmation separate', () => {
  render(<PrintingInvoice request={{...sample,payment_status:'Paid'}}/>)
  fireEvent.click(screen.getByText(/Invoice · PRINT-INV-00000003/))
  expect(screen.getByText('₱0.00')).toBeTruthy()
  expect(screen.getByText(/payment confirmation is available separately/)).toBeTruthy()
})
it('shows download failure without losing the invoice', async () => {
  api.downloadInvoice.mockRejectedValue(new Error('Try again later'))
  render(<PrintingInvoice request={sample} admin/>)
  fireEvent.click(screen.getByText(/Invoice · PRINT-INV-00000003/))
  fireEvent.click(screen.getByRole('button',{name:'Download invoice PDF'}))
  expect((await screen.findByRole('alert')).textContent).toBe('Try again later')
  expect(api.downloadInvoice).toHaveBeenCalledWith(sample,true)
})
