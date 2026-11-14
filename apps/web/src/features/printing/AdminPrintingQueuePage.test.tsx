import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminPrintingQueuePage } from './AdminPrintingQueuePage'

const api = vi.hoisted(() => ({ summary: vi.fn(), queue: vi.fn(), setServiceStatus: vi.fn() }))
vi.mock('./printing-api', () => ({ printingApi: api }))
vi.mock('../payments/money-out-api',()=>({moneyOutApi:{recover:vi.fn(async()=>({}))}}))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('does not report paused/zero/empty data after a failed request and recovers with Refresh', async () => {
  api.summary.mockRejectedValueOnce(new Error('The printing service request failed.')).mockResolvedValue({
    pending_jobs: 2, printing_jobs: 0, ready_jobs: 0, unpaid_jobs: 0, revenue_today: 10,
    service_status: { accepting_requests: 1, unavailable_reason: null },
  })
  api.queue.mockResolvedValue({ rows: [] })
  render(<AdminPrintingQueuePage />)
  await screen.findByRole('alert')
  expect(screen.getByText('Printing service status unavailable.')).toBeTruthy()
  expect(screen.queryByText('Print requests are paused')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Resume requests' })).toBeNull()
  expect(screen.queryByText('₱0.00')).toBeNull()
  expect(screen.queryByText('No print requests match these filters.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('Accepting print requests')
  expect(screen.getByRole('button', { name: 'Pause requests' })).toBeTruthy()
  expect(screen.getByText('₱10.00')).toBeTruthy()
  expect(screen.getByText('No print requests match these filters.')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(api.setServiceStatus).not.toHaveBeenCalled()
})
it.each(['Refund pending','Refunded'])('hides cash and printing actions for %s jobs',async(payment_status)=>{
  api.summary.mockResolvedValue({pending_jobs:0,printing_jobs:0,ready_jobs:0,unpaid_jobs:0,revenue_today:0,service_status:{accepting_requests:1}})
  api.queue.mockResolvedValue({rows:[{request_id:1,file_name:'qa.pdf',full_name:'QA Borrower',calculated_cost:5,payment_status,
    job_status:payment_status==='Refunded'?'Cancelled':'Pending',refund_pending:payment_status==='Refund pending',created_at:'2026-11-12T01:00:00Z',page_count:1,number_of_copies:1,total_sheets:1}]})
  render(<AdminPrintingQueuePage/>);await screen.findAllByText('qa.pdf')
  expect(screen.queryByRole('button',{name:'Mark cash paid'})).toBeNull()
  expect(screen.queryByRole('button',{name:'Start printing'})).toBeNull()
  expect(screen.queryByRole('button',{name:/^Cancel$/})).toBeNull()
})
