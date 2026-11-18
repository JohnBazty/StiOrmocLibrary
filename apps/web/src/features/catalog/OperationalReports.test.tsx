import {afterEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {OperationalReports} from './OperationalReports'
const data={title:'Book loans',label:'All recorded dates',timezone:'Asia/Manila',generatedAt:'2026-10-12T00:00:00Z',columns:['title','status'],columnLabels:{title:'Book / research title',status:'Status'},rows:[{title:'Test book',status:'Borrowed'}],total:1,metrics:{},terms:[{id:1,academic_year:'2026–2027',term_name:'First semester',starts_on:'2026-08-01',ends_on:'2026-12-15'}],note:'Borrow date'}
const options=[{key:'circulation',title:'Book loans',snapshot:false,searchHint:'Borrower, Student / Faculty ID, title or loan reference',dateBasis:'Dates use the borrowing date.',statuses:['Borrowed','Returned'],columnLabels:data.columnLabels},
{key:'supplies',title:'Current print supplies',snapshot:true,searchHint:'Supply name or type',dateBasis:'Current stock only.',statuses:['In stock'],columnLabels:data.columnLabels}]
function reportFetch(value:unknown=data){return vi.fn(async(url:unknown)=>({ok:true,json:async()=>({success:true,data:String(url).endsWith('/options')?options:value})}))}
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('operational reports',()=>{
  it('applies a date range and search to the preview request',async()=>{
    const fetch=reportFetch();vi.stubGlobal('fetch',fetch)
    render(<MemoryRouter><OperationalReports/></MemoryRouter>);expect(await screen.findByText('Test book')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Reporting period'),{target:{value:'custom'}})
    fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-10-01'}});fireEvent.change(screen.getByLabelText('To date'),{target:{value:'2026-10-12'}})
    fireEvent.change(screen.getByLabelText('Search report'),{target:{value:'Test book'}});fireEvent.click(screen.getByRole('button',{name:'Apply filters'}))
    await waitFor(()=>expect(fetch.mock.calls.at(-1)?.[0]).toContain('from=2026-10-01'))
    expect(fetch.mock.calls.at(-1)?.[0]).toContain('q=Test+book')
  })
  it('does not present a failed request as an empty or zero report',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:unknown)=>String(url).endsWith('/options')?{ok:true,json:async()=>({success:true,data:options})}:{ok:false,json:async()=>({message:'Database unavailable'})}))
    render(<MemoryRouter><OperationalReports/></MemoryRouter>);expect(await screen.findByRole('alert')).toHaveProperty('textContent','Database unavailable')
    expect(screen.queryByText('No records match these filters.')).toBeNull();expect(screen.queryByRole('button',{name:'CSV'})).toBeNull()
  })
  it('shows a genuine empty result and current-snapshot limitation',async()=>{
    vi.stubGlobal('fetch',reportFetch({...data,title:'Current supplies',rows:[],columns:[],total:0}))
    render(<MemoryRouter initialEntries={['/?kind=supplies']}><OperationalReports/></MemoryRouter>)
    expect(await screen.findByText('No records match these filters.')).toBeTruthy()
    expect((screen.getByLabelText('Reporting period') as HTMLSelectElement).disabled).toBe(true)
  })
  it('uses report-specific hints, requires applying draft changes, and can refresh unchanged filters',async()=>{
    const fetch=reportFetch();vi.stubGlobal('fetch',fetch)
    render(<MemoryRouter><OperationalReports/></MemoryRouter>)
    await screen.findByText('Test book')
    await screen.findByPlaceholderText('Borrower, Student / Faculty ID, title or loan reference')
    fireEvent.click(screen.getByRole('button',{name:'Apply filters'}))
    await waitFor(()=>expect(fetch.mock.calls.filter(c=>String(c[0]).includes('/reports?')).length).toBe(2))
    await screen.findByText('Test book')
    fireEvent.change(screen.getByLabelText('Search report'),{target:{value:'0000123'}})
    expect((screen.getByRole('button',{name:'CSV'}) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Filters changed/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Report type'),{target:{value:'supplies'}})
    expect(screen.getByPlaceholderText('Supply name or type')).toBeTruthy()
  })
  it('exports all matching pages using applied criteria and server column labels',async()=>{
    const create=vi.fn(()=> 'blob:qa'),revoke=vi.fn()
    const baseURL=URL
    vi.stubGlobal('URL',class extends baseURL{static createObjectURL=create;static revokeObjectURL=revoke})
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
    const fetch=vi.fn(async(url:unknown)=>String(url).includes('/export?')?{ok:true,headers:new Headers({'content-type':'text/csv'}),blob:async()=>new Blob(['qa'])}:{ok:true,json:async()=>({success:true,data:String(url).endsWith('/options')?options:{...data,total:45,columnLabels:{title:'Resource title',status:'Status'}}})})
    vi.stubGlobal('fetch',fetch)
    render(<MemoryRouter initialEntries={['/?q=0000123&status=Borrowed&page=2']}><OperationalReports/></MemoryRouter>)
    expect(await screen.findByRole('columnheader',{name:'Resource title'})).toBeTruthy()
    expect(screen.getByText('Downloads include all 45 matching records, across every preview page.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'CSV'}))
    await waitFor(()=>expect(fetch.mock.calls.some(c=>String(c[0]).includes('/export?'))).toBe(true))
    const url=String(fetch.mock.calls.find(c=>String(c[0]).includes('/export?'))![0])
    expect(url).toContain('q=0000123');expect(url).toContain('status=Borrowed');expect(url).toContain('page=2')
    click.mockRestore()
  })
})
