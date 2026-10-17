import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { MyBooksPage } from './MyBooksPage'
const api = vi.hoisted(() => ({ myBooks: vi.fn() }))
vi.mock('../circulation/circulation-api', () => ({ circulationApi: api }))
vi.mock('../auth/auth-storage', () => ({ getCurrentIdentity: () => ({ role: 'Student' }) }))
const book = {transactionId:1,titleId:5,title:'Sample Book',author:'Test Author',coverImagePath:null,barcode:'EXAMPLE',accessionNumber:null,borrowDate:'2026-10-15T15:17:00+08:00',dueDate:null,returnDate:null,status:'Returned',lostReportStatus:null}
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers() })
it('shows borrowed titles once, excludes waiting requests, and searches the collection', async () => {
  api.myBooks.mockResolvedValue({ items:[book,{...book,transactionId:2,borrowDate:'2026-10-16T15:17:00+08:00'},{...book,titleId:6,title:'Waiting Book',status:'Pending'}] })
  render(<MemoryRouter><MyBooksPage /></MemoryRouter>)
  expect(await screen.findByRole('heading',{name:'Sample Book'})).toBeTruthy()
  expect(screen.queryByRole('heading',{name:'Waiting Book'})).toBeNull()
  expect(screen.getAllByRole('heading',{name:'Sample Book'})).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('Search my books'),{target:{value:'missing'}})
  expect(screen.getByText('No books match your search.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Search my books'),{target:{value:'test author'}})
  expect(screen.getByRole('heading',{name:'Sample Book'})).toBeTruthy()
})
it('retains collection and search while a background request fails', async () => {
  vi.useFakeTimers()
  api.myBooks.mockResolvedValueOnce({items:[book]}).mockRejectedValue(new Error('Connection interrupted'))
  render(<MemoryRouter><MyBooksPage /></MemoryRouter>)
  await act(async () => {})
  fireEvent.change(screen.getByLabelText('Search my books'),{target:{value:'Sample'}})
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(screen.getByRole('heading',{name:'Sample Book'})).toBeTruthy()
  expect((screen.getByLabelText('Search my books') as HTMLInputElement).value).toBe('Sample')
  expect(screen.getByRole('alert').textContent).toBe('Connection interrupted')
})
