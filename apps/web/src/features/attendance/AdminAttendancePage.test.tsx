import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AdminAttendancePage } from './AdminAttendancePage'

const api=vi.hoisted(()=>({terms:vi.fn(),summary:vi.fn(),logs:vi.fn(),analytics:vi.fn(),capacity:vi.fn(),updateCapacity:vi.fn(),downloadPdf:vi.fn()}))
vi.mock('./attendance-api',()=>({attendanceApi:api}))
vi.mock('./AttendanceScannerModal',()=>({AttendanceScannerModal:({open}:{open:boolean})=>open?<div>Scanner opened</div>:null}))

beforeEach(()=>{api.terms.mockResolvedValue([]);api.summary.mockResolvedValue({total_visits:5,unique_visitors:4,currently_inside:2,average_visit:null,peak_hour:'9:00 AM',purpose_breakdown:[],role_breakdown:[],range:{from:'2026-09-23',to:'2026-09-23',label:'2026-09-23'}});api.logs.mockResolvedValue({rows:[],pagination:{page:1,limit:25,total:0,total_pages:0}});api.analytics.mockResolvedValue({range:{from:'2026-09-23',to:'2026-09-23',label:'2026-09-23'},hourly:[{hour:9,visits:5}],heatmap:[],daily:[]});api.capacity.mockResolvedValue({current:2,capacity:80,available:78,percentage:3,overCapacity:false});api.updateCapacity.mockResolvedValue({current:2,capacity:100,available:98,percentage:2,overCapacity:false})})
afterEach(cleanup)

it('shows live capacity and saves an audited capacity change',async()=>{render(<AdminAttendancePage/>);expect(await screen.findByText('80')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:/Capacity/i}));fireEvent.change(screen.getByLabelText('Maximum occupants'),{target:{value:'100'}});fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Expanded study area'}});fireEvent.click(screen.getByRole('button',{name:'Save capacity'}));await waitFor(()=>expect(api.updateCapacity).toHaveBeenCalledWith(100,'Expanded study area'))})

it('opens the integrated camera scanner',async()=>{render(<AdminAttendancePage/>);await screen.findByText('Attendance logs');fireEvent.click(screen.getByRole('button',{name:'Scan QR'}));expect(screen.getByText('Scanner opened')).toBeTruthy()})
