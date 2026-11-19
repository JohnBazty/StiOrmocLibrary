import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { BorrowingSchedules } from './BorrowingSchedules'
const api=vi.hoisted(()=>({mine:vi.fn(),cancel:vi.fn()}))
vi.mock('./borrowing-schedule-api',()=>({borrowingScheduleApi:api,pickupDateLabel:(date:string)=>date}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('confirms cancellation once, refreshes, and keeps prepared requests out of the pending list',async()=>{
 const schedule={scheduleId:1,title:'Sample book',pickupDate:'2026-11-24',status:'scheduled'}
 api.mine.mockResolvedValueOnce([schedule,{...schedule,scheduleId:2,title:'Prepared book',status:'prepared'}]).mockResolvedValue([{...schedule,status:'cancelled'}])
 api.cancel.mockResolvedValue({...schedule,status:'cancelled'})
 render(<BorrowingSchedules/>)
 expect(await screen.findByText('Sample book')).toBeTruthy();expect(screen.queryByText('Prepared book')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Cancel schedule'}));expect(api.cancel).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Confirm cancellation'}))
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Cancel schedule'})).toBeNull())
 expect(api.cancel).toHaveBeenCalledTimes(1)
})
it('preserves the confirmed schedule list after refresh fails',async()=>{
 api.mine.mockResolvedValueOnce([{scheduleId:1,title:'Sample book',pickupDate:'2026-11-24',status:'scheduled'}]).mockRejectedValue(new Error('Connection unavailable.'))
 render(<BorrowingSchedules/>);await screen.findByText('Sample book')
 window.dispatchEvent(new Event('smartlib:circulation-updated'))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Connection unavailable.')
 expect(screen.getByText('Sample book')).toBeTruthy()
})
it('a stale background response cannot restore a cancelled schedule',async()=>{
 const schedule={scheduleId:1,title:'Sample book',pickupDate:'2026-11-24',status:'scheduled'}
 let finish!:(rows:unknown[])=>void
 api.mine.mockResolvedValueOnce([schedule]).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue([{...schedule,status:'cancelled'}])
 api.cancel.mockResolvedValue({...schedule,status:'cancelled'})
 render(<BorrowingSchedules/>);await screen.findByText('Sample book')
 act(()=>window.dispatchEvent(new Event('smartlib:circulation-updated')))
 fireEvent.click(screen.getByRole('button',{name:'Cancel schedule'}));fireEvent.click(screen.getByRole('button',{name:'Confirm cancellation'}))
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Cancel schedule'})).toBeNull())
 await act(async()=>finish([schedule]))
 expect(screen.queryByRole('button',{name:'Cancel schedule'})).toBeNull()
})
it('shows cancellation errors inside the open dialog and closes on Escape',async()=>{
 const schedule={scheduleId:1,title:'Sample book',pickupDate:'2026-11-24',status:'scheduled'}
 api.mine.mockResolvedValue([schedule])
 api.cancel.mockRejectedValueOnce(new Error('Schedule was already prepared.'))
 render(<BorrowingSchedules/>);await screen.findByText('Sample book')
 fireEvent.click(screen.getByRole('button',{name:'Cancel schedule'}))
 const dialog=screen.getByRole('alertdialog',{name:'Cancel this schedule?'})
 fireEvent.click(screen.getByRole('button',{name:'Confirm cancellation'}))
 expect((await screen.findByRole('alert')).textContent).toContain('Schedule was already prepared.')
 expect(dialog.contains(screen.getByRole('alert'))).toBe(true)
 fireEvent.keyDown(document,{key:'Escape'})
 expect(screen.queryByRole('alertdialog')).toBeNull()
})
