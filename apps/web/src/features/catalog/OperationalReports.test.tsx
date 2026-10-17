import {afterEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {OperationalReports} from './OperationalReports'
const data={title:'Take-home borrowing',label:'All recorded dates',timezone:'Asia/Manila',generatedAt:'2026-10-12T00:00:00Z',columns:['title','status'],rows:[{title:'Test book',status:'Borrowed'}],total:1,metrics:{},terms:[{id:1,academic_year:'2026–2027',term_name:'First semester'}],note:'Borrow date'}
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('operational reports',()=>{
  it('applies a date range and search to the preview request',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data})});vi.stubGlobal('fetch',fetch)
    render(<MemoryRouter><OperationalReports/></MemoryRouter>);expect(await screen.findByText('Test book')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Reporting period'),{target:{value:'custom'}})
    fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-10-01'}});fireEvent.change(screen.getByLabelText('To date'),{target:{value:'2026-10-12'}})
    fireEvent.change(screen.getByLabelText('Search report'),{target:{value:'Test book'}});fireEvent.click(screen.getByRole('button',{name:'Apply filters'}))
    await waitFor(()=>expect(fetch.mock.calls.at(-1)?.[0]).toContain('from=2026-10-01'))
    expect(fetch.mock.calls.at(-1)?.[0]).toContain('q=Test+book')
  })
  it('does not present a failed request as an empty or zero report',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({message:'Database unavailable'})}))
    render(<MemoryRouter><OperationalReports/></MemoryRouter>);expect(await screen.findByRole('alert')).toHaveProperty('textContent','Database unavailable')
    expect(screen.queryByText('No records match these filters.')).toBeNull();expect(screen.queryByRole('button',{name:'CSV'})).toBeNull()
  })
  it('shows a genuine empty result and current-snapshot limitation',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:{...data,title:'Current supplies',rows:[],columns:[],total:0}})}))
    render(<MemoryRouter initialEntries={['/?kind=supplies']}><OperationalReports/></MemoryRouter>)
    expect(await screen.findByText('No records match these filters.')).toBeTruthy()
    expect((screen.getByLabelText('Reporting period') as HTMLSelectElement).disabled).toBe(true)
  })
})
