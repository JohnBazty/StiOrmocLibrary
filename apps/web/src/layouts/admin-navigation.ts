import { Archive, Bell, BookMarked, BookOpen, CalendarClock, CircleDollarSign, ClipboardCheck, FileBarChart, Folder, LayoutDashboard, Map, Megaphone, PackageOpen, Printer, QrCode, Settings, Tags, Users, UserRound, type LucideIcon } from 'lucide-react'

export type AdminNavLink = { label: string; to: string; icon: LucideIcon }
export type AdminNavGroup = { id: string; label: string; icon: LucideIcon; children: AdminNavItem[] }
export type AdminNavItem = AdminNavLink | AdminNavGroup

const link=(label:string,path:string,icon:LucideIcon):AdminNavLink=>({label,to:`/librarian/${path}`,icon})

export const adminNavigation: AdminNavItem[] = [
  link('Dashboard','dashboard',LayoutDashboard),
  {id:'file-maintenance',label:'File maintenance',icon:Folder,children:[
    {id:'book-records',label:'Books',icon:BookOpen,children:[
      link('Book register','book-register',BookOpen),
      link('Categories','categories',Tags),
      link('Inventory','inventory',Archive),
      link('Book archive','book-archive',Archive),
    ]},
    {id:'accounts',label:'Accounts',icon:Users,children:[
      link('Account overview','accounts',LayoutDashboard),
      link('Users','users',Users),
      link('User archive','user-archive',Archive),
      link('Notifications','notifications',Bell),
      link('My profile','profile',UserRound),
    ]},
    {id:'library-setup',label:'Library setup',icon:Settings,children:[
      link('Floor plan','floor-plan',Map),
      link('Maintenance','maintenance',Settings),
      link('Print supplies','supplies',PackageOpen),
      link('Announcements','announcements',Megaphone),
    ]},
  ]},
  {id:'transaction',label:'Transaction',icon:CalendarClock,children:[
    {id:'book-transactions',label:'Books',icon:BookOpen,children:[
      link('Borrow & return','circulation',CalendarClock),
      link('Book queue','reservations',BookMarked),
    ]},
    {id:'payments',label:'Payments',icon:CircleDollarSign,children:[
      link('Fines','fines',CircleDollarSign),
      link('Online payments','payments',CircleDollarSign),
      link('Library funds','funds',CircleDollarSign),
    ]},
    link('Printing queue','printing',Printer),
    link('Attendance','attendance',QrCode),
    link('Clearance','clearance',ClipboardCheck),
  ]},
  {id:'reports',label:'Reports',icon:FileBarChart,children:[
    link('Book Reports','reports',FileBarChart),
    link('Collection review','collection-review',ClipboardCheck),
  ]},
]

function flatten(items:AdminNavItem[]):AdminNavLink[]{
  return items.flatMap(item=>'children' in item?flatten(item.children):[item])
}

/** The page header uses the same destinations as the grouped sidebar. */
export const librarianNav=flatten(adminNavigation)
