import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { StockItemsPanel } from './StockItemsPanel'
import { operationsGet,operationsSend } from './operations-api'
vi.mock('./operations-api',async()=>({...await vi.importActual('./operations-api'),operationsGet:vi.fn(),operationsSend:vi.fn()}))
afterEach(cleanup)
beforeEach(()=>{vi.clearAllMocks();vi.mocked(operationsGet).mockResolvedValue({items:[],categories:[{category_id:1,name:'School supplies',state:'Active',version:1}]});vi.mocked(operationsSend).mockResolvedValue({})})
describe('understandable stock maintenance',()=>{
 it('reviews a new item before saving and preserves the selected stock unit',async()=>{
  render(<StockItemsPanel kind="merchandise"/>);await screen.findByText('No items yet. Add a category, then add your first item.')
  fireEvent.click(screen.getByRole('button',{name:'Add item'}));fireEvent.change(screen.getByLabelText('Item name'),{target:{value:'Yellow pad'}});fireEvent.change(screen.getByLabelText('Category'),{target:{value:'1'}})
  fireEvent.click(screen.getByRole('button',{name:'Review item'}));expect(operationsSend).not.toHaveBeenCalled()
  expect(screen.getByRole('heading',{name:'Review before saving'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Confirm and save'}))
  await waitFor(()=>expect(operationsSend).toHaveBeenCalledWith('/stock/merchandise/items',expect.objectContaining({name:'Yellow pad',unit:'pieces',commandKey:expect.any(String)}),'POST'))
 })
 it('keeps a failed save available for retry without inventing success',async()=>{
  vi.mocked(operationsSend).mockRejectedValue(new Error('Stock changed. Reload first.'))
  render(<StockItemsPanel kind="printing"/>);await screen.findByText('No items yet. Add a category, then add your first item.')
  fireEvent.click(screen.getByRole('button',{name:'Add item'}));fireEvent.change(screen.getByLabelText('Item name'),{target:{value:'Film'}});fireEvent.change(screen.getByLabelText('Category'),{target:{value:'1'}});fireEvent.click(screen.getByRole('button',{name:'Review item'}));fireEvent.click(screen.getByRole('button',{name:'Confirm and save'}))
  await screen.findByRole('alert');expect(screen.getByRole('heading',{name:'Review before saving'})).toBeTruthy();expect(screen.queryByText('Saved. Stock and change history are up to date.')).toBeNull()
  expect(screen.queryByText('Items could not be loaded. Use Reload records to try again.')).toBeNull()
  const firstKey=vi.mocked(operationsSend).mock.calls[0][1] as {commandKey:string}
  fireEvent.click(screen.getByRole('button',{name:'Back to editing'}));fireEvent.click(screen.getByRole('button',{name:'Review item'}));fireEvent.click(screen.getByRole('button',{name:'Confirm and save'}))
  await waitFor(()=>expect(operationsSend).toHaveBeenCalledTimes(2))
  expect((vi.mocked(operationsSend).mock.calls[1][1] as {commandKey:string}).commandKey).toBe(firstKey.commandKey)
 })
})
