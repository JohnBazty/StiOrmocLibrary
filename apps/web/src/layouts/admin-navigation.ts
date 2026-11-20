import { Archive, Bell, BookMarked, BookOpen, CalendarClock, CircleDollarSign, ClipboardCheck, FileBarChart, Folder, LayoutDashboard, Map, Megaphone, Printer, QrCode, Settings, Scale, SlidersHorizontal, Tags, Users, UserRound, type LucideIcon } from 'lucide-react'

export type AdminNavLink = { label: string; to: string; icon: LucideIcon }
export type AdminNavGroup = { id: string; label: string; icon: LucideIcon; children: AdminNavItem[]; section?: boolean }
export type AdminNavItem = AdminNavLink | AdminNavGroup

const link=(label:string,path:string,icon:LucideIcon):AdminNavLink=>({label,to:`/librarian/${path}`,icon})

export const adminNavigation: AdminNavItem[] = [
  link('Dashboard','dashboard',LayoutDashboard),
  {id:'file-maintenance',label:'File maintenance',icon:Folder,section:true,children:[
    {id:'book-records',label:'Books',icon:BookOpen,children:[
      link('Catalog','catalog',BookOpen),
      link('Categories','categories',Tags),
      link('Inventory','inventory',Archive),
      link('Book archive','book-archive',Archive),
    ]},
    {id:'accounts',label:'Accounts',icon:Users,children:[
      link('Users','users',Users),
      link('QR Roster','student-qr-roster',QrCode),
    ]},
    link('Borrowing policies','borrowing-policies',Scale),
  ]},
  {id:'transaction',label:'Transactions',icon:CalendarClock,section:true,children:[
    link('Borrow & return','circulation',CalendarClock),
    link('Book queue','reservations',BookMarked),
    link('Printing queue','printing',Printer),
    {id:'payments',label:'Payments',icon:CircleDollarSign,children:[
      link('Fines','fines',CircleDollarSign),
      link('Online payments','payments',CircleDollarSign),
      link('Library funds','funds',CircleDollarSign),
    ]},
    link('Attendance','attendance',QrCode),
    link('Clearance','clearance',ClipboardCheck),
  ]},
  {id:'reports',label:'Reports',icon:FileBarChart,section:true,children:[
    link('Reports','reports',FileBarChart),
    link('Audit logs','audit-logs',ClipboardCheck),
  ]},
  {id:'library',label:'Library',icon:BookOpen,section:true,children:[
    link('Library setup','maintenance',Settings),
    link('Floor plan','floor-plan',Map),
    link('Announcements','announcements',Megaphone),
  ]},
  {id:'settings-account',label:'My account',icon:Settings,section:true,children:[
    link('My profile','profile',UserRound),
    link('Notifications','notifications',Bell),
  ]},
]

function flatten(items:AdminNavItem[]):AdminNavLink[]{
  return items.flatMap(item=>'children' in item?flatten(item.children):[item])
}

/** The page header uses the same destinations as the grouped sidebar. */
export const librarianNav=flatten(adminNavigation)
