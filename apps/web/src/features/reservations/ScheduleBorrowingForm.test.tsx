import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { ScheduleBorrowingForm } from './ScheduleBorrowingForm'
const api=vi.hoisted(()=>({dates:vi.fn(),create:vi.fn()}))
vi.mock('./borrowing-schedule-api',()=>({borrowingScheduleApi:api,pickupDateLabel:(date:string)=>date}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('reviews once before saving and keeps the selected date after a failed save',async()=>{
 api.dates.mockResolvedValue({available:true,dates:['2026-11-24']});api.create.mockRejectedValueOnce(new Error('Your two schedules are full.')).mockResolvedValue({scheduleId:1})
 render(<ScheduleBorrowingForm titleId={2} title="Sample book" role="Faculty" onClose={()=>{}}/>)
 fireEvent.change(await screen.findByLabelText('Preferred pickup date'),{target:{value:'2026-11-24'}})
 fireEvent.click(screen.getByRole('button',{name:'Review schedule'}))
 expect(api.create).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Yes, save'}))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Your two schedules are full.')
 expect((screen.getByLabelText('Preferred pickup date') as HTMLSelectElement).value).toBe('2026-11-24')
 fireEvent.click(screen.getByRole('button',{name:'Review schedule'}));fireEvent.click(screen.getByRole('button',{name:'Yes, save'}))
 await waitFor(()=>expect(screen.getByText(/Schedule saved/)).toBeTruthy())
 expect(screen.getByRole('link',{name:'View requests & reservations'}).getAttribute('href')).toBe('/faculty/reservations')
 expect(api.create.mock.calls[0][0].clientRequestId).toBe(api.create.mock.calls[1][0].clientRequestId)
})
it('offers no submission when the library has no open dates',async()=>{
 api.dates.mockResolvedValue({available:true,dates:[]})
 render(<ScheduleBorrowingForm titleId={2} title="Sample book" role="Student" onClose={()=>{}}/>)
 expect(await screen.findByText(/No open pickup dates/)).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Review schedule'})).toBeNull()
})
