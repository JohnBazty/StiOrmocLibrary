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
it('Librarian enters the seats an event uses; the remaining seats are worked out from the library capacity',async()=>{
 api.state.mockResolvedValue({state:'Open',current:1,serviceVisits:2,available:79,capacity:80,baseCapacity:80,cutoffAt:'2026-10-12T18:55:00+08:00',closesAt:'2026-10-12T19:00:00+08:00',allowWalkIns:true,allowBorrowing:true,allowPrinting:true,policy:{version:1,preclosingMinutes:5}})
 render(<LibraryOperationsPanel manage/>);await screen.findByLabelText('Event title')
 await screen.findByText(/seats occupied/)
 for(const [label,value] of [['Event title','Seminar'],['Affected space','Reading area'],['Seats this event uses','68'],['Starts at (Manila)','2026-10-12T09:00'],['Ends at (Manila)','2026-10-12T10:00']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
 expect(screen.getByText('12 of 80 library seats remain for regular visitors while it runs.')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Schedule event'}));fireEvent.click(await screen.findByRole('button',{name:'Yes, save'}));await waitFor(()=>expect(api.saveEvent).toHaveBeenCalled())
 expect(api.saveEvent.mock.calls[0][1]).toMatchObject({capacity:12,startsAt:'2026-10-12T09:00:00+08:00',allowWalkIns:false,allowBorrowing:true,allowPrinting:true})
})
