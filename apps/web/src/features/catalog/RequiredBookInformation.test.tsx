import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {RequiredBookInformation,requiredBookAdditions} from './RequiredBookInformation'
import {catalogApi} from './catalog-api'
vi.mock('./catalog-api',()=>({catalogApi:{lookupIsbn:vi.fn(),searchTitles:vi.fn()}}))
afterEach(cleanup);beforeEach(()=>vi.resetAllMocks())
const book={title:'Matched title',author:'Found author',isbn:'9780132350884',publisher:'Optional publisher',publicationYear:2008,source:'google_books' as const}
it('reviews exact ISBN additions, keeps existing values and excludes optional fields',async()=>{
 vi.mocked(catalogApi.lookupIsbn).mockResolvedValue(book)
 const apply=vi.fn();render(<RequiredBookInformation draft={{title:'Entered title',author:'',isbn:book.isbn}} onApply={apply} requireIsbn/>)
 fireEvent.click(screen.getByRole('button',{name:'Auto-fill missing required information'}))
 const button=await screen.findByRole('button',{name:'Apply required details to draft'})
 expect(apply).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('differs from your entry')
 fireEvent.click(button);expect(apply).toHaveBeenCalledWith({author:'Found author'})
})
it('multiple title/edition candidates always require an explicit choice and optional ISBN stays blank',async()=>{
 vi.mocked(catalogApi.searchTitles).mockResolvedValue({localMatches:[],source:'google_books',candidates:[{...book,inCatalog:false},{...book,title:'Another edition',isbn:'9780306406157',inCatalog:false}]})
 const apply=vi.fn();render(<RequiredBookInformation draft={{title:'Matched title',author:'',isbn:''}} onApply={apply}/>)
 fireEvent.click(screen.getByRole('button',{name:'Auto-fill missing required information'}))
 const radios=await screen.findAllByRole('radio');expect(screen.queryByRole('button',{name:'Apply required details to draft'})).toBeNull()
 fireEvent.click(radios[0]);fireEvent.click(screen.getByRole('button',{name:'Apply required details to draft'}));expect(apply).toHaveBeenCalledWith({author:'Found author'})
})
it('rejects mismatched ISBN and ignores stale answers after edits',async()=>{
 vi.mocked(catalogApi.lookupIsbn).mockResolvedValue({...book,isbn:'9780306406157'})
 const apply=vi.fn(),{rerender}=render(<RequiredBookInformation draft={{title:'',author:'',isbn:book.isbn}} onApply={apply}/>)
 fireEvent.click(screen.getByRole('button',{name:'Auto-fill missing required information'}));expect((await screen.findByRole('alert')).textContent).toContain('No exact ISBN match')
 let resolve!:(v:typeof book)=>void;vi.mocked(catalogApi.lookupIsbn).mockImplementation(()=>new Promise(r=>{resolve=r}))
 fireEvent.click(screen.getByRole('button',{name:'Auto-fill missing required information'}))
 rerender(<RequiredBookInformation draft={{title:'New entered value',author:'',isbn:'9780306406157'}} onApply={apply}/>)
 resolve(book);await waitFor(()=>expect((screen.getByRole('button',{name:'Auto-fill missing required information'}) as HTMLButtonElement).disabled).toBe(false))
 expect(screen.queryByRole('button',{name:'Apply required details to draft'})).toBeNull();expect(apply).not.toHaveBeenCalled()
})
it('strips markup and never overwrites local facts or optional data',()=>{
 expect(requiredBookAdditions({title:'',author:'Mine',isbn:''},{...book,title:'<b>Safe</b> title'},true)).toEqual({title:'Safe title',isbn:book.isbn})
 expect(requiredBookAdditions({title:'Mine',author:'Mine',isbn:''},book,false)).toEqual({})
})
