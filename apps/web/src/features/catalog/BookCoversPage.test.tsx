import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {BookCoversPage} from './BookCoversPage'
import {enhancedCatalog} from './enhanced-catalog-api'
vi.mock('./enhanced-catalog-api',()=>({enhancedCatalog:{batches:vi.fn(),batch:vi.fn()}}))
vi.mock('./BulkImportCovers',()=>({BulkImportCovers:({batch,onWorking}:{batch:{filename:string};onWorking:(v:boolean)=>void})=><div>Saved covers for {batch.filename}<button onClick={()=>onWorking(true)}>Synthetic active run</button></div>}))
afterEach(cleanup)
beforeEach(()=>{vi.resetAllMocks();window.history.replaceState({},'', '/librarian/maintenance?section=covers&batch=14');vi.mocked(enhancedCatalog.batches).mockResolvedValue([{id:14,filename:'Completed.xlsx',total:1647,imported:1647,skipped:0,ready:0}]);vi.mocked(enhancedCatalog.batch).mockResolvedValue({id:14,filename:'Completed.xlsx',rows:[]})})
it('opens a completed saved upload from its permanent cover link and protects an active run from list switching',async()=>{
 render(<BookCoversPage/>);expect(await screen.findByText('Saved covers for Completed.xlsx')).toBeTruthy();expect(enhancedCatalog.batch).toHaveBeenCalledWith(14)
 fireEvent.click(screen.getByRole('button',{name:'Synthetic active run'}));await waitFor(()=>expect((screen.getByLabelText('Saved book list for covers') as HTMLSelectElement).disabled).toBe(true))
})
it('offers a retry when saved lists cannot load',async()=>{
 vi.mocked(enhancedCatalog.batches).mockRejectedValueOnce(Error('offline'));render(<BookCoversPage/>);expect(await screen.findByRole('alert')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Refresh saved book lists'}));expect(await screen.findByText('Saved covers for Completed.xlsx')).toBeTruthy()
})
