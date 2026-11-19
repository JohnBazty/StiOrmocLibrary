import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { AdminScheduledBorrowing } from './AdminScheduledBorrowing'
const api=vi.hoisted(()=>({queue:vi.fn()}))
vi.mock('./borrowing-schedule-api',()=>({borrowingScheduleApi:api,pickupDateLabel:(date:string)=>date}))
const item={scheduleId:1,title:'Future book',userName:'Sample Student',schoolId:'SAMPLE-1',userRole:'Student',pickupDate:'2026-11-21',requestedAt:'2026-11-19T02:00:00Z',preparationStartsAt:'2026-11-20T07:00:00+08:00',reason:'No copy is available yet.'}
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('keeps the confirmed list and current filters after a failed refresh',async()=>{
 api.queue.mockResolvedValue({available:true,items:[item],pagination:{page:1,limit:25,total:1,pages:1}})
 const view=render(<AdminScheduledBorrowing refreshKey={0}/>);await screen.findByText('Future book')
 fireEvent.change(screen.getByLabelText('Find scheduled borrower or book'),{target:{value:'Sample'}})
 fireEvent.change(screen.getByLabelText('Scheduled borrower role'),{target:{value:'Student'}})
 fireEvent.change(screen.getByLabelText('Pickup from'),{target:{value:'2026-11-21'}})
 await waitFor(()=>expect(api.queue).toHaveBeenLastCalledWith(expect.objectContaining({user:'Sample',role:'Student',dateFrom:'2026-11-21'}),1,expect.any(AbortSignal)))
 await waitFor(()=>expect(screen.queryByText('Refreshing scheduled pickups…')).toBeNull())
 api.queue.mockRejectedValue(new Error('Connection unavailable.'));view.rerender(<AdminScheduledBorrowing refreshKey={1}/>)
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Connection unavailable.')
 expect(screen.getByText('Future book')).toBeTruthy();expect((screen.getByLabelText('Find scheduled borrower or book') as HTMLInputElement).value).toBe('Sample')
 expect(screen.queryByRole('button',{name:'Mark ready'})).toBeNull()
})
it('paginates and shows a useful empty state on an empty page',async()=>{
 api.queue.mockResolvedValueOnce({available:true,items:[item],pagination:{page:1,limit:25,total:26,pages:2}}).mockResolvedValue({available:true,items:[],pagination:{page:2,limit:25,total:26,pages:2}})
 render(<AdminScheduledBorrowing refreshKey={0}/>);await screen.findByText('Future book')
 fireEvent.click(screen.getByRole('button',{name:'Next'}))
 await waitFor(()=>expect(api.queue).toHaveBeenLastCalledWith(expect.any(Object),2,expect.any(AbortSignal)))
 expect(await screen.findByText('No pending schedules match these filters.')).toBeTruthy()
})
it('renders scheduled pickups as a table, validates inverted date ranges, and links missing schedules',async()=>{
 api.queue.mockResolvedValue({available:true,items:[{...item,preparationStartsAt:null}],pagination:{page:1,limit:25,total:1,pages:1}})
 render(<AdminScheduledBorrowing refreshKey={0}/>);await screen.findByText('Future book')
 expect(screen.getByRole('table')).toBeTruthy()
 expect(screen.getByRole('link',{name:'Review library schedule'}).getAttribute('href')).toBe('/librarian/library-schedule')
 fireEvent.change(screen.getByLabelText('Pickup from'),{target:{value:'2026-11-28'}})
 fireEvent.change(screen.getByLabelText('Pickup through'),{target:{value:'2026-11-20'}})
 expect(screen.getByText(/Pickup from date must be on or before/i)).toBeTruthy()
})
