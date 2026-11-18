import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {AdminReservationQueuePage} from './AdminReservationQueuePage'
const api=vi.hoisted(()=>({queue:vi.fn(),adjustStatus:vi.fn()}))
const schedules=vi.hoisted(()=>({queue:vi.fn()}))
vi.mock('./reservation-api',()=>({reservationApi:api}))
vi.mock('./borrowing-schedule-api',()=>({borrowingScheduleApi:schedules,pickupDateLabel:(date:string)=>date}))
vi.mock('../auth/auth-storage',()=>({getCurrentIdentity:()=>({role:'Staff'})}))
const row={reservationId:81,userId:7,userName:'Sample Student',institutionalId:'SAMPLE-7',userRole:'Student',materialTitle:'Waiting title',materialType:'Book',status:'pending',queuePosition:2,reservedAt:'2026-10-16T01:00:00Z',pickupDeadline:null,assignedCopyId:null,barcode:null,accessionNumber:null,shelfLocation:null}
const ready={...row,reservationId:82,materialTitle:'Ready title',status:'ready_for_pickup',queuePosition:1,barcode:'SAMPLE-COPY',assignedCopyId:4,pickupDeadline:'2026-10-17T01:00:00Z'}
beforeEach(()=>{api.queue.mockResolvedValue({items:[row,ready],pagination:{pages:1,total:2}});api.adjustStatus.mockResolvedValue({});schedules.queue.mockResolvedValue({available:true,items:[{scheduleId:1,title:'Future book',userName:'Sample Student',schoolId:'SAMPLE-7',userRole:'Student',pickupDate:'2026-11-21',requestedAt:'2026-11-19T02:00:00Z',preparationStartsAt:'2026-11-20T00:00:00+08:00',reason:null}],pagination:{pages:1,total:1}})})
afterEach(()=>{cleanup();vi.resetAllMocks()})
const open=()=>render(<MemoryRouter><AdminReservationQueuePage/></MemoryRouter>)
it('shows all active requests to Staff by default and exposes their queue position and pickup action',async()=>{
 open();await screen.findByText('Waiting title')
 expect(api.queue).toHaveBeenCalledWith(expect.objectContaining({status:'active'}),1)
 expect(screen.getByRole('heading',{name:'Book queue'})).toBeTruthy()
 expect(screen.getByText('Queue position #2')).toBeTruthy()
 expect(screen.getByRole('link',{name:'Start checkout'}).getAttribute('href')).toBe('/staff/circulation?requestId=82')
 expect(api.adjustStatus).not.toHaveBeenCalled()
})
it('marks the assigned copy ready only on staff action and keeps a route to checkout',async()=>{
 api.queue.mockResolvedValue({items:[{...row,status:'approved',assignedCopyId:4,barcode:'SAMPLE-COPY'}],pagination:{pages:1,total:1}})
 open();fireEvent.click(await screen.findByRole('button',{name:'Mark ready'}))
 await waitFor(()=>expect(api.adjustStatus).toHaveBeenCalledWith(81,'ready_for_pickup'))
 await screen.findByText(/one-open-day pickup timer has started/)
})
it('lets Staff change between waiting pickups and all history without creating a loan',async()=>{
 open();await screen.findByText('Waiting title')
 fireEvent.change(screen.getByLabelText('Request status'),{target:{value:'pending'}})
 await waitFor(()=>expect(api.queue).toHaveBeenLastCalledWith(expect.objectContaining({status:'pending'}),1))
 fireEvent.change(screen.getByLabelText('Request status'),{target:{value:''}})
 await waitFor(()=>expect(api.queue).toHaveBeenLastCalledWith(expect.objectContaining({status:''}),1))
 expect(api.adjustStatus).not.toHaveBeenCalled()
})
it('shows upcoming schedules on a separate tab without offering early preparation or checkout',async()=>{
 open();await screen.findByText('Waiting title')
 fireEvent.click(screen.getByRole('tab',{name:'Scheduled'}))
 expect(await screen.findByText('Future book')).toBeTruthy()
 expect(screen.getByText('2026-11-21')).toBeTruthy()
 expect(screen.getByText(/SAMPLE-7/)).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Mark ready'})).toBeNull()
 expect(screen.queryByRole('link',{name:'Start checkout'})).toBeNull()
 fireEvent.change(screen.getByLabelText('Find scheduled borrower or book'),{target:{value:'Sample'}})
 await waitFor(()=>expect(schedules.queue).toHaveBeenLastCalledWith(expect.objectContaining({user:'Sample'}),1,expect.any(AbortSignal)))
 fireEvent.click(screen.getByRole('tab',{name:'Book requests'}));expect(await screen.findByText('Waiting title')).toBeTruthy()
 expect(api.adjustStatus).not.toHaveBeenCalled()
})
