import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminPrintSuppliesPage } from './AdminPrintSuppliesPage'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

function setup() {
  vi.useFakeTimers()
  let paid = false, fail = false
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/revenue?')) {
      if (fail) return Response.json({ message: 'Unavailable' }, { status: 503 })
      const entries = paid ? [
        {request_id:'P-1',received_at:'2026-11-18T04:00:00Z',full_name:'Cash payer',file_name:'cash.pdf',payment_method:'Cash',amount_paid:20},
        {request_id:'P-2',received_at:'2026-11-18T05:00:00Z',full_name:'Online payer',file_name:'online.pdf',payment_method:'GCASH',amount_paid:30},
      ] : []
      return Response.json({data:{summary:{label:'Selected month',paid_requests:entries.length,total_sheets:5,total_copies:2,total_revenue:paid?50:0},entries}})
    }
    if (url.endsWith('/supplies')) return Response.json({data:{ink:[],paper:[],summary:{}}})
    if (url.includes('/expenses/summary')) return Response.json({data:{}})
    return Response.json({data:[]})
  })
  vi.stubGlobal('fetch', fetch)
  render(<AdminPrintSuppliesPage />)
  return { fetch, pay:()=>{paid=true}, fail:()=>{fail=true}, recover:()=>{fail=false} }
}

it('refreshes cash and online details and total together without manual refresh', async () => {
  const fixture = setup()
  await act(async () => {})
  expect(screen.getByText('No paid printing requests for this period.')).toBeTruthy()
  fixture.pay()
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.getByText('₱50.00')).toBeTruthy()
  expect(screen.getByText('cash.pdf')).toBeTruthy()
  expect(screen.getByText('online.pdf')).toBeTruthy()
  expect(screen.getByText('GCASH')).toBeTruthy()
  expect(screen.queryByText('Loading revenue…')).toBeNull()
  expect(fixture.fetch.mock.calls.filter(([url])=>String(url).includes('/revenue?'))).toHaveLength(2)
})

it('preserves confirmed rows on a refresh failure and recovers with Refresh', async () => {
  const fixture = setup()
  await act(async () => {})
  fixture.pay()
  await act(async () => { window.dispatchEvent(new Event('printing-updated')) })
  fixture.fail()
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(within(screen.getByRole('alert')).getByText(/Showing the last successful update/)).toBeTruthy()
  expect(screen.getByText('online.pdf')).toBeTruthy()
  expect(screen.getByText('₱50.00')).toBeTruthy()
  fixture.recover()
  await act(async () => { fireEvent.click(screen.getByRole('button',{name:'Refresh'})) })
  expect(screen.queryByRole('alert')).toBeNull()
})

it('does not claim no payments when the initial revenue read fails', async () => {
  const fixture = setup()
  fixture.fail()
  await act(async () => {})
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.getByText('Revenue could not be loaded. Use Refresh to try again.')).toBeTruthy()
  expect(screen.queryByText('No paid printing requests for this period.')).toBeNull()
})
