import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { PortalLayout } from './PortalLayout'
import { ThemeProvider } from '../features/theme/ThemeProvider'
import { NotificationCenterPage } from '../features/notifications/NotificationCenterPage'
vi.mock('../features/auth/auth-storage',()=>({getAccessToken:()=>'fixture-token',getCurrentIdentity:()=>({role:'Student',schoolId:'EXAMPLE',userId:999001})}))
vi.mock('../features/auth/SessionActivity',()=>({SessionActivity:()=>null}))
vi.mock('../features/attendance/AttendanceFab',()=>({AttendanceFab:()=>null}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('previews notices, marks one read, and clears the shortcut and badge after deleting the inbox', async () => {
  const ready = { notificationId: 17, title: 'Book ready for pickup', body: 'Pick up your book at the counter.', type: 'Reservation Arrival', actionPath: '/student/reservations', isRead: false, createdAt: '2026-11-09T08:00:00Z' }
  const announcement = { ...ready, notificationId: 16, title: 'New library hours', type: 'Announcement', actionPath: null }
  let items = [ready, announcement]
  const request = vi.fn(async (path: string, options?: RequestInit) => {
    let data: unknown = { items, unreadCount: items.filter(item => !item.isRead).length }
    if (path.endsWith('/17/read') && options?.method === 'PATCH') ready.isRead = true
    if (path === '/api/v1/notifications' && options?.method === 'DELETE') { items = []; data = { deletedCount: 2 } }
    if (path.endsWith('/schedule')) data = { weekly: [], upcomingClosures: [] }
    return Response.json({ success: true, data })
  })
  vi.stubGlobal('fetch', request)
  render(<MemoryRouter initialEntries={['/student/dashboard']}><ThemeProvider><Routes><Route element={<PortalLayout role="student"/>}><Route path="/student/dashboard" element={<h1>Dashboard content</h1>}/><Route path="/student/notifications" element={<NotificationCenterPage/>}/><Route path="/student/reservations" element={<h1>Reservations</h1>}/></Route></Routes></ThemeProvider></MemoryRouter>)

  expect((await screen.findByLabelText('2 unread notifications')).className).toContain('bg-red-700')
  const bell = screen.getByRole('button', { name: 'Notifications' })
  fireEvent.click(bell)
  const preview = within(screen.getByRole('region', { name: 'Recent notifications' }))
  expect(await preview.findByText(ready.title)).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Dashboard content' })).toBeTruthy()
  fireEvent.click(await preview.findByRole('button', { name: `Mark ${ready.title} as read` }))
  expect(await screen.findByLabelText('1 unread notifications')).toBeTruthy()
  await waitFor(() => expect(preview.queryByRole('button', { name: `Mark ${ready.title} as read` })).toBeNull())
  fireEvent.keyDown(bell, { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Recent notifications' })).toBeNull()

  fireEvent.click(bell)
  fireEvent.click(await screen.findByRole('button', { name: /Book ready for pickup/ }))
  expect(await screen.findByRole('heading', { name: 'Reservations' })).toBeTruthy()
  fireEvent.click(bell)
  fireEvent.click(screen.getByRole('link', { name: 'See all' }))
  await screen.findByText(announcement.title)
  fireEvent.click(await screen.findByRole('button', { name: 'Delete all' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete notifications' }))
  expect(await screen.findByText('No notifications yet.')).toBeTruthy()

  fireEvent.click(bell)
  const emptyPreview = within(screen.getByRole('region', { name: 'Recent notifications' }))
  expect(await emptyPreview.findByText('No notifications yet.')).toBeTruthy()
  expect(emptyPreview.queryByText(ready.title)).toBeNull()
  await waitFor(() => expect(screen.queryByLabelText(/unread notifications/)).toBeNull())
})
it('keeps the collection and requests separate and offers one existing profile destination',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({success:true,data:{unreadCount:0}}))))
  render(<MemoryRouter initialEntries={['/student/dashboard']}><ThemeProvider><Routes><Route element={<PortalLayout role="student"/>}><Route path="/student/dashboard" element={<h1>Dashboard content</h1>}/></Route></Routes></ThemeProvider></MemoryRouter>)
  expect(screen.getByRole('link',{name:'My books'}).getAttribute('href')).toBe('/student/my-books')
  expect(screen.getByRole('link',{name:'Requests & reservations'}).getAttribute('href')).toBe('/student/reservations')
  fireEvent.click(screen.getByRole('button',{name:/Account menu for/}))
  expect(screen.getByRole('menuitem',{name:'Profile'}).getAttribute('href')).toBe('/student/profile')
  expect(screen.queryByRole('link',{name:'Personal details'})).toBeNull()
  expect(screen.queryByRole('link',{name:'School details'})).toBeNull()
  expect(screen.queryByRole('link',{name:'Profile photo'})).toBeNull()
})
