import {afterEach,it,expect,vi} from 'vitest'
import {render,screen,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {WorkspaceTasks} from './WorkspaceTasks'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('opens the correct Staff task destinations and shows pickup deadlines',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:{role:'Staff',generatedAt:'2026-10-12T00:00:00Z',cards:[{label:'Books to prepare',value:2,path:'/staff/reservations'}],pickups:[{id:1,title:'Test pickup',borrower:'Test borrower',deadline:'2026-10-13 08:00'}],operations:{state:'Open',capacity:80,serviceVisits:0,allowBorrowing:true,allowPrinting:true,events:[]},enrollment:'Enrollment not verified'}})}))
  render(<MemoryRouter><WorkspaceTasks/></MemoryRouter>)
  expect((await screen.findByRole('link',{name:/Books to prepare/})).getAttribute('href')).toBe('/staff/reservations')
  expect(screen.getByText(/Claim by 2026-10-13 08:00/)).toBeTruthy()
  expect(screen.queryByText('Account approvals')).toBeNull()
})
it('does not invent task counts when the request fails',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Tasks unavailable')))
  render(<MemoryRouter><WorkspaceTasks/></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Tasks unavailable')
  expect(screen.queryByText('No unexpired ready pickups.')).toBeNull()
})
