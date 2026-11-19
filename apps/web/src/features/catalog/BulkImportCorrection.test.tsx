import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {BulkImportCorrection} from './BulkImportCorrection'
import {importAutomationApi,type ImportAutomationRun} from './import-automation-api'
import type {Batch,Options} from './enhanced-catalog-api'
vi.mock('./import-automation-api',()=>({importAutomationApi:{preview:vi.fn(),start:vi.fn(),step:vi.fn(),status:vi.fn(),state:vi.fn()}}))
afterEach(cleanup)
const groups=['CHED HRM','CHED TM','GE BOOKS','IT BOOKS','SHS BOOKS'].map(sheet=>({sheet,total:329,missingCategory:329,missingShelf:329}))
const batch={id:14,filename:'School upload.xlsx',rows:Array.from({length:1647},(_,i)=>({id:i+1,status:i<2?'Imported':'Review'}))} as Batch
const options={categories:[{id:1,name:'Reviewed category',status:'Active',version:1,shelfLocation:'Shelf A'}],locations:[{id:2,name:'Shelf A',status:'Active',version:1}],programs:[],courses:[],types:[]} as Options
const run=(processed=0,status:ImportAutomationRun['status']='running'):ImportAutomationRun=>({id:'00000000-0000-0000-0000-000000000001',batchId:14,kind:'correction',status,processed,total:1645,counters:{checked:processed,changed:processed,unresolved:0,conflicts:0},error:null,version:processed+1,createdAt:'',updatedAt:''})
const preview={batchId:14,total:1645,imported:2,revision:'reviewed-revision',groups,invalidIsbns:223,invalidYears:98,latest:null}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(importAutomationApi.preview).mockResolvedValue(preview);vi.mocked(importAutomationApi.start).mockResolvedValue(run())})
async function review(){fireEvent.click(await screen.findByRole('button',{name:'Auto-correct all 1645 pending books'}));await screen.findByText(/Review choices for 1645 pending books/);for(const group of groups)fireEvent.change(screen.getByLabelText(`Category for ${group.sheet}`),{target:{value:'1'}})}
it('reviews all five source sections once then automatically continues to all 1,645 entries',async()=>{
 vi.mocked(importAutomationApi.step).mockResolvedValueOnce(run(100)).mockResolvedValueOnce(run(1645,'completed'))
 const done=vi.fn(async()=>{}),working=vi.fn();render(<BulkImportCorrection batch={batch} options={options} disabled={false} onWorking={working} onDone={done} onReviewReady={()=>{}}/>)
 await review();expect(screen.getByText(/2 already imported books will be kept/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Start correction for 1645 books'}))
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1),{timeout:4000})
 expect(screen.getByRole('button',{name:'Review and add corrected books'})).toBeTruthy();expect(importAutomationApi.step).toHaveBeenCalledTimes(2);expect(screen.getByText('Correction complete: 1645 of 1645 checked')).toBeTruthy()
 expect(importAutomationApi.start).toHaveBeenCalledWith(14,expect.objectContaining({clearInvalidOptional:true,revision:'reviewed-revision',plans:groups.map(g=>({sheet:g.sheet,categoryId:1,location:'Shelf A'}))}))
 expect(working).toHaveBeenCalledWith(true);expect(working).toHaveBeenLastCalledWith(false)
})
it('pause waits for the current saved step and never starts another step',async()=>{
 let resolve!:(v:ImportAutomationRun)=>void;vi.mocked(importAutomationApi.step).mockImplementation(()=>new Promise(r=>{resolve=r}));vi.mocked(importAutomationApi.state).mockResolvedValue(run(100,'paused'))
 const done=vi.fn(async()=>{});render(<BulkImportCorrection batch={batch} options={options} disabled={false} onWorking={()=>{}} onDone={done}/>)
 await review();fireEvent.click(screen.getByRole('button',{name:'Start correction for 1645 books'}))
 fireEvent.click(await screen.findByRole('button',{name:'Pause after this group'}));expect(importAutomationApi.state).not.toHaveBeenCalled()
 resolve(run(100));await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));expect(importAutomationApi.step).toHaveBeenCalledTimes(1);expect(await screen.findByText('Correction paused: 100 of 1645 checked')).toBeTruthy()
})
it('continues saved progress after reload and protects open row drafts',async()=>{
 vi.mocked(importAutomationApi.preview).mockResolvedValue({...preview,latest:run(100,'paused')});vi.mocked(importAutomationApi.status).mockResolvedValue(run(100,'paused'));vi.mocked(importAutomationApi.state).mockResolvedValue(run(100));vi.mocked(importAutomationApi.step).mockResolvedValue(run(1645,'completed'))
 const done=vi.fn(async()=>{}),props={batch,options,onWorking:()=>{},onDone:done};const {rerender}=render(<BulkImportCorrection {...props} disabled/>)
 expect((await screen.findByRole('button',{name:'Continue correcting all books'}) as HTMLButtonElement).disabled).toBe(true)
 expect(screen.getByText(/Save or discard open book edits/)).toBeTruthy()
 rerender(<BulkImportCorrection {...props} disabled={false}/>);fireEvent.click(screen.getByRole('button',{name:'Continue correcting all books'}))
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));expect(importAutomationApi.start).not.toHaveBeenCalled();expect(importAutomationApi.status).toHaveBeenCalledWith(run().id)
})
