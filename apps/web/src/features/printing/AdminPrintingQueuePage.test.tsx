import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminPrintingQueuePage } from './AdminPrintingQueuePage'

const api = vi.hoisted(() => ({ summary: vi.fn(), queue: vi.fn(), setServiceStatus: vi.fn(), status: vi.fn() }))
vi.mock('./printing-api', () => ({ printingApi: api }))
vi.mock('../auth/auth-storage',()=>({getCurrentIdentity:()=>({role:'Librarian'}),getCsrfToken:()=>null}))
vi.mock('./DocumentRetentionPanel',()=>({DocumentRetentionPanel:()=> <section><h2>Retained documents</h2><button>Keep document</button></section>}))
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
  render(<AdminPrintingQueuePage/>);if(payment_status==='Refunded')fireEvent.click(screen.getByRole('button',{name:'History'}));await screen.findAllByText('qa.pdf')
  fireEvent.click(screen.getByLabelText('Actions for print request 1'))
  expect(screen.queryByRole('button',{name:'Mark cash paid'})).toBeNull()
  expect(screen.queryByRole('button',{name:'Start printing'})).toBeNull()
  expect(screen.queryByRole('button',{name:/^Cancel$/})).toBeNull()
})

it('starts a paid job from its dropdown and refreshes the available actions', async () => {
  api.summary.mockResolvedValue({pending_jobs:1,printing_jobs:0,ready_jobs:0,unpaid_jobs:0,revenue_today:5,service_status:{accepting_requests:1}})
  const row = {request_id:21,file_name:'chemistry.pdf',full_name:'QA Borrower',calculated_cost:40,payment_status:'Paid',job_status:'Pending',created_at:'2026-11-12T01:00:00Z',page_count:2,number_of_copies:10,total_sheets:20}
  api.queue.mockResolvedValueOnce({rows:[row]}).mockResolvedValue({rows:[{...row,job_status:'Printing'}]})
  api.status.mockResolvedValue({})
  render(<AdminPrintingQueuePage />)
  await screen.findAllByText('chemistry.pdf')
  fireEvent.click(screen.getByLabelText('Actions for print request 21'))
  expect(screen.queryByRole('button', {name:'Mark cash paid'})).toBeNull()
  fireEvent.click(screen.getByRole('button', {name:'Start printing'}))
  await screen.findByRole('button', {name:'Mark ready',hidden:true})
  expect(api.status).toHaveBeenCalledWith(21, 'Printing')
  expect(api.queue).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('button', {name:'Start printing',hidden:true})).toBeNull()
})

it('separates active jobs from history and keeps retention outside Refresh', async () => {
  api.summary.mockResolvedValue({pending_jobs:1,printing_jobs:0,ready_jobs:0,unpaid_jobs:0,revenue_today:0,service_status:{accepting_requests:1}})
  api.queue.mockResolvedValue({rows:[{request_id:31,file_name:'active.pdf',full_name:'Test borrower',job_status:'Pending',payment_status:'Paid',calculated_cost:1,created_at:'2026-11-19T01:00:00Z',page_count:1,number_of_copies:1},{request_id:32,file_name:'history.pdf',full_name:'Test borrower',job_status:'Completed',payment_status:'Paid',calculated_cost:1,created_at:'2026-11-19T01:00:00Z',page_count:1,number_of_copies:1}]})
  render(<AdminPrintingQueuePage />)
  await screen.findAllByText('active.pdf')
  expect(screen.queryByText('history.pdf')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'History'}))
  expect(screen.queryByText('active.pdf')).toBeNull()
  expect((await screen.findAllByText('history.pdf')).length).toBeGreaterThan(0)
  expect(screen.getByRole('button',{name:'Refresh'}).querySelector('button,details')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Document retention'}))
  expect(screen.getByRole('heading',{name:'Retained documents'})).toBeTruthy()
  expect(screen.getByRole('button',{name:'Keep document'}).closest('button')?.parentElement?.closest('button')).toBeNull()
  expect(screen.queryByRole('button',{name:'Refresh'})).toBeNull()
})

it('confirms before cancelling unpaid jobs, flags large total-sheet jobs, and saves an updated pause reason', async () => {
  api.summary.mockResolvedValue({
    pending_jobs: 1, printing_jobs: 0, ready_jobs: 0, unpaid_jobs: 1, revenue_today: 0,
    service_status: { accepting_requests: 0, manually_accepting_requests: 0, unavailable_reason: 'Maintenance' },
  })
  api.queue.mockResolvedValue({
    rows: [{
      request_id: 41, file_name: 'thesis.pdf', full_name: 'QA Borrower', calculated_cost: 120,
      payment_status: 'Unpaid', job_status: 'Pending', created_at: '2026-11-19T01:00:00Z',
      page_count: 30, number_of_copies: 2, total_sheets: 60,
    }],
  })
  api.status.mockResolvedValue({})
  api.setServiceStatus.mockResolvedValue({})
  render(<AdminPrintingQueuePage />)

  await screen.findAllByText('thesis.pdf')
  expect(screen.getByText('Large job · check paper stock')).toBeTruthy()

  fireEvent.change(screen.getByLabelText('Printing unavailable reason'), { target: { value: 'Refilling ink tanks' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save reason' }))
  await screen.findByText('Pause reason updated.')
  expect(api.setServiceStatus).toHaveBeenCalledWith(false, 'Refilling ink tanks')

  fireEvent.click(screen.getByLabelText('Actions for print request 41'))
  fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))
  expect(api.status).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Cancel print request?' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel print request' }))
  await screen.findByText('Print request #41 cancelled.')
  expect(api.status).toHaveBeenCalledWith(41, 'Cancelled', 'Cancelled by printing staff')
})
