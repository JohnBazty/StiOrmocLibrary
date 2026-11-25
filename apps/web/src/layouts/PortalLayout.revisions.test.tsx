import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { PortalLayout } from './PortalLayout'
import { ThemeProvider } from '../features/theme/ThemeProvider'
import { NotificationCenterPage } from '../features/notifications/NotificationCenterPage'
const authApi = vi.hoisted(() => ({ logout: vi.fn(async () => undefined) }))
vi.mock('../features/auth/auth-api', () => authApi)
vi.mock('../features/auth/auth-storage',()=>({getCsrfToken:()=>'fixture-token',getCurrentIdentity:()=>({role:'Student',schoolId:'EXAMPLE',userId:999001})}))
vi.mock('../features/auth/SessionActivity',()=>({SessionActivity:()=>null}))
vi.mock('./SidebarAccountCard',()=>({SidebarAccountCard:()=>null}))
vi.mock('../features/attendance/AttendanceFab',()=>({AttendanceFab:()=>null}))
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals()})
it('uses grouped navigation for the combined Librarian/Admin workspace',()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,data:{unreadCount:0,request:null}})))
 render(<MemoryRouter initialEntries={['/librarian/funds']}><ThemeProvider><Routes><Route element={<PortalLayout role="librarian"/>}><Route path="/librarian/funds" element={<h1>Funds content</h1>}/></Route></Routes></ThemeProvider></MemoryRouter>)
 const menu=screen.getByRole('list',{name:'Admin menu'})
 expect(within(menu).getByRole('heading',{name:'Transactions'}).closest('details')).toBeNull()
 expect(within(menu).getByRole('link',{name:'Borrow & return'}).closest('details')).toBeNull()
 expect(within(menu).getByRole('link',{name:'Library funds'}).getAttribute('aria-current')).toBe('page')
 expect(screen.queryByText('Operations',{exact:true})).toBeNull()
})
it.each(['staff','admin'] as const)('retains the existing restricted %s navigation',role=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,data:{unreadCount:0,request:null}})))
 render(<MemoryRouter initialEntries={[`/${role}/dashboard`]}><ThemeProvider><Routes><Route element={<PortalLayout role={role}/> }><Route path={`/${role}/dashboard`} element={<h1>Workspace content</h1>}/></Route></Routes></ThemeProvider></MemoryRouter>)
 expect(screen.queryByRole('list',{name:'Admin menu'})).toBeNull()
 expect(screen.queryByRole('link',{name:'Book register'})).toBeNull()
 expect(screen.getByRole('link',{name:role==='staff'?'Printing queue':'Users'})).toBeTruthy()
})
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
it.each(['student','faculty'] as const)('orders %s navigation by task with direct profile access and notifications in the header', role => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({success:true,data:{unreadCount:0,request:null}})))
  render(<MemoryRouter initialEntries={[`/${role}/dashboard`]}><ThemeProvider><Routes><Route element={<PortalLayout role={role}/>}><Route path={`/${role}/*`} element={<h1>Portal content</h1>}/></Route></Routes></ThemeProvider></MemoryRouter>)
  const sidebar = screen.getByRole('complementary', {name:'Portal navigation'})
  expect(within(sidebar).getAllByRole('heading').map(item => item.textContent)).toEqual(['Explore library','My borrowing','Services','Payments & clearance','My account'])
  const links = within(sidebar).getAllByRole('link')
  expect(links.map(link => link.textContent)).toEqual(['Dashboard','Library catalog','Research & thesis','Library schedule','Library floor plan','Book cart','Requests & reservations','My books','Borrowing history','Printing service','QR attendance','Fines','Transactions','Clearance status','My profile'])
  expect(links.map(link => link.getAttribute('href'))).toEqual(['dashboard','library','research','library-schedule','floor-plan','cart','reservations','my-books','borrowing','printing','attendance','fines','transactions','clearance','profile'].map(path => `/${role}/${path}`))
  expect(sidebar.querySelector('details')).toBeNull()
  expect(within(sidebar).queryByRole('link',{name:'Notifications'})).toBeNull()
  expect(screen.getByRole('button',{name:'Notifications'})).toBeTruthy()
  expect(within(sidebar).queryByRole('button',{name:'Sign out'})).toBeNull()
  expect(screen.getAllByRole('button',{name:'Sign out'})).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'Open navigation'}))
  expect(screen.getByRole('button',{name:'Open navigation'}).getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(within(sidebar).getByRole('link',{name:'Transactions'}))
  expect(screen.getByRole('button',{name:'Open navigation'}).getAttribute('aria-expanded')).toBe('false')
  expect(within(sidebar).getByRole('link',{name:'Transactions'}).getAttribute('aria-current')).toBe('page')
})
it.each(['student', 'faculty', 'admin', 'librarian', 'staff'] as const)('asks before signing out of the %s portal', async (role) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, data: { unreadCount: 0, request: null } })))
  render(<MemoryRouter initialEntries={[`/${role}/dashboard`]}><ThemeProvider><Routes><Route element={<PortalLayout role={role} />}><Route path={`/${role}/dashboard`} element={<h1>Workspace content</h1>} /><Route path="/login" element={<h1>Login page</h1>} /></Route></Routes></ThemeProvider></MemoryRouter>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0])
  const dialog = screen.getByRole('alertdialog', { name: 'Sign out of your library account?' })
  expect(authApi.logout).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(authApi.logout).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0])
  fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }))
  await waitFor(() => expect(authApi.logout).toHaveBeenCalledTimes(1))
  expect(await screen.findByRole('heading', { name: 'Login page' })).toBeTruthy()
})
