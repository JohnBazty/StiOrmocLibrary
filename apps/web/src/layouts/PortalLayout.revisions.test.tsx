import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { PortalLayout } from './PortalLayout'
import { ThemeProvider } from '../features/theme/ThemeProvider'
vi.mock('../features/auth/auth-storage',()=>({getAccessToken:()=>'fixture-token',getCurrentIdentity:()=>({role:'Student',schoolId:'EXAMPLE',userId:999001})}))
vi.mock('../features/auth/SessionActivity',()=>({SessionActivity:()=>null}))
vi.mock('./SidebarAccountCard',()=>({SidebarAccountCard:()=>null}))
vi.mock('../features/attendance/AttendanceFab',()=>({AttendanceFab:()=>null}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('shows the real unread total, updates after a read event, and opens Notifications from the bell',async()=>{
  let unread=7
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({success:true,data:{unreadCount:unread,items:[]}}),{headers:{'Content-Type':'application/json'}})))
  render(<MemoryRouter initialEntries={['/student/dashboard']}><ThemeProvider><Routes><Route element={<PortalLayout role="student"/>}><Route path="/student/dashboard" element={<h1>Dashboard content</h1>}/><Route path="/student/notifications" element={<h1>Notification list</h1>}/></Route></Routes></ThemeProvider></MemoryRouter>)
  const bell=await screen.findByRole('button',{name:'Notifications, 7 unread'})
  expect(bell.textContent).toContain('7')
  unread=2
  await act(async()=>{window.dispatchEvent(new Event('smartlib:notifications-updated'))})
  expect(screen.getByRole('button',{name:'Notifications, 2 unread'}).textContent).toContain('2')
  fireEvent.click(screen.getByRole('button',{name:'Notifications, 2 unread'}))
  expect(await screen.findByRole('dialog',{name:'Notifications'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'View all'}))
  expect(await screen.findByRole('heading',{name:'Notification list'})).toBeTruthy()
})
it('keeps the collection and requests separate and offers three profile sections',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({success:true,data:{unreadCount:0,items:[]}}))))
  render(<MemoryRouter initialEntries={['/student/dashboard']}><ThemeProvider><Routes><Route element={<PortalLayout role="student"/>}><Route path="/student/dashboard" element={<h1>Dashboard content</h1>}/><Route path="/student/profile" element={<h1>Profile section</h1>}/></Route></Routes></ThemeProvider></MemoryRouter>)
  expect(screen.getByRole('link',{name:'My books'}).getAttribute('href')).toBe('/student/my-books')
  expect(screen.getByRole('link',{name:'Requests & reservations'}).getAttribute('href')).toBe('/student/reservations')
  fireEvent.click(screen.getByRole('button',{name:'Account menu for EXAMPLE'}))
  for (const name of ['Personal details','School details','Profile photo','Dark mode','Sign out']) expect(screen.getByRole('menuitem',{name})).toBeTruthy()
  fireEvent.click(screen.getByRole('menuitem',{name:'Personal details'}))
  expect(await screen.findByRole('heading',{name:'Profile section'})).toBeTruthy()
})
