import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { AutomaticDeweyPanel } from './AutomaticDeweyPanel'
const api=vi.hoisted(()=>({automaticBooks:vi.fn(),automaticStart:vi.fn(),automaticStep:vi.fn()}))
vi.mock('./dewey-api',()=>({deweyApi:api}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('assigns selected titles directly without a review checkbox',async()=>{
  api.automaticBooks.mockResolvedValue({items:[{id:1,title:'First',copies:2,isbn:'9780132350884'}],total:1,page:1})
  api.automaticStart.mockResolvedValue({token:'scope',books:1,copies:2})
  api.automaticStep.mockResolvedValue({titleId:1,title:'First',outcome:'assigned',assignedCopies:2,nextToken:null})
  render(<AutomaticDeweyPanel onSaved={vi.fn()}/> )
  fireEvent.click(await screen.findByLabelText('Auto-select First'))
  fireEvent.click(screen.getByRole('button',{name:'Auto-assign Dewey to 1 book'}))
  await waitFor(()=>expect(api.automaticStart).toHaveBeenCalledWith({titleIds:[1]}))
  await screen.findByText(/2 copies assigned/)
  expect(screen.queryByLabelText(/I reviewed/)).toBeNull()
})
it('all-books selection ignores pagination and reports exceptions',async()=>{
  api.automaticBooks.mockResolvedValue({items:[{id:1,title:'First',copies:1,isbn:null}],total:102,page:1})
  api.automaticStart.mockResolvedValue({token:'scope',books:102,copies:110})
  api.automaticStep.mockResolvedValue({titleId:1,title:'First',outcome:'missing_isbn',assignedCopies:0,nextToken:null})
  render(<AutomaticDeweyPanel onSaved={vi.fn()}/> )
  fireEvent.click(await screen.findByRole('button',{name:'Select all books without Dewey (102)'}))
  fireEvent.click(screen.getByRole('button',{name:'Auto-assign Dewey to 102 books'}))
  await waitFor(()=>expect(api.automaticStart).toHaveBeenCalledWith({all:true}))
  await screen.findByText(/First: ISBN missing or invalid/)
})

it('paces successive automatic saves and reports progress for skipped ISBNs',async()=>{
 api.automaticBooks.mockResolvedValue({items:[{id:1,title:'First',copies:1,isbn:null}],total:2,libraryTotal:2,page:1})
 api.automaticStart.mockResolvedValue({token:'first',books:2,copies:2})
 const starts:number[]=[]
 api.automaticStep.mockImplementation(async(token:string)=>{starts.push(Date.now());return {titleId:token==='first'?1:2,title:token==='first'?'First':'Second',outcome:'missing_isbn',assignedCopies:0,nextToken:token==='first'?'second':null}})
 render(<AutomaticDeweyPanel onSaved={vi.fn()}/> )
 fireEvent.click(await screen.findByRole('button',{name:'Select all books without Dewey (2)'}))
 fireEvent.click(screen.getByRole('button',{name:'Auto-assign Dewey to 2 books'}))
 await screen.findByText(/Second: ISBN missing or invalid/)
 expect(starts[1]-starts[0]).toBeGreaterThanOrEqual(1050)
})
