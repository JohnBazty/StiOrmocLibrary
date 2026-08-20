import {
  Activity,
  Archive,
  BadgeCheck,
  BarChart3,
  BookCopy,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Download,
  Droplets,
  FileBarChart,
  FileText,
  Filter,
  LibraryBig,
  PackageCheck,
  PhilippinePeso,
  Plus,
  Printer,
  RefreshCw,
  ScanBarcode,
  Search,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { adminKpis, attendance, books, fines, loans, printRequests, reports, reservations, researchPapers, supplies, users } from '../../data/mockData'
import { BookCover, Button, MoreButton, PageHeader, SectionCard, StatCard, StatusBadge, TableSearch, TableShell, cn } from '../../components/ui'

const kpiIcons = [BookCopy, BookOpen, LibraryBig, Clock3, Users, UserCheck, CalendarDays, PhilippinePeso]

export function AdminDashboard() {
  const bars = [44, 61, 69, 62, 82, 94]
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return (
    <>
      <PageHeader eyebrow="Library operations" title="Good morning, Judelyn" description="A live operational overview of the STI Ormoc library for August 15, 2026." action={<div className="flex gap-2"><Button variant="secondary"><RefreshCw size={15} /> Refresh</Button><Button><Download size={15} /> Export summary</Button></div>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{adminKpis.map((item, index) => <StatCard key={item.label} {...item} icon={kpiIcons[index]} />)}</div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <SectionCard className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Visitor analytics</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Weekly attendance</h2></div><span className="rounded-lg bg-[#003399]/5 px-2.5 py-1 text-xs font-bold text-[#003399]">+18.6%</span></div><div className="mt-8 flex h-52 items-end gap-3 sm:gap-5">{bars.map((bar, index) => <div key={labels[index]} className="flex h-full flex-1 flex-col justify-end gap-2"><div className="group relative flex flex-1 items-end rounded-t-lg bg-[#003399]/5"><div style={{ height: `${bar}%` }} className="w-full rounded-t-lg bg-gradient-to-t from-[#003399] to-[#003399] transition hover:from-[#003399] hover:to-[#003399]"><span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 text-[10px] font-bold text-[#003399]/65 group-hover:block">{Math.round(bar * 2.3)}</span></div></div><span className="text-center text-[10px] font-semibold text-[#003399]/45">{labels[index]}</span></div>)}</div></SectionCard>
        <SectionCard className="p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Collection demand</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Popular categories</h2></div><div className="mt-6 space-y-5">{[{ label: 'Programming', value: 84 }, { label: 'Database', value: 68 }, { label: 'Networking', value: 56 }, { label: 'UI/UX Design', value: 44 }].map((item) => <div key={item.label}><div className="mb-2 flex justify-between text-xs"><span className="font-semibold text-[#003399]">{item.label}</span><span className="text-[#003399]/45">{item.value} borrows</span></div><div className="h-2 overflow-hidden rounded-full bg-[#003399]/5"><div style={{ width: `${item.value}%` }} className="h-full rounded-full bg-[#003399]" /></div></div>)}</div></SectionCard>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <TableShell title="Recent circulation" subtitle="Latest borrow and return activity"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">User and resource</th><th className="px-5 py-3">Due time</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{loans.slice(0, 3).map((loan) => <tr key={loan.id}><td className="px-5 py-4"><p className="font-semibold text-[#003399]">{loan.book}</p><p className="mt-1 text-xs text-[#003399]/65">{loan.user} · {loan.id}</p></td><td className="px-5 py-4 text-xs text-[#003399]/65">{loan.due}</td><td className="px-5 py-4"><StatusBadge status={loan.status} /></td><td className="px-5 py-4"><MoreButton /></td></tr>)}</tbody></table></TableShell>
        <SectionCard className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Live conditions</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Library occupancy</h2></div><Activity className="text-[#003399]" size={20} /></div><div className="mt-6 flex items-end gap-2"><span className="font-display text-5xl font-bold tracking-tight text-[#003399]">42</span><span className="mb-1 text-sm text-[#003399]/45">of 80 seats</span></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-[#003399]/5"><div className="h-full w-[52%] rounded-full bg-gradient-to-r from-[#003399] to-[#003399]" /></div><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#003399]/5 p-3"><p className="text-[10px] font-bold uppercase text-[#003399]/45">Peak hour</p><p className="mt-1 font-bold text-[#003399]">10:00 AM</p></div><div className="rounded-xl bg-[#003399]/5 p-3"><p className="text-[10px] font-bold uppercase text-[#003399]/45">Avg. visit</p><p className="mt-1 font-bold text-[#003399]">1h 24m</p></div></div></SectionCard>
      </div>
    </>
  )
}

export function CatalogManagementPage() {
  const [query, setQuery] = useState('')
  const visible = books.filter((book) => `${book.title} ${book.author} ${book.isbn}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <>
      <PageHeader eyebrow="Catalog administration" title="Books and research management" description="Manage bibliographic records, physical copies, categories, shelf locations, and institutional research." action={<Button><Plus size={16} /> Add book</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Book titles" value="1,124" note="2,486 physical copies" icon={BookOpen} tone="emerald" /><StatCard label="Research papers" value="318" note="Across 6 departments" icon={FileText} tone="blue" /><StatCard label="Categories" value="26" note="4 updated this month" icon={Archive} tone="violet" /></div>
      <TableShell title="Book catalog" subtitle="Title-level records with real-time copy counts" controls={<div className="flex gap-2"><TableSearch value={query} onChange={setQuery} placeholder="Search catalog..." /><Button variant="secondary"><Filter size={15} /></Button></div>}>
        <table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Book</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">ISBN</th><th className="px-5 py-3">Shelf</th><th className="px-5 py-3">Copies</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{visible.map((book) => <tr key={book.id} className="hover:bg-[#003399]/50"><td className="px-5 py-3"><div className="flex items-center gap-3"><BookCover code={book.cover} accent={book.accent} className="w-10 shrink-0 rounded-lg p-2 shadow-none" /><div><p className="font-semibold text-[#003399]">{book.title}</p><p className="mt-0.5 text-xs text-[#003399]/65">{book.author} · {book.year}</p></div></div></td><td className="px-5 py-3 text-[#003399]/65">{book.category}</td><td className="px-5 py-3 font-mono text-xs text-[#003399]/65">{book.isbn}</td><td className="px-5 py-3 font-semibold text-[#003399]">{book.shelf}</td><td className="px-5 py-3 text-[#003399]/65">{book.available} / {book.total}</td><td className="px-5 py-3"><StatusBadge status={book.status} /></td><td className="px-5 py-3"><MoreButton /></td></tr>)}</tbody></table>
      </TableShell>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><TableShell title="Category directory" subtitle="Classification and collection size"><div className="divide-y divide-slate-100">{['Programming · 386 books', 'Database · 214 books', 'Networking · 176 books', 'UI/UX Design · 98 books'].map((item, index) => <div key={item} className="flex items-center justify-between px-5 py-3.5"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003399]/5 text-xs font-bold text-[#003399]">{String(index + 1).padStart(2, '0')}</span><p className="text-sm font-semibold text-[#003399]">{item}</p></div><MoreButton /></div>)}</div></TableShell><TableShell title="Research repository" subtitle="Latest institutional papers"><div className="divide-y divide-slate-100">{researchPapers.slice(0, 3).map((paper) => <div key={paper.id} className="px-5 py-3.5"><p className="line-clamp-1 text-sm font-semibold text-[#003399]">{paper.title}</p><p className="mt-1 text-xs text-[#003399]/65">{paper.department} · {paper.year}</p></div>)}</div></TableShell></div>
    </>
  )
}

export function CirculationPage() {
  return (
    <>
      <PageHeader eyebrow="Circulation desk" title="Borrow and return monitoring" description="Scan physical copies, approve requests, process returns, and monitor due and overdue transactions." action={<div className="flex gap-2"><Button variant="secondary"><ScanBarcode size={16} /> Scan return</Button><Button><Plus size={16} /> New borrow</Button></div>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-4"><StatCard label="Active borrows" value="184" icon={BookOpen} tone="blue" note="12 processed today" /><StatCard label="Due today" value="38" icon={Clock3} tone="orange" note="Before 8:59 AM" /><StatCard label="Overdue" value="24" icon={CalendarDays} tone="red" note="₱1,920 total fines" /><StatCard label="Returned today" value="31" icon={CheckCircle2} tone="emerald" note="Last at 9:14 AM" /></div>
      <TableShell title="Circulation transactions" subtitle="Active, returned, and overdue book copies" controls={<div className="flex gap-2"><TableSearch placeholder="Search user, book, or barcode..." /><Button variant="secondary"><Filter size={15} /></Button></div>}><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Transaction</th><th className="px-5 py-3">Borrower</th><th className="px-5 py-3">Book / copy</th><th className="px-5 py-3">Borrowed</th><th className="px-5 py-3">Due</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{loans.map((loan) => <tr key={loan.id}><td className="px-5 py-4 font-mono text-xs font-semibold text-[#003399]/65">{loan.id}</td><td className="px-5 py-4"><p className="font-semibold text-[#003399]">{loan.user}</p><p className="mt-0.5 text-xs text-[#003399]/65">{loan.studentId}</p></td><td className="px-5 py-4"><p className="font-semibold text-[#003399]">{loan.book}</p><p className="mt-0.5 text-xs text-[#003399]/65">{loan.copy}</p></td><td className="px-5 py-4 text-xs text-[#003399]/65">{loan.borrowed}</td><td className="px-5 py-4 text-xs text-[#003399]/65">{loan.due}</td><td className="px-5 py-4"><StatusBadge status={loan.status} /></td><td className="px-5 py-4"><MoreButton /></td></tr>)}</tbody></table></TableShell>
    </>
  )
}

export function AdminReservationsPage() {
  return (
    <>
      <PageHeader eyebrow="Circulation desk" title="Reservation management" description="Monitor title-level waiting lists, notify the next user, and track pickup windows." action={<Button variant="secondary"><RefreshCw size={16} /> Refresh queue</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Active queue" value="31" note="Across 18 titles" icon={CalendarDays} tone="violet" /><StatCard label="Ready for pickup" value="9" note="4 expire today" icon={PackageCheck} tone="emerald" /><StatCard label="Average wait" value="2.4 days" note="Down 0.6 days" icon={Clock3} tone="blue" /></div>
      <TableShell title="Reservation queue" subtitle="Oldest requests receive priority"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Request</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Book</th><th className="px-5 py-3">Queue</th><th className="px-5 py-3">Requested</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{reservations.map((item) => <tr key={item.id}><td className="px-5 py-4 font-mono text-xs text-[#003399]/65">{item.id}</td><td className="px-5 py-4 font-semibold text-[#003399]">{item.user}</td><td className="px-5 py-4 text-[#003399]">{item.book}</td><td className="px-5 py-4 font-bold text-[#003399]">#{item.queue}</td><td className="px-5 py-4 text-[#003399]/65">{item.requested}</td><td className="px-5 py-4"><StatusBadge status={item.status} /></td><td className="px-5 py-4"><MoreButton /></td></tr>)}</tbody></table></TableShell>
    </>
  )
}

export function FinesPage() {
  return (
    <>
      <PageHeader eyebrow="Financial records" title="Fines management" description="Review computed penalties, record counter payments, and preserve waiver and payment audit history." action={<Button><Download size={16} /> Export CSV</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-4"><StatCard label="Total fines" value="₱2,840" note="Current semester" icon={CircleDollarSign} tone="violet" /><StatCard label="Unpaid" value="₱1,920" note="24 accounts" icon={Clock3} tone="red" /><StatCard label="Paid" value="₱820" note="68 transactions" icon={CheckCircle2} tone="emerald" /><StatCard label="Waived" value="₱100" note="3 documented cases" icon={BadgeCheck} tone="blue" /></div>
      <TableShell title="Fine records" subtitle="Hourly and daily overdue penalties" controls={<TableSearch placeholder="Search user or fine ID..." />}><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Fine</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Book</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{fines.map((fine) => <tr key={fine.id}><td className="px-5 py-4 font-mono text-xs text-[#003399]/65">{fine.id}</td><td className="px-5 py-4"><p className="font-semibold text-[#003399]">{fine.user}</p><p className="mt-0.5 text-xs text-[#003399]/65">{fine.studentId}</p></td><td className="px-5 py-4 text-[#003399]">{fine.book}</td><td className="px-5 py-4 text-[#003399]/65">{fine.reason}</td><td className="px-5 py-4 font-bold text-[#003399]">{fine.amount}</td><td className="px-5 py-4"><StatusBadge status={fine.status} /></td><td className="px-5 py-4"><MoreButton /></td></tr>)}</tbody></table></TableShell>
    </>
  )
}

export function PrintingManagementPage() {
  return (
    <>
      <PageHeader eyebrow="Service operations" title="Printing service management" description="Manage the live print queue, job status, payments, page volume, and pickup readiness." action={<Button><Plus size={16} /> Walk-in request</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-4"><StatCard label="Pending jobs" value="8" note="3 received this hour" icon={Clock3} tone="orange" /><StatCard label="Now printing" value="2" note="Printer A and B" icon={Printer} tone="violet" /><StatCard label="Ready for pickup" value="6" note="₱284 to collect" icon={PackageCheck} tone="emerald" /><StatCard label="Today's revenue" value="₱1,248" note="312 printed pages" icon={TrendingUp} tone="blue" /></div>
      <TableShell title="Print queue" subtitle="Requests ordered by submission time" controls={<TableSearch placeholder="Search request or student..." />}><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Request</th><th className="px-5 py-3">User</th><th className="px-5 py-3">File</th><th className="px-5 py-3">Configuration</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{printRequests.map((item) => <tr key={item.id}><td className="px-5 py-4"><p className="font-mono text-xs font-semibold text-[#003399]/65">{item.id}</p><p className="mt-1 text-[11px] text-[#003399]/45">{item.created}</p></td><td className="px-5 py-4 font-semibold text-[#003399]">{item.user}</td><td className="px-5 py-4 text-[#003399]">{item.file}</td><td className="px-5 py-4 text-xs text-[#003399]/65">{item.pages} pages · {item.copies} copies<br />{item.type}</td><td className="px-5 py-4 font-bold text-[#003399]">{item.amount}</td><td className="px-5 py-4"><StatusBadge status={item.status} /></td><td className="px-5 py-4"><MoreButton /></td></tr>)}</tbody></table></TableShell>
    </>
  )
}

export function SuppliesPage() {
  return (
    <>
      <PageHeader eyebrow="Printing inventory" title="Consumables and supplies" description="Monitor ink levels, bond-paper stock, printer assignments, and replenishment thresholds." action={<Button><Plus size={16} /> Record restock</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{supplies.map((item) => { const low = (item.unit === '%' && item.level < 25) || (item.unit === 'reams' && item.level <= 3); return <SectionCard key={item.id} className="p-5"><div className="flex items-start justify-between"><span className={cn('rounded-xl p-2.5', item.type === 'Ink' ? 'bg-[#003399]/5 text-[#003399]' : 'bg-[#003399]/5 text-[#003399]')}>{item.type === 'Ink' ? <Droplets size={19} /> : <FileText size={19} />}</span>{low ? <StatusBadge status="overdue" /> : <StatusBadge status="available" />}</div><p className="mt-4 font-display font-bold text-[#003399]">{item.name}</p><p className="mt-1 text-xs text-[#003399]/65">{item.printer}</p><div className="mt-5 flex items-end justify-between"><div><p className="text-2xl font-bold text-[#003399]">{item.level}<span className="ml-1 text-xs font-medium text-[#003399]/45">{item.unit}</span></p></div><p className="text-[10px] font-bold uppercase text-[#003399]/45">{item.id}</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#003399]/5"><div style={{ width: item.unit === '%' ? `${item.level}%` : `${Math.min(item.level * 10, 100)}%` }} className={cn('h-full rounded-full', low ? 'bg-[#003399]/50' : 'bg-[#003399]')} /></div></SectionCard> })}</div>
      <SectionCard className="mt-5 p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-[#003399]/5 p-2.5 text-[#003399]"><Activity size={19} /></div><div><h3 className="font-display font-bold text-[#003399]">2 supplies need attention</h3><p className="mt-1 text-sm text-[#003399]/65">Cyan ink and short bond paper have reached their configured reorder thresholds.</p></div><Button className="ml-auto" variant="secondary">View movement log</Button></div></SectionCard>
    </>
  )
}

export function AdminAttendancePage() {
  return (
    <>
      <PageHeader eyebrow="Facility monitoring" title="Attendance monitoring" description="Review QR time-in logs, current occupancy, visit purposes, and peak library usage periods." action={<Button><Download size={16} /> Export report</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-4"><StatCard label="Visitors today" value="216" icon={Users} tone="emerald" note="+18.6% vs. Friday" /><StatCard label="Currently inside" value="42" icon={UserCheck} tone="blue" note="52% of capacity" /><StatCard label="Peak hour" value="10:00 AM" icon={Clock3} tone="orange" note="68 concurrent visitors" /><StatCard label="Average visit" value="1h 24m" icon={Activity} tone="violet" note="12 min longer this week" /></div>
      <TableShell title="Today's attendance logs" subtitle="QR-based library entry and exit records" controls={<TableSearch placeholder="Search student or ID..." />}><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Visitor</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Time in</th><th className="px-5 py-3">Time out</th><th className="px-5 py-3">Purpose</th><th className="px-5 py-3">Presence</th></tr></thead><tbody className="divide-y divide-slate-100">{attendance.slice(0, 3).map((item) => <tr key={item.id}><td className="px-5 py-4"><p className="font-semibold text-[#003399]">{item.user}</p><p className="mt-0.5 text-xs text-[#003399]/65">{item.studentId}</p></td><td className="px-5 py-4 text-[#003399]/65">{item.date}</td><td className="px-5 py-4 text-[#003399]/65">{item.checkIn}</td><td className="px-5 py-4 text-[#003399]/65">{item.checkOut}</td><td className="px-5 py-4 text-[#003399]/65">{item.purpose}</td><td className="px-5 py-4"><StatusBadge status={item.checkOut === '-' ? 'active' : 'returned'} /></td></tr>)}</tbody></table></TableShell>
    </>
  )
}

export function UsersPage() {
  return (
    <>
      <PageHeader eyebrow="Access management" title="Library users" description="Manage student, faculty, librarian, and administrator accounts and their access state." action={<Button><Plus size={16} /> Add user</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Active accounts" value="1,348" icon={UserCheck} tone="emerald" note="96% of all users" /><StatCard label="Student accounts" value="1,226" icon={Users} tone="blue" note="Across 14 programs" /><StatCard label="Faculty and staff" value="122" icon={BadgeCheck} tone="violet" note="All departments" /></div>
      <TableShell title="User directory" subtitle="Role, account status, and clearance standing" controls={<TableSearch placeholder="Search name, ID, or email..." />}><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">User</th><th className="px-5 py-3">ID</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Program / unit</th><th className="px-5 py-3">Account</th><th className="px-5 py-3">Clearance</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{users.map((user) => <tr key={user.id}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003399]/10 text-xs font-bold text-[#003399]">{user.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}</span><div><p className="font-semibold text-[#003399]">{user.name}</p><p className="mt-0.5 text-xs text-[#003399]/65">{user.email}</p></div></div></td><td className="px-5 py-4 font-mono text-xs text-[#003399]/65">{user.id}</td><td className="px-5 py-4 text-[#003399]/65">{user.role}</td><td className="px-5 py-4 text-[#003399]/65">{user.program}</td><td className="px-5 py-4"><StatusBadge status={user.status} /></td><td className="px-5 py-4"><StatusBadge status={user.clearance} /></td><td className="px-5 py-4"><MoreButton /></td></tr>)}</tbody></table></TableShell>
    </>
  )
}

export function AdminClearancePage() {
  return (
    <>
      <PageHeader eyebrow="Student standing" title="Clearance management" description="Review computed clearance, inspect blocking transactions, and record authorized overrides." action={<Button><Download size={16} /> Export bulk status</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Cleared students" value="1,102" icon={BadgeCheck} tone="emerald" note="89.9% of students" /><StatCard label="Pending clearance" value="124" icon={Clock3} tone="orange" note="84 unreturned items" /><StatCard label="Manual overrides" value="8" icon={ClipboardCheck} tone="violet" note="All include reasons" /></div>
      <TableShell title="Clearance master list" subtitle="Computed from active loans and outstanding fines" controls={<TableSearch placeholder="Search student or ID..." />}><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Program</th><th className="px-5 py-3">Active items</th><th className="px-5 py-3">Fine balance</th><th className="px-5 py-3">Standing</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{users.filter((user) => user.role === 'Student').map((user, index) => <tr key={user.id}><td className="px-5 py-4"><p className="font-semibold text-[#003399]">{user.name}</p><p className="mt-0.5 text-xs text-[#003399]/65">{user.id}</p></td><td className="px-5 py-4 text-[#003399]/65">{user.program}</td><td className="px-5 py-4 font-semibold text-[#003399]">{index === 1 ? 1 : 0}</td><td className="px-5 py-4 font-semibold text-[#003399]">{index === 1 ? '₱24.00' : '₱0.00'}</td><td className="px-5 py-4"><StatusBadge status={user.clearance} /></td><td className="px-5 py-4 text-[#003399]/65">{index === 1 ? 'Overdue book and unpaid fine' : 'No obligations'}</td><td className="px-5 py-4"><MoreButton /></td></tr>)}</tbody></table></TableShell>
    </>
  )
}

export function ReportsPage() {
  return (
    <>
      <PageHeader eyebrow="Data and insights" title="Reports center" description="Generate exportable operational summaries for audits, planning, accounting, and campus submission." action={<Button><Plus size={16} /> Custom report</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{reports.map((report, index) => { const icons = [Users, BookOpen, ClipboardCheck, Printer, CircleDollarSign]; const Icon = icons[index]; return <SectionCard key={report.id} className="group p-5 transition hover:-translate-y-0.5 hover:border-[#003399]/15 hover:shadow-lg hover:shadow-[#003399]/5"><div className="flex items-start justify-between"><span className="rounded-xl bg-[#003399]/5 p-2.5 text-[#003399]"><Icon size={20} /></span><span className="text-[10px] font-bold uppercase tracking-wider text-[#003399]/45">{report.category}</span></div><h2 className="mt-5 font-display text-lg font-bold text-[#003399]">{report.name}</h2><p className="mt-2 min-h-10 text-xs leading-5 text-[#003399]/65">{report.description}</p><div className="mt-5 flex items-end justify-between border-t border-[#003399]/15 pt-4"><div><p className="text-[10px] font-bold uppercase text-[#003399]/45">Last generated</p><p className="mt-1 text-xs font-semibold text-[#003399]/65">{report.updated}</p></div><Button variant="secondary"><Download size={14} /> Generate</Button></div></SectionCard> })}</div>
      <SectionCard className="mt-5 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="rounded-xl bg-[#003399]/5 p-3 text-[#003399]"><BarChart3 size={22} /></div><div className="flex-1"><h3 className="font-display font-bold text-[#003399]">Analytics data is mock-only</h3><p className="mt-1 text-sm text-[#003399]/65">Report buttons are interface templates. Database aggregation and file exports will be implemented after Prisma integration.</p></div><Button variant="secondary"><FileBarChart size={16} /> View report specification</Button></div></SectionCard>
    </>
  )
}
