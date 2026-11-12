import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {AdminReservationQueuePage} from './AdminReservationQueuePage'
const api=vi.hoisted(()=>({queue:vi.fn(),adjustStatus:vi.fn()}))
vi.mock('./reservation-api',()=>({reservationApi:api}))
vi.mock('../auth/auth-storage',()=>({getCurrentIdentity:()=>({role:'Staff'})}))
const row={reservationId:81,userId:7,userName:'Sample Student',institutionalId:'SAMPLE-7',userRole:'Student',materialTitle:'Waiting title',materialType:'Book',status:'pending',queuePosition:2,reservedAt:'2026-10-16T01:00:00Z',pickupDeadline:null,assignedCopyId:null,barcode:null,accessionNumber:null,shelfLocation:null}
const ready={...row,reservationId:82,materialTitle:'Ready title',status:'ready_for_pickup',queuePosition:1,barcode:'SAMPLE-COPY',assignedCopyId:4,pickupDeadline:'2026-10-17T01:00:00Z'}
beforeEach(()=>{api.queue.mockResolvedValue({items:[row,ready],pagination:{pages:1,total:2}});api.adjustStatus.mockResolvedValue({})})
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
 await screen.findByText(/24-hour pickup timer has started/)
})
it('lets Staff change between waiting pickups and all history without creating a loan',async()=>{
 open();await screen.findByText('Waiting title')
 fireEvent.change(screen.getByLabelText('Request status'),{target:{value:'pending'}})
 await waitFor(()=>expect(api.queue).toHaveBeenLastCalledWith(expect.objectContaining({status:'pending'}),1))
 fireEvent.change(screen.getByLabelText('Request status'),{target:{value:''}})
 await waitFor(()=>expect(api.queue).toHaveBeenLastCalledWith(expect.objectContaining({status:''}),1))
 expect(api.adjustStatus).not.toHaveBeenCalled()
})
