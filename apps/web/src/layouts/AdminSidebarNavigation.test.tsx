import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminSidebarNavigation } from './AdminSidebarNavigation'
import { librarianNav } from './admin-navigation'

afterEach(cleanup)
const group=(label:string,scope:HTMLElement=document.body)=>within(scope).getByText(label,{selector:'summary span'}).closest('details')!
const section=(label:string)=>screen.getByRole('heading',{name:label}).closest('li')!

it('uses the requested order as visible sections, with only Books, Accounts and Payments collapsed',()=>{
 render(<MemoryRouter initialEntries={['/librarian/dashboard']}><AdminSidebarNavigation onNavigate={()=>{}}/></MemoryRouter>)
 const menu=screen.getByRole('list',{name:'Admin menu'})
 expect(Array.from(menu.children).map(row=>row.querySelector(':scope > a, :scope > h2')?.textContent?.trim())).toEqual(['Dashboard','File maintenance','Transaction','Reports'])
 expect(Array.from(menu.querySelectorAll('summary')).map(item=>item.textContent?.trim())).toEqual(['Books','Accounts','Payments'])
 for(const name of ['File maintenance','Transaction','Reports'])expect(screen.getByRole('heading',{name}).closest('details')).toBeNull()
 for(const name of ['Borrow & return','Book queue','Printing queue','Attendance','Clearance','Book Reports','Collection review','Floor plan','Maintenance','Print supplies','Announcements']){
  expect(within(menu).getByRole('link',{name}).closest('details')).toBeNull()
 }
 const routes=librarianNav.map(item=>item.to)
 expect(routes).toHaveLength(24)
 expect(new Set(routes).size).toBe(24)
 expect(routes.map(route=>route.replace('/librarian/','')).sort()).toEqual(['dashboard','book-register','reports','book-archive','categories','circulation','reservations','fines','payments','funds','maintenance','inventory','collection-review','floor-plan','printing','supplies','attendance','clearance','announcements','accounts','users','user-archive','notifications','profile'].sort())
})

it('opens only the active payment branch and highlights the current page',()=>{
 render(<MemoryRouter initialEntries={['/librarian/funds']}><AdminSidebarNavigation onNavigate={()=>{}}/></MemoryRouter>)
 const transaction=section('Transaction')
 expect(group('Payments',transaction).open).toBe(true)
 expect(group('Books',section('File maintenance')).open).toBe(false)
 expect(screen.getByRole('link',{name:'Borrow & return'}).closest('details')).toBeNull()
 expect(screen.getByRole('link',{name:'Library funds'}).getAttribute('aria-current')).toBe('page')
})

it('toggles a group without navigating and closes mobile navigation only for a page link',()=>{
 const close=vi.fn()
 render(<MemoryRouter initialEntries={['/librarian/dashboard']}><AdminSidebarNavigation onNavigate={close}/></MemoryRouter>)
 const accounts=group('Accounts',section('File maintenance'))
 fireEvent.click(accounts.querySelector('summary')!)
 expect(accounts.open).toBe(true)
 expect(close).not.toHaveBeenCalled()
 fireEvent.click(within(accounts).getByRole('link',{name:'Users'}))
 expect(close).toHaveBeenCalledOnce()
})

it('keeps a manually closed group closed on rerender, then opens the destination branch on navigation',async()=>{
 function View(){const navigate=useNavigate();return <><button onClick={()=>navigate('/librarian/book-register')}>Go to books</button><AdminSidebarNavigation onNavigate={()=>{}}/></>}
 const view=render(<MemoryRouter initialEntries={['/librarian/funds']}><View/></MemoryRouter>)
 fireEvent.click(group('Payments').querySelector('summary')!)
 expect(group('Payments').open).toBe(false)
 view.rerender(<MemoryRouter initialEntries={['/librarian/funds']}><View/></MemoryRouter>)
 expect(group('Payments').open).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'Go to books'}))
 await waitFor(()=>expect(group('Books',section('File maintenance')).open).toBe(true))
 expect(group('Payments').open).toBe(false)
 expect(screen.getByRole('link',{name:'Book Reports'}).closest('details')).toBeNull()
})
