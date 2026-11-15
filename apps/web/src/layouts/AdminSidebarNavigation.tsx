import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '../components/ui'
import { adminNavigation, type AdminNavGroup, type AdminNavItem } from './admin-navigation'

function containsPath(item:AdminNavItem,pathname:string):boolean{
  return 'children' in item?item.children.some(child=>containsPath(child,pathname)):pathname===item.to||pathname.startsWith(item.to+'/')
}

function NavigationGroup({item,pathname,onNavigate}:{item:AdminNavGroup;pathname:string;onNavigate:()=>void}){
  const element=useRef<HTMLDetailsElement>(null)
  const active=containsPath(item,pathname)
  useEffect(()=>{if(element.current)element.current.open=active},[pathname,active])
  const Icon=item.icon
  return <details ref={element} open={active||undefined} className="sidebar-nav-group">
    <summary className={cn('flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden',active?'bg-white/10 text-white':'text-white/75 hover:bg-white/10 hover:text-white')}>
      <Icon size={17} className="shrink-0" aria-hidden="true"/><span className="min-w-0 flex-1">{item.label}</span><ChevronDown size={15} aria-hidden="true" className="sidebar-nav-chevron shrink-0 opacity-60"/>
    </summary>
    <NavigationList items={item.children} pathname={pathname} onNavigate={onNavigate}/>
  </details>
}

function NavigationList({items,pathname,onNavigate,root=false}:{items:AdminNavItem[];pathname:string;onNavigate:()=>void;root?:boolean}){
  return <ul aria-label={root?'Admin menu':undefined} className={root?'space-y-1':'my-1 ml-4 space-y-1 border-l border-white/15 pl-2'}>
    {items.map(item=>{
      if('children' in item)return <li key={item.id}><NavigationGroup item={item} pathname={pathname} onNavigate={onNavigate}/></li>
      const Icon=item.icon
      return <li key={item.to}><NavLink to={item.to} onClick={onNavigate} end={item.to.endsWith('/dashboard')} className={({isActive})=>cn('flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',isActive?'bg-white text-[#0b5ea2] shadow-sm dark:bg-[#FFF200]':'text-white/70 hover:bg-white/10 hover:text-white')}><Icon size={17} aria-hidden="true" className="shrink-0"/><span className="min-w-0 flex-1">{item.label}</span></NavLink></li>
    })}
  </ul>
}

export function AdminSidebarNavigation({onNavigate}:{onNavigate:()=>void}){
  const {pathname}=useLocation()
  return <NavigationList items={adminNavigation} pathname={pathname} onNavigate={onNavigate} root/>
}
