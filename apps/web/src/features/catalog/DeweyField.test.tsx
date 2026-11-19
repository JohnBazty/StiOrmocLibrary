import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { DeweyField } from './DeweyField'
import type { DeweySelection } from './dewey-api'

const lookup = vi.hoisted(()=>vi.fn())
vi.mock('./dewey-api',()=>({deweyApi:{lookup}}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
function Form({isbn='9780132350884'}:{isbn?:string}) {
  const [value,setValue]=useState<DeweySelection|null>(null)
  return <><DeweyField isbn={isbn} value={value} onChange={setValue}/><output>{JSON.stringify(value)}</output></>
}
it('fills a suggestion automatically but requires review before it can be saved',async()=>{
  lookup.mockResolvedValue({status:'matched',candidates:[{code:'005.100',source:'open_library'}]})
  render(<Form/> )
  await screen.findByDisplayValue('005.100')
  expect(screen.getByText(/"reviewed":false/)).toBeTruthy()
  fireEvent.click(screen.getByLabelText(/I reviewed this Dewey number/))
  expect(screen.getByText(/"reviewed":true/)).toBeTruthy()
})
it('does not replace a manual edit when a slow lookup finishes',async()=>{
  let finish!:(value:unknown)=>void
  lookup.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  render(<Form/> )
  await waitFor(()=>expect(lookup).toHaveBeenCalled())
  fireEvent.change(screen.getByLabelText('Dewey number'),{target:{value:'100'}})
  finish({status:'matched',candidates:[{code:'005.1',source:'open_library'}]})
  await screen.findByText(/Open Library/)
  expect((screen.getByLabelText('Dewey number') as HTMLInputElement).value).toBe('100')
})
it('discards a stale result after the ISBN changes',async()=>{
  let finish!:(value:unknown)=>void
  lookup.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({status:'not_found',candidates:[]})
  const view=render(<Form/> )
  await waitFor(()=>expect(lookup).toHaveBeenCalled())
  view.rerender(<Form isbn="9780062638502"/> )
  await screen.findByText(/No Dewey number found/)
  finish({status:'matched',candidates:[{code:'005.1',source:'open_library'}]})
  await waitFor(()=>expect((screen.getByLabelText('Dewey number') as HTMLInputElement).value).toBe(''))
})
it('multiple results require an explicit choice; provider failure offers a retry',async()=>{
  lookup.mockResolvedValueOnce({status:'unavailable',candidates:[]}).mockResolvedValue({status:'multiple',candidates:[{code:'100'},{code:'200'}]})
  render(<Form/> )
  await screen.findByText(/Lookup is unavailable/)
  fireEvent.click(screen.getByRole('button',{name:'Try Dewey lookup again'}))
  await screen.findByLabelText('Choose a Dewey suggestion')
  expect((screen.getByLabelText('Dewey number') as HTMLInputElement).value).toBe('')
  fireEvent.change(screen.getByLabelText('Choose a Dewey suggestion'),{target:{value:'200'}})
  expect((screen.getByLabelText('Dewey number') as HTMLInputElement).value).toBe('200')
})
