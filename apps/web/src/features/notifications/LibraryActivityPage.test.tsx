import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LibraryActivityPage } from './LibraryActivityPage'
import { LibrarianNotificationsPage } from './LibrarianNotificationsPage'

const api=vi.hoisted(()=>({activity:vi.fn(),list:vi.fn(),schedule:vi.fn(),markRead:vi.fn(),markAllRead:vi.fn(),remove:vi.fn(),removeAll:vi.fn()}))
vi.mock('./notification-api',()=>({notificationApi:api}))
vi.mock('./AdminNotificationsPage',()=>({AdminNotificationsPage:()=> <h1>Account activity</h1>}))
const item={id:'entry:1',category:'attendance',title:'Library entry',body:'Checked in for Study.',person:'QA Reader',schoolId:'0000123',resource:'Study',reference:'Visit 1',createdAt:'2026-10-21T23:30:00Z',actionPath:'/librarian/attendance?q=0000123&date=2026-10-22'}
const result={items:[item],hasMore:false,category:'all',timezone:'Asia/Manila'}
beforeEach(()=>{
  vi.clearAllMocks()
  api.activity.mockResolvedValue(result)
  api.list.mockResolvedValue({items:[],unreadCount:0,pagination:{page:1,limit:100,total:0,totalPages:0}})
  api.schedule.mockResolvedValue({weekly:[],upcomingClosures:[]})
})
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks()})

it('shows named activity, Philippine dates, and a filtered authorized link',async()=>{
  render(<MemoryRouter><LibraryActivityPage/></MemoryRouter>)
  expect(await screen.findByText('QA Reader · 0000123')).toBeTruthy()
  expect(screen.getByRole('link',{name:'View related records'}).getAttribute('href')).toBe(item.actionPath)
  expect(screen.getByText(/Visit 1/).textContent).toContain('Oct 22, 2026')
  expect(api.markRead).not.toHaveBeenCalled()
})

it('changes the activity category without requesting unrelated actions',async()=>{
  render(<MemoryRouter><LibraryActivityPage/></MemoryRouter>)
  await screen.findByText('QA Reader · 0000123')
  api.activity.mockResolvedValue({items:[],hasMore:false,category:'printing',timezone:'Asia/Manila'})
  fireEvent.change(screen.getByRole('combobox',{name:'Show'}),{target:{value:'printing'}})
  expect(await screen.findByText('No activity recorded for this selection.')).toBeTruthy()
  expect(api.activity.mock.calls.at(-1)?.[0]).toBe('printing')
  expect(api.markAllRead).not.toHaveBeenCalled()
})

it('polls each second and keeps the selected category and last good activity on error',async()=>{
  vi.useFakeTimers()
  render(<MemoryRouter><LibraryActivityPage/></MemoryRouter>)
  await act(async()=>{})
  fireEvent.change(screen.getByRole('combobox',{name:'Show'}),{target:{value:'attendance'}})
  await act(async()=>{})
  api.activity.mockRejectedValueOnce(new Error('Connection interrupted.'))
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000)})
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('attendance')
  expect(screen.getByText('QA Reader · 0000123')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('Connection interrupted.')
  expect(api.activity).toHaveBeenCalledTimes(3)
})

it('separates routine activity, unread alerts and account reviews',async()=>{
  render(<MemoryRouter><LibrarianNotificationsPage/></MemoryRouter>)
  expect(await screen.findByRole('heading',{name:'Alerts & reminders'})).toBeTruthy()
  expect(screen.queryByRole('heading',{name:'Library schedule'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Recent library activity'}))
  expect(await screen.findByText('QA Reader · 0000123')).toBeTruthy()
  expect(api.markRead).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Account activity'}))
  expect(screen.getByRole('heading',{name:'Account activity'})).toBeTruthy()
})

it('explains the bounded activity list and never shows an empty state for a failed first load',async()=>{
  api.activity.mockRejectedValue(new Error('Offline'))
  render(<MemoryRouter><LibraryActivityPage/></MemoryRouter>)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByText('No activity recorded for this selection.')).toBeNull()
  api.activity.mockResolvedValue({...result,hasMore:true})
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}))
  expect(await screen.findByText(/Showing the latest 50 events/)).toBeTruthy()
})
