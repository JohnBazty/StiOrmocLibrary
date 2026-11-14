import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AdminAttendancePage } from './AdminAttendancePage'

const api=vi.hoisted(()=>({terms:vi.fn(),summary:vi.fn(),logs:vi.fn(),analytics:vi.fn(),capacity:vi.fn(),updateCapacity:vi.fn(),downloadPdf:vi.fn()}))
vi.mock('./attendance-api',()=>({attendanceApi:api}))
vi.mock('./LibraryOperationsPanel',()=>({LibraryOperationsPanel:({capacitySettings}:{capacitySettings?:import('react').ReactNode})=><section aria-label="Library operations">{capacitySettings}</section>,LibraryEventScheduler:()=>null}))
vi.mock('./AttendanceScannerModal',()=>({AttendanceScannerModal:({open}:{open:boolean})=>open?<div>Scanner opened</div>:null}))

beforeEach(()=>{api.terms.mockResolvedValue([]);api.summary.mockResolvedValue({total_visits:5,unique_visitors:4,currently_inside:2,average_visit:null,peak_hour:'9:00 AM',purpose_breakdown:[],role_breakdown:[],range:{from:'2026-09-23',to:'2026-09-23',label:'2026-09-23'}});api.logs.mockResolvedValue({rows:[],pagination:{page:1,limit:25,total:0,total_pages:0}});api.analytics.mockResolvedValue({range:{from:'2026-09-23',to:'2026-09-23',label:'2026-09-23'},hourly:[{hour:9,visits:5}],heatmap:[],daily:[]});api.capacity.mockResolvedValue({current:2,capacity:80,available:78,percentage:3,overCapacity:false});api.updateCapacity.mockResolvedValue({current:2,capacity:100,available:98,percentage:2,overCapacity:false})})
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks()})

it('shows live capacity and saves an audited capacity change',async()=>{render(<AdminAttendancePage/>);expect(await screen.findByText('80')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:/Capacity/i}));fireEvent.change(screen.getByLabelText('Maximum occupants'),{target:{value:'100'}});fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Expanded study area'}});fireEvent.click(screen.getByRole('button',{name:'Save capacity'}));await waitFor(()=>expect(api.updateCapacity).toHaveBeenCalledWith(100,'Expanded study area'))})

it('opens the integrated camera scanner',async()=>{render(<AdminAttendancePage/>);await screen.findByText('Attendance logs');fireEvent.click(screen.getByRole('button',{name:'Open scanner'}));expect(screen.getByText('Scanner opened')).toBeTruthy()})

it('keeps the ten-second capacity refresh and clears the timer on leaving', async () => {
  vi.useFakeTimers()
  const view = render(<AdminAttendancePage />)
  await act(async()=>{})
  const before = api.capacity.mock.calls.length
  await act(async()=>{await vi.advanceTimersByTimeAsync(9999)})
  expect(api.capacity).toHaveBeenCalledTimes(before)
  await act(async()=>{await vi.advanceTimersByTimeAsync(1)})
  expect(api.capacity).toHaveBeenCalledTimes(before+1)
  view.unmount()
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000)})
  expect(api.capacity).toHaveBeenCalledTimes(before+1)
})

it('keeps charts collapsed until Usage Insights is opened and retains export', async () => {
  render(<AdminAttendancePage />)
  await screen.findByText('80')
  expect(screen.queryByRole('heading',{name:'Arrivals by hour'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:/Usage Insights/}))
  expect(screen.getByText('Arrivals by hour')).toBeTruthy()
  expect(screen.getByText('Weekly utilization')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Export'}))
  await waitFor(()=>expect(api.downloadPdf).toHaveBeenCalled())
})
