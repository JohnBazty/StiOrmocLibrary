import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {StocktakePage} from './StocktakePage'
import {stocktakeApi,type LookupResult,type ScanResponse,type StocktakeDetail} from './stocktake-api'
vi.mock('./StocktakeCameraScanner',()=>({StocktakeCameraScanner:({onDetected,paused}:{onDetected:(code:string)=>void;paused:boolean})=><button type="button" data-paused={String(paused)} onClick={()=>onDetected('000123')}>Simulate label read</button>}))
vi.mock('./stocktake-api',()=>({stocktakeApi:{list:vi.fn(),locations:vi.fn(),get:vi.fn(),start:vi.fn(),scan:vi.fn(),lookup:vi.fn(),finish:vi.fn(),cancel:vi.fn(),download:vi.fn()}}))
const result:StocktakeDetail={session:{stocktake_session_id:1,session_name:'Synthetic count',status:'in_progress',asset_kind:'both',scope_label:'Shelf A'},report:{summary:{expected:1,found:0,notChecked:1,onLoan:0,knownLost:0,damaged:0,unknown:0,unexpected:0,duplicates:0,changed:0,archived:0},rows:[{expectedId:1,original:{kind:'book',id:1,title:'Synthetic book',barcode:'000123',accession:'A1',shelf:'Shelf A',condition:'Good'},item:{kind:'book',id:1,title:'Synthetic book',barcode:'000123',accession:'A1',shelf:'Shelf A',condition:'Good'},outcome:'Not yet checked',scans:0,damaged:false,changed:false}],findings:[],generatedAt:'2026-11-18'},reviewToken:'review-token',reviewNote:null,legacy:false}
const bookLookup:LookupResult={found:true,code:'000123',inScope:true,alreadyCounted:false,item:{kind:'book',title:'Synthetic book',accession:'A1',barcode:'000123',shelf:'Shelf A',condition:'Good',availability:'Available',lifecycle:'Active',loan:'none'}}
beforeEach(()=>{vi.mocked(stocktakeApi.list).mockResolvedValue([{id:1,name:'Synthetic count',kind:'both',location:'Shelf A',status:'in_progress',started:''}]);vi.mocked(stocktakeApi.locations).mockResolvedValue(['Shelf A']);vi.mocked(stocktakeApi.get).mockResolvedValue(structuredClone(result));vi.mocked(stocktakeApi.scan).mockResolvedValue(structuredClone(result));vi.mocked(stocktakeApi.lookup).mockResolvedValue(bookLookup)})
afterEach(()=>{cleanup();vi.clearAllMocks()})
function open(){render(<MemoryRouter initialEntries={['/librarian/inventory/stocktake?count=1']}><StocktakePage/></MemoryRouter>)}
it('shows Start inventory now directly without the long scanner instruction boxes',async()=>{render(<MemoryRouter><StocktakePage/></MemoryRouter>);expect(await screen.findByRole('button',{name:'Start inventory now'})).toBeTruthy();expect(screen.queryByText(/How to start scanning with Barcode to PC/i)).toBeNull();expect(screen.queryByText(/Scan with your webcam/i)).toBeNull()})
it('accepts Barcode to PC keyboard text plus Enter and preserves leading zeros',async()=>{open();const input=await screen.findByLabelText('Scan barcode or enter accession');fireEvent.change(screen.getByLabelText('Observed condition'),{target:{value:'good'}});fireEvent.change(input,{target:{value:'000123'}});fireEvent.keyDown(input,{key:'Enter'});await waitFor(()=>expect(stocktakeApi.scan).toHaveBeenCalledWith(1,expect.objectContaining({code:'000123',location:'Shelf A',codeType:'barcode'})));await waitFor(()=>expect((input as HTMLInputElement).value).toBe(''));expect(screen.getByText(/Recorded 000123/)).toBeTruthy()})
it('retains a failed scan and reuses its request reference when retried',async()=>{vi.mocked(stocktakeApi.scan).mockRejectedValueOnce(new Error('Connection lost'));open();const input=await screen.findByLabelText('Scan barcode or enter accession');fireEvent.change(screen.getByLabelText('Observed condition'),{target:{value:'good'}});fireEvent.change(input,{target:{value:'000123'}});fireEvent.keyDown(input,{key:'Enter'});await screen.findByRole('alert');expect((input as HTMLInputElement).value).toBe('000123');fireEvent.keyDown(input,{key:'Enter'});await waitFor(()=>expect(stocktakeApi.scan).toHaveBeenCalledTimes(2));expect(vi.mocked(stocktakeApi.scan).mock.calls[0][1]).toEqual(vi.mocked(stocktakeApi.scan).mock.calls[1][1])})
it('requires explicit review and note before finish; preserves draft on refresh',async()=>{open();await screen.findByLabelText('Scan barcode or enter accession');fireEvent.click(screen.getByRole('button',{name:'Review and finish'}));const note=await screen.findByLabelText('Review note');expect(screen.getByRole('button',{name:'Finish and save report'})).toHaveProperty('disabled',true);fireEvent.change(note,{target:{value:'Check remaining shelf'}});fireEvent.click(screen.getByRole('button',{name:'Refresh count'}));await waitFor(()=>expect(stocktakeApi.get).toHaveBeenCalledTimes(3));expect((note as HTMLTextAreaElement).value).toBe('Check remaining shelf');fireEvent.click(screen.getByRole('checkbox'));vi.mocked(stocktakeApi.finish).mockResolvedValue({...result,session:{...result.session,status:'reviewed'}});fireEvent.click(screen.getByRole('button',{name:'Finish and save report'}));await waitFor(()=>expect(stocktakeApi.finish).toHaveBeenCalledWith(1,{reviewToken:'review-token',reviewed:true,note:'Check remaining shelf'}));await waitFor(()=>expect(screen.queryByLabelText('Scan barcode or enter accession')).toBeNull())})

const scanned=(inventory:NonNullable<ScanResponse['scanResult']>['inventory']):ScanResponse=>({...structuredClone(result),scanResult:{inventory}})
async function readLabel(){open();fireEvent.click(await screen.findByRole('button',{name:'Scan with camera'}));fireEvent.click(await screen.findByRole('button',{name:'Simulate label read'}));return screen.findByRole('dialog',{name:/Check the condition/i})}
it('turns the camera on only after a location is chosen',async()=>{
  vi.mocked(stocktakeApi.get).mockResolvedValue({...structuredClone(result),session:{...result.session,scope_label:'All locations'}});open()
  const button=await screen.findByRole('button',{name:'Scan with camera'});expect((button as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Location being checked'),{target:{value:'Shelf A'}});expect((button as HTMLButtonElement).disabled).toBe(false)
})
it('pops up the condition choice after the camera reads a label, without saving yet',async()=>{
  await readLabel();expect(stocktakeApi.lookup).toHaveBeenCalledWith(1,'000123','barcode');expect(stocktakeApi.scan).not.toHaveBeenCalled()
  expect(within(screen.getByRole('dialog')).getByText('Synthetic book')).toBeTruthy();expect(screen.getByText('Simulate label read').getAttribute('data-paused')).toBe('true')
})
it('saves a repairable book to Books in repair and links to that list',async()=>{
  vi.mocked(stocktakeApi.scan).mockResolvedValue(scanned({status:'applied',from:'Good',to:'For Repair'}))
  await readLabel();fireEvent.click(screen.getByRole('radio',{name:/Damaged, can be repaired/}));fireEvent.click(screen.getByRole('button',{name:'Save condition'}))
  await waitFor(()=>expect(stocktakeApi.scan).toHaveBeenCalledWith(1,expect.objectContaining({code:'000123',location:'Shelf A',codeType:'barcode',condition:'for_repair',requestKey:expect.any(String)})))
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());const status=screen.getByRole('status');expect(status.textContent).toMatch(/Synthetic book.*For Repair/)
  expect(within(status).getByRole('link',{name:/Books in repair/}).getAttribute('href')).toBe('/librarian/inventory?condition=For%20Repair')
  expect(screen.getByText('Simulate label read').getAttribute('data-paused')).toBe('false')
})
it('links damaged-beyond-repair books to Damaged copies',async()=>{
  vi.mocked(stocktakeApi.scan).mockResolvedValue(scanned({status:'applied',from:'Good',to:'Damaged'}))
  await readLabel();fireEvent.click(screen.getByRole('radio',{name:/beyond repair/}));fireEvent.click(screen.getByRole('button',{name:'Save condition'}))
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  expect(within(screen.getByRole('status')).getByRole('link',{name:/Damaged copies/}).getAttribute('href')).toBe('/librarian/inventory?condition=Damaged')
})
it('says plainly when the count was saved but the inventory status could not change',async()=>{
  vi.mocked(stocktakeApi.scan).mockResolvedValue(scanned({status:'failed',message:'This item is on loan.'}))
  await readLabel();fireEvent.click(screen.getByRole('radio',{name:/Damaged, can be repaired/}));fireEvent.click(screen.getByRole('button',{name:'Save condition'}))
  await waitFor(()=>expect(screen.getByRole('status').textContent).toMatch(/Counted.*status was not changed.*on loan/))
})
it('keeps the pop-up open on a failed save and retries with the same reference',async()=>{
  vi.mocked(stocktakeApi.scan).mockRejectedValueOnce(new Error('Connection lost'));vi.mocked(stocktakeApi.scan).mockResolvedValue(scanned({status:'none'}))
  await readLabel();fireEvent.click(screen.getByRole('radio',{name:/Damaged, can be repaired/}));fireEvent.click(screen.getByRole('button',{name:'Save condition'}))
  expect((await screen.findByRole('alert')).textContent).toMatch(/Not saved.*Connection lost/);expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Save condition'}));await waitFor(()=>expect(stocktakeApi.scan).toHaveBeenCalledTimes(2))
  expect(vi.mocked(stocktakeApi.scan).mock.calls[0][1]).toEqual(vi.mocked(stocktakeApi.scan).mock.calls[1][1])
})
it('uses a new reference when the condition is changed after a failed save',async()=>{
  vi.mocked(stocktakeApi.scan).mockRejectedValueOnce(new Error('Connection lost'));vi.mocked(stocktakeApi.scan).mockResolvedValue(scanned({status:'none'}))
  await readLabel();fireEvent.click(screen.getByRole('radio',{name:/Damaged, can be repaired/}));fireEvent.click(screen.getByRole('button',{name:'Save condition'}));await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('radio',{name:/^Good/}));fireEvent.click(screen.getByRole('button',{name:'Save condition'}));await waitFor(()=>expect(stocktakeApi.scan).toHaveBeenCalledTimes(2))
  const [first,second]=vi.mocked(stocktakeApi.scan).mock.calls.map(call=>call[1] as {requestKey:string;condition:string})
  expect(second.condition).toBe('good');expect(second.requestKey).not.toBe(first.requestKey)
})
it('saves nothing when staff choose Scan another',async()=>{
  await readLabel();fireEvent.click(screen.getByRole('button',{name:'Scan another'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(stocktakeApi.scan).not.toHaveBeenCalled()
})
it('shows an error, stops the camera, and opens no pop-up when the count is finished',async()=>{
  vi.mocked(stocktakeApi.lookup).mockRejectedValueOnce(new Error('This count is finished. Open a new count to scan more items.'));open()
  fireEvent.click(await screen.findByRole('button',{name:'Scan with camera'}));fireEvent.click(await screen.findByRole('button',{name:'Simulate label read'}))
  expect((await screen.findByRole('alert')).textContent).toMatch(/count is finished/);expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByText('Simulate label read')).toBeNull()
})
it('records an unrecognized label for review',async()=>{
  vi.mocked(stocktakeApi.lookup).mockResolvedValue({found:false,code:'000123'});vi.mocked(stocktakeApi.scan).mockResolvedValue(scanned({status:'none'}))
  open();fireEvent.click(await screen.findByRole('button',{name:'Scan with camera'}));fireEvent.click(await screen.findByRole('button',{name:'Simulate label read'}))
  fireEvent.click(await screen.findByRole('button',{name:'Save for review'}));await waitFor(()=>expect(stocktakeApi.scan).toHaveBeenCalledWith(1,expect.objectContaining({code:'000123',codeType:'barcode'})))
})
it('links repairable research items to the filtered research inventory and lists recent camera scans',async()=>{
  vi.mocked(stocktakeApi.lookup).mockResolvedValue({found:true,code:'000125',inScope:true,alreadyCounted:false,item:{kind:'research',title:'Synthetic thesis',accession:'R1',barcode:'000125',shelf:'Shelf B',condition:'good',availability:'available',lifecycle:'Active',loan:'none'}})
  vi.mocked(stocktakeApi.scan).mockResolvedValue(scanned({status:'applied',from:'good',to:'for_repair'}))
  await readLabel();fireEvent.click(screen.getByRole('radio',{name:/Damaged, can be repaired/}));fireEvent.click(screen.getByRole('button',{name:'Save condition'}))
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  expect(within(screen.getByRole('status')).getByRole('link',{name:/Research in repair/}).getAttribute('href')).toBe('/librarian/inventory?resource=research&condition=for_repair')
  expect(within(screen.getByRole('list',{name:'Recent camera scans'})).getByText('Synthetic thesis (R1)')).toBeTruthy()
})