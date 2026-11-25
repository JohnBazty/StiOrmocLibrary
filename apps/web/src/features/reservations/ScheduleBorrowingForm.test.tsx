import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { ScheduleBorrowingForm } from './ScheduleBorrowingForm'
const api=vi.hoisted(()=>({dates:vi.fn(),create:vi.fn(),mine:vi.fn()}))
vi.mock('./borrowing-schedule-api',()=>({borrowingScheduleApi:api,pickupDateLabel:(date:string)=>date}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('reviews once before saving and keeps the selected date after a failed save',async()=>{
 api.mine.mockResolvedValue([])
 api.dates.mockResolvedValue({available:true,dates:['2026-11-24','2026-12-18'],semesterEnd:'2026-12-19'});api.create.mockRejectedValueOnce(new Error('Your two schedules are full.')).mockResolvedValue({scheduleId:1})
 render(<ScheduleBorrowingForm titleId={2} title="Sample book" role="Faculty" onClose={()=>{}}/>)
 fireEvent.click(await screen.findByRole('button',{name:/Preferred pickup date: Choose a date/}))
 expect(screen.getByText(/through Dec 19, 2026/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Tue, Nov 24, 2026'}))
 fireEvent.click(screen.getByRole('button',{name:'Review schedule'}))
 expect(api.create).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Save schedule'}))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Your two schedules are full.')
 expect(screen.getByRole('button',{name:/Preferred pickup date: Tue, Nov 24, 2026/})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Review schedule'}));fireEvent.click(screen.getByRole('button',{name:'Save schedule'}))
 await waitFor(()=>expect(screen.getByText(/Schedule saved/)).toBeTruthy())
 expect(screen.getByRole('link',{name:'View requests & reservations'}).getAttribute('href')).toBe('/faculty/reservations')
 expect(api.create.mock.calls[0][0].clientRequestId).toBe(api.create.mock.calls[1][0].clientRequestId)
})
it('offers no submission when the library has no open dates',async()=>{
 api.mine.mockResolvedValue([])
 api.dates.mockResolvedValue({available:true,dates:[]})
 render(<ScheduleBorrowingForm titleId={2} title="Sample book" role="Student" onClose={()=>{}}/>)
 expect(await screen.findByText(/No open pickup dates/)).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Review schedule'})).toBeNull()
})
it('proactively blocks scheduling when the borrower already has 2 pending schedules',async()=>{
 api.dates.mockResolvedValue({available:true,dates:['2026-11-24']})
 api.mine.mockResolvedValue([
  {scheduleId:10,titleId:5,title:'Book A',pickupDate:'2026-11-24',status:'scheduled',reservationId:null,reason:null},
  {scheduleId:11,titleId:6,title:'Book B',pickupDate:'2026-11-25',status:'scheduled',reservationId:null,reason:null},
 ])
 render(<ScheduleBorrowingForm titleId={2} title="Sample book" role="Student" onClose={()=>{}}/>)
 expect(await screen.findByText(/Scheduled borrowing limit reached/i)).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Review schedule'})).toBeNull()
 expect(screen.getByRole('link',{name:/View requests & reservations/i}).getAttribute('href')).toBe('/student/reservations')
})
it('proactively blocks scheduling a book that already has a pending schedule',async()=>{
 api.dates.mockResolvedValue({available:true,dates:['2026-11-24']})
 api.mine.mockResolvedValue([
  {scheduleId:10,titleId:2,title:'Sample book',pickupDate:'2026-11-24',status:'scheduled',reservationId:null,reason:null},
 ])
 render(<ScheduleBorrowingForm titleId={2} title="Sample book" role="Student" onClose={()=>{}}/>)
 expect(await screen.findByText(/already have a pending schedule for this book/i)).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Review schedule'})).toBeNull()
})
