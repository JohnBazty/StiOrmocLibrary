import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LibraryOperationsPanel, LibraryEventScheduler } from './LibraryOperationsPanel'
const api=vi.hoisted(()=>({state:vi.fn(),events:vi.fn(),saveEvent:vi.fn(),cancelEvent:vi.fn(),updatePolicy:vi.fn()}))
vi.mock('./attendance-api',()=>({attendanceApi:api}))
beforeEach(()=>{vi.clearAllMocks();api.state.mockResolvedValue({state:'Open',current:1,serviceVisits:2,available:4,capacity:5,cutoffAt:'2026-10-12T18:55:00+08:00',closesAt:'2026-10-12T19:00:00+08:00',allowWalkIns:true,allowBorrowing:true,allowPrinting:true,policy:{version:1,preclosingMinutes:5}});api.events.mockResolvedValue([]);api.saveEvent.mockResolvedValue({})})
afterEach(cleanup)
it('Staff sees operating state, seat/service counts and cutoff without management controls',async()=>{
 render(<LibraryOperationsPanel/>);await screen.findByText(/1 seats occupied · 2 printing visits/)
 expect(screen.getByText(/6:55 PM/)).toBeTruthy();expect(screen.queryByLabelText('Event title')).toBeNull();expect(screen.queryByRole('button',{name:'Attendance cutoff settings'})).toBeNull()
})
it('Librarian submits explicit event capacity, Manila dates and service decisions',async()=>{
 render(<LibraryEventScheduler manage/>);fireEvent.click(screen.getByRole('button',{name:/Schedule class, meeting or seminar/}));await screen.findByLabelText('Event title')
 expect((screen.getByLabelText('Allow walk-ins') as HTMLInputElement).checked).toBe(false)
 for(const [label,value] of [['Event title','Seminar'],['Affected space','Reading area'],['Remaining library seats','12'],['Starts at (Manila)','2026-10-12T09:00'],['Ends at (Manila)','2026-10-12T10:00']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
 fireEvent.click(screen.getByRole('button',{name:'Schedule event'}));await waitFor(()=>expect(api.saveEvent).toHaveBeenCalled())
 expect(api.saveEvent.mock.calls[0][1]).toMatchObject({capacity:12,startsAt:'2026-10-12T09:00:00+08:00',allowWalkIns:false,allowBorrowing:true,allowPrinting:true})
})

it('loads a saved walk-in decision when editing and restores the unchecked default on cancel', async () => {
 api.events.mockResolvedValue([{event_id:7,title:'Example seminar',event_kind:'Seminar',space_name:'Reading area',starts_at:'2026-11-14T01:00:00Z',ends_at:'2026-11-14T02:00:00Z',seat_capacity:12,allow_walk_ins:true,allow_borrowing:false,allow_printing:true,lifecycle_status:'Active',row_version:3}])
 render(<LibraryEventScheduler manage/>)
 fireEvent.click(screen.getByRole('button',{name:/Schedule class, meeting or seminar/}))
 fireEvent.click(await screen.findByRole('button',{name:'Edit event'}))
 expect((screen.getByLabelText('Allow walk-ins') as HTMLInputElement).checked).toBe(true)
 expect((screen.getByLabelText('Allow borrowing') as HTMLInputElement).checked).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'Cancel edit'}))
 expect((screen.getByLabelText('Allow walk-ins') as HTMLInputElement).checked).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'Cancel event'}))
 fireEvent.click(screen.getByRole('button',{name:'Confirm cancellation'}))
 await waitFor(()=>expect(api.cancelEvent).toHaveBeenCalledWith(7,3))
})

it('retains cutoff saving and offers Staff read-only scheduled events', async () => {
 const view=render(<LibraryOperationsPanel manage/>)
 fireEvent.click(await screen.findByRole('button',{name:'Attendance cutoff settings'}))
 fireEvent.change(screen.getByLabelText('Minutes before closing'),{target:{value:'10'}})
 fireEvent.click(screen.getByRole('button',{name:'Save cutoff'}))
 await waitFor(()=>expect(api.updatePolicy).toHaveBeenCalledWith({servicePurposes:['Printing'],preclosingMinutes:10,version:1}))
 view.unmount()
 render(<LibraryOperationsPanel/>)
 fireEvent.click(await screen.findByRole('button',{name:/Scheduled events/}))
 expect(screen.getByText('No scheduled events.')).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Schedule event'})).toBeNull()
})
