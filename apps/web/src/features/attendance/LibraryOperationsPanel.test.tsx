import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LibraryOperationsPanel } from './LibraryOperationsPanel'
const api=vi.hoisted(()=>({state:vi.fn(),events:vi.fn(),saveEvent:vi.fn(),cancelEvent:vi.fn(),updatePolicy:vi.fn()}))
vi.mock('./attendance-api',()=>({attendanceApi:api}))
beforeEach(()=>{vi.clearAllMocks();api.state.mockResolvedValue({state:'Open',current:1,serviceVisits:2,available:4,capacity:5,cutoffAt:'2026-10-12T18:55:00+08:00',closesAt:'2026-10-12T19:00:00+08:00',allowWalkIns:true,allowBorrowing:true,allowPrinting:true,policy:{version:1,preclosingMinutes:5}});api.events.mockResolvedValue([]);api.saveEvent.mockResolvedValue({})})
afterEach(cleanup)
it('Staff sees operating state, seat/service counts and cutoff without management controls',async()=>{
 render(<LibraryOperationsPanel/>);await screen.findByText(/1 seats occupied · 2 printing visits/)
 expect(screen.getByText(/6:55 PM/)).toBeTruthy();expect(screen.queryByLabelText('Event title')).toBeNull();expect(screen.queryByRole('button',{name:'Attendance cutoff settings'})).toBeNull()
})
it('Librarian submits explicit event capacity, Manila dates and service decisions',async()=>{
 render(<LibraryOperationsPanel manage/>);await screen.findByLabelText('Event title')
 for(const [label,value] of [['Event title','Seminar'],['Affected space','Reading area'],['Remaining library seats','12'],['Starts at (Manila)','2026-10-12T09:00'],['Ends at (Manila)','2026-10-12T10:00']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
 fireEvent.click(screen.getByRole('button',{name:'Schedule event'}));fireEvent.click(await screen.findByRole('button',{name:'Yes, save'}));await waitFor(()=>expect(api.saveEvent).toHaveBeenCalled())
 expect(api.saveEvent.mock.calls[0][1]).toMatchObject({capacity:12,startsAt:'2026-10-12T09:00:00+08:00',allowWalkIns:false,allowBorrowing:true,allowPrinting:true})
})
it('asks to confirm a cancellation in a modal dialog before cancelling the event',async()=>{
 const event={event_id:7,title:'Seminar',event_kind:'Event',space_name:'Reading area',starts_at:'2026-10-12T09:00:00+08:00',ends_at:'2026-10-12T10:00:00+08:00',seat_capacity:12,allow_walk_ins:false,allow_borrowing:true,allow_printing:true,lifecycle_status:'Active',row_version:3}
 api.events.mockResolvedValue([event]);api.cancelEvent.mockResolvedValue({})
 render(<LibraryOperationsPanel manage/>)
 fireEvent.click(await screen.findByRole('button',{name:'Cancel event'}))
 const dialog=screen.getByRole('alertdialog',{name:'Cancel “Seminar”?'})
 expect(dialog.getAttribute('aria-modal')).toBe('true')
 fireEvent.click(screen.getByRole('button',{name:'Keep event'}))
 expect(screen.queryByRole('alertdialog')).toBeNull();expect(api.cancelEvent).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Cancel event'}))
 fireEvent.click(screen.getByRole('button',{name:'Yes, cancel event'}))
 await waitFor(()=>expect(api.cancelEvent).toHaveBeenCalledWith(7,3))
 await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull())
})
