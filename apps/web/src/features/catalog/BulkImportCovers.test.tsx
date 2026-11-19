import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {BulkImportCovers} from './BulkImportCovers'
import {importAutomationApi,type ImportAutomationRun,type ImportCoverProposal} from './import-automation-api'
import type {Batch} from './enhanced-catalog-api'
vi.mock('./import-automation-api',()=>({importAutomationApi:{preview:vi.fn(),covers:vi.fn(),start:vi.fn(),step:vi.fn(),state:vi.fn(),status:vi.fn(),acceptCovers:vi.fn(),removeCover:vi.fn()}}))
afterEach(cleanup)
const batch={id:14,filename:'School upload.xlsx',rows:Array.from({length:1647},(_,i)=>({id:i+1,status:i<2?'Imported':'Review'}))} as Batch
const run=(n=0,status:ImportAutomationRun['status']='running'):ImportAutomationRun=>({id:'cover-run',batchId:14,kind:'cover',status,processed:n,total:1645,counters:{checked:n,changed:n,unresolved:0,conflicts:0},error:null,version:n+1,createdAt:'',updatedAt:''})
const preview={batchId:14,total:1645,imported:2,revision:'current-list',groups:[],invalidIsbns:0,invalidYears:0,latest:null,latestCover:null as ImportAutomationRun|null}
const proposal:ImportCoverProposal={rowId:3,status:'matched',path:'https://example.test/cover.jpg',isbn:'0132350882',evidence:{mode:'Exact ISBN'},accepted:false,version:1,current:true,imported:false,title:'Synthetic book'}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(importAutomationApi.preview).mockResolvedValue(preview);vi.mocked(importAutomationApi.covers).mockResolvedValue({rows:[],total:1645})})
it('processes all pending entries automatically then displays found proposals before acceptance',async()=>{
 vi.mocked(importAutomationApi.start).mockResolvedValue(run());vi.mocked(importAutomationApi.step).mockImplementation(async()=>{vi.mocked(importAutomationApi.preview).mockResolvedValue({...preview,latestCover:run(1645,'completed')});vi.mocked(importAutomationApi.covers).mockResolvedValue({rows:[proposal],total:1645});return run(1645,'completed')})
 const done=vi.fn(async()=>{});render(<BulkImportCovers batch={batch} disabled={false} onWorking={()=>{}} onDone={done}/>)
 const start=await screen.findByRole('button',{name:'Find covers for all 1645 books without covers'});await waitFor(()=>expect((start as HTMLButtonElement).disabled).toBe(false));fireEvent.click(start)
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));expect(screen.getByText('Cover lookup complete: 1645 of 1645 checked')).toBeTruthy();expect(screen.getByRole('img',{name:'Suggested cover for Synthetic book'})).toBeTruthy()
 expect(importAutomationApi.start).toHaveBeenCalledWith(14,expect.objectContaining({kind:'cover',retry:true,revision:'current-list'}));expect(importAutomationApi.acceptCovers).not.toHaveBeenCalled()
})
it('explicit cover selection sends only displayed current proposal versions and removal is available',async()=>{
 vi.mocked(importAutomationApi.covers).mockResolvedValue({rows:[proposal,{...proposal,rowId:4,current:false},{...proposal,rowId:5,imported:true}],total:1645});vi.mocked(importAutomationApi.acceptCovers).mockResolvedValue({accepted:1})
 render(<BulkImportCovers batch={batch} disabled={false} onWorking={()=>{}} onDone={async()=>{}}/>)
 const use=await screen.findByRole('button',{name:'Use matched covers when adding books'});expect((use as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(use);await waitFor(()=>expect(importAutomationApi.acceptCovers).toHaveBeenCalledWith(14,[{rowId:3,version:1}]))
 expect(screen.getAllByRole('img')).toHaveLength(1);expect(screen.getByRole('button',{name:'Remove this suggested cover'})).toBeTruthy()
})
it('continues a paused run after reload and never restarts the saved scan',async()=>{
 vi.mocked(importAutomationApi.preview).mockResolvedValue({...preview,latestCover:run(100,'paused')});vi.mocked(importAutomationApi.status).mockResolvedValue(run(100,'paused'));vi.mocked(importAutomationApi.state).mockResolvedValue(run(100));vi.mocked(importAutomationApi.step).mockImplementation(async()=>{vi.mocked(importAutomationApi.preview).mockResolvedValue({...preview,latestCover:run(1645,'completed')});return run(1645,'completed')})
 const done=vi.fn(async()=>{});render(<BulkImportCovers batch={batch} disabled={false} onWorking={()=>{}} onDone={done}/>)
 fireEvent.click(await screen.findByRole('button',{name:'Continue whole-list cover lookup'}));await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));expect(importAutomationApi.start).not.toHaveBeenCalled()
})

it('keeps saved lookup resumable after every book has been imported',async()=>{
 vi.mocked(importAutomationApi.preview).mockResolvedValue({...preview,coverTotal:1,latestCover:run(2,'paused')})
 render(<BulkImportCovers batch={{...batch,rows:batch.rows.map(r=>({...r,status:'Imported'}))}} disabled={false} onWorking={()=>{}} onDone={async()=>{}}/>)
 expect(await screen.findByRole('button',{name:'Continue whole-list cover lookup'})).toBeTruthy()
 expect(screen.getByText(/continue later from Library setup/)).toBeTruthy()
})
it('shows an imported-book proposal and requires review before applying its missing catalog cover',async()=>{
 vi.mocked(importAutomationApi.covers).mockResolvedValue({rows:[{...proposal,imported:true,canApply:true}],total:1});vi.mocked(importAutomationApi.acceptCovers).mockResolvedValue({accepted:1})
 render(<BulkImportCovers batch={batch} disabled={false} onWorking={()=>{}} onDone={async()=>{}}/>)
 const apply=await screen.findByRole('button',{name:'Apply reviewed covers'});expect((apply as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(apply);await waitFor(()=>expect(importAutomationApi.acceptCovers).toHaveBeenCalledWith(14,[{rowId:3,version:1}]))
})
