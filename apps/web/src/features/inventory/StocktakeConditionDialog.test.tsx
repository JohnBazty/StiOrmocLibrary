import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {StocktakeConditionDialog} from './StocktakeConditionDialog'
import type {LookupResult} from './stocktake-api'

const found=(over:Partial<Extract<LookupResult,{found:true}>>&{condition?:string;loan?:string;lifecycle?:string}={}):LookupResult=>({
  found:true,code:'000123',inScope:true,alreadyCounted:false,
  item:{kind:'book',title:'Synthetic book',accession:'A1',barcode:'000123',shelf:'Shelf A',condition:over.condition??'Good',availability:'Available',lifecycle:over.lifecycle??'Active',loan:over.loan??'none'},
  ...(over.inScope===undefined?{}:{inScope:over.inScope}),...(over.alreadyCounted===undefined?{}:{alreadyCounted:over.alreadyCounted}),
})
afterEach(cleanup)
const show=(lookup:LookupResult|null,extra:{saving?:boolean;error?:string}={})=>{
  const onSave=vi.fn(),onCancel=vi.fn();render(<StocktakeConditionDialog code={lookup?.code??'000123'} lookup={lookup} saving={extra.saving??false} error={extra.error??''} onSave={onSave} onCancel={onCancel}/>);return {onSave,onCancel}
}

it('shows a loading message while the label is looked up',()=>{show(null);expect(screen.getByText(/Looking up/i)).toBeTruthy();expect(screen.queryByRole('button',{name:'Save condition'})).toBeNull()})
it('identifies the book and starts on its recorded condition',()=>{
  const {onSave}=show(found());expect(screen.getByRole('dialog',{name:/Check the condition/i})).toBeTruthy()
  expect(screen.getByText('Synthetic book')).toBeTruthy();expect(screen.getByText(/A1/)).toBeTruthy();expect(screen.getByText(/Shelf A/)).toBeTruthy()
  expect((screen.getByRole('radio',{name:/^Good/})as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'Save condition'}));expect(onSave).toHaveBeenCalledWith('good')
})
it('saves a repairable book and says where it will appear',()=>{
  const {onSave}=show(found())
  fireEvent.click(screen.getByRole('radio',{name:/Damaged, can be repaired/}))
  expect(screen.getByText(/Books in repair/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Save condition'}));expect(onSave).toHaveBeenCalledWith('for_repair')
})
it('saves a book damaged beyond repair',()=>{
  const {onSave}=show(found());fireEvent.click(screen.getByRole('radio',{name:/beyond repair/}));fireEvent.click(screen.getByRole('button',{name:'Save condition'}));expect(onSave).toHaveBeenCalledWith('damaged')
})
it('starts on the recorded repair state for research and never preselects for a lost copy',()=>{
  show({...found({condition:'for_repair'})});expect((screen.getByRole('radio',{name:/Damaged, can be repaired/})as HTMLInputElement).checked).toBe(true);cleanup()
  show(found({condition:'Lost'}));expect(screen.getAllByRole('radio').every(radio=>!(radio as HTMLInputElement).checked)).toBe(true)
  expect((screen.getByRole('button',{name:'Save condition'})as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText(/recorded as lost/i)).toBeTruthy()
})
it('warns about repeats, out-of-scope items, loans and archived items',()=>{
  show(found({alreadyCounted:true,inScope:false,loan:'borrowed',lifecycle:'Archived'}))
  for(const text of [/already counted/i,/outside this count/i,/on loan or in use/i,/archived/i])expect(screen.getByText(text)).toBeTruthy()
})
it('handles an unrecognized code and flags a publisher ISBN',()=>{
  const {onSave}=show({found:false,code:'9780306406157'})
  expect(screen.getByText(/not in the library list/i)).toBeTruthy();expect(screen.getByText(/publisher ISBN/i)).toBeTruthy();expect(screen.queryAllByRole('radio')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button',{name:'Save for review'}));expect(onSave).toHaveBeenCalledTimes(1)
})
it('cancels with the button or Escape without saving',()=>{
  const {onSave,onCancel}=show(found());fireEvent.click(screen.getByRole('button',{name:'Scan another'}));fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'})
  expect(onCancel).toHaveBeenCalledTimes(2);expect(onSave).not.toHaveBeenCalled()
})
it('shows a save error and blocks double saving',()=>{
  show(found(),{saving:true,error:'Not saved. Connection lost.'});expect(screen.getByRole('alert').textContent).toMatch(/Connection lost/)
  expect((screen.getByRole('button',{name:'Saving…'})as HTMLButtonElement).disabled).toBe(true)
})
