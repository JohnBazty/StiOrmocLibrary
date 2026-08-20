import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  LibraryBig,
  MapPin,
  PhilippinePeso,
  Printer,
  QrCode,
  Search,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { attendance, books, loans, notifications, printRequests, researchPapers, reservations } from '../../data/mockData'
import { BookCover, Button, CardLink, PageHeader, SectionCard, StatCard, StatusBadge, TableSearch, TableShell } from '../../components/ui'

export function StudentDashboard() {
  const quickActions = [
    { label: 'Browse catalog', detail: 'Find books and check live availability', icon: Search, to: '/student/catalog', tone: 'bg-[#003399]/5 text-[#003399]' },
    { label: 'Request a print', detail: 'Upload a document for library pickup', icon: Printer, to: '/student/printing', tone: 'bg-[#003399]/5 text-[#003399]' },
    { label: 'Scan attendance', detail: 'Record your library visit with QR', icon: QrCode, to: '/student/attendance', tone: 'bg-[#003399]/5 text-[#003399]' },
  ]

  return (
    <>
      <PageHeader eyebrow="Student workspace" title="Good morning, John!" description="Here is what is happening with your library account today." />

      <section className="relative mb-5 overflow-hidden rounded-3xl bg-[#003399] p-6 text-white shadow-xl shadow-[#003399]/10 sm:p-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border-[42px] border-[#003399]/20" />
        <div className="absolute bottom-0 right-28 h-24 w-24 translate-y-1/2 rounded-full bg-[#FFF200]/15 blur-sm" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/10"><Sparkles size={14} className="text-[#FFF200]" /> Your library, made smarter</div>
            <h2 className="font-display max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">One place for books, research, printing, and every library visit.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/80">Search the collection before you arrive, track your transactions, and keep your clearance on schedule.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/student/catalog"><Button className="bg-[#FFF200] text-[#003399] hover:bg-[#FFF200]">Explore catalog <ArrowRight size={16} /></Button></Link>
              <Link to="/student/research"><Button variant="ghost" className="bg-white/10 text-white hover:bg-white/15 hover:text-white">Browse research</Button></Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:w-72">
            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><p className="text-xs text-white/70">Library occupancy</p><p className="mt-1 text-2xl font-bold">42<span className="text-sm font-medium text-white/60"> / 80</span></p><div className="mt-3 h-1.5 rounded-full bg-white/10"><div className="h-full w-[52%] rounded-full bg-[#FFF200]" /></div></div>
            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><p className="text-xs text-white/70">Clearance status</p><div className="mt-2 flex items-center gap-2 text-lg font-bold"><CheckCircle2 size={20} className="text-[#FFF200]" /> Cleared</div><p className="mt-3 text-xs text-white/60">No outstanding balance</p></div>
          </div>
        </div>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active loans" value="1" note="1 slot remaining" icon={BookOpen} tone="blue" />
        <StatCard label="Reservations" value="1" note="Number 2 in queue" icon={BookMarked} tone="violet" />
        <StatCard label="Unread updates" value="2" note="1 print update" icon={Bell} tone="orange" />
        <StatCard label="Outstanding fines" value="₱0.00" note="Account in good standing" icon={PhilippinePeso} tone="emerald" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
        <SectionCard className="p-5">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Current loan</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Return reminder</h2></div><StatusBadge status="active" /></div>
          <div className="flex gap-4 rounded-2xl bg-[#003399]/5 p-4">
            <BookCover code="CC" accent="from-[#003399] to-[#003399]" className="w-20 shrink-0" />
            <div className="min-w-0 flex-1"><h3 className="font-display font-bold text-[#003399]">Clean Code</h3><p className="mt-0.5 text-sm text-[#003399]/65">Robert C. Martin</p><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><div className="flex items-center gap-2 text-[#003399]/65"><CalendarClock size={15} className="text-[#003399]" /> Due Aug 15, 8:59 AM</div><div className="flex items-center gap-2 text-[#003399]/65"><MapPin size={15} className="text-[#003399]" /> Copy BC-00128</div></div></div>
          </div>
        </SectionCard>

        <SectionCard className="p-5">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Print service</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Ready for pickup</h2></div><Printer className="text-[#003399]" size={21} /></div>
          <div className="rounded-2xl border border-[#003399]/15 bg-[#003399]/5 p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold text-[#003399]">Capstone-Chapter-1.pdf</p><p className="mt-1 text-xs text-[#003399]/65">18 pages · Black & white</p></div><StatusBadge status="ready for pickup" /></div><div className="mt-4 flex items-end justify-between"><div><p className="text-xs text-[#003399]/65">Amount due</p><p className="text-lg font-bold text-[#003399]">₱36.00</p></div><Link to="/student/printing"><CardLink>View request</CardLink></Link></div></div>
        </SectionCard>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <SectionCard className="p-5"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Quick actions</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">What would you like to do?</h2></div><div className="space-y-2">{quickActions.map(({ label, detail, icon: Icon, to, tone }) => <Link key={label} to={to} className="group flex items-center gap-3 rounded-2xl p-3 transition hover:bg-[#003399]/5"><span className={`rounded-xl p-2.5 ${tone}`}><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#003399]">{label}</span><span className="block truncate text-xs text-[#003399]/65">{detail}</span></span><ArrowRight size={16} className="text-[#003399]/45 transition group-hover:translate-x-0.5 group-hover:text-[#003399]" /></Link>)}</div></SectionCard>
        <SectionCard className="p-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Recommended for BSIT</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Continue discovering</h2></div><Link to="/student/catalog"><CardLink>View all</CardLink></Link></div><div className="grid grid-cols-3 gap-3">{books.slice(1, 4).map((book) => <div key={book.id} className="min-w-0"><BookCover code={book.cover} accent={book.accent} className="w-full" /><p className="mt-2 line-clamp-2 text-xs font-bold text-[#003399]">{book.title}</p><p className="mt-0.5 truncate text-[11px] text-[#003399]/45">{book.author}</p></div>)}</div></SectionCard>
      </div>
    </>
  )
}

export function CatalogPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = ['All', 'Programming', 'Database', 'Networking', 'UI/UX Design']
  const visibleBooks = useMemo(() => books.filter((book) => (category === 'All' || book.category === category) && `${book.title} ${book.author} ${book.isbn}`.toLowerCase().includes(query.toLowerCase())), [query, category])

  return (
    <>
      <PageHeader eyebrow="Digital catalog" title="Find your next resource" description="Search books by title, author, ISBN, category, or shelf location and see their current availability." />
      <SectionCard className="mb-5 p-4 sm:p-5"><div className="flex flex-col gap-3 lg:flex-row"><TableSearch value={query} onChange={setQuery} placeholder="Search title, author, or ISBN..." /><div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${category === item ? 'bg-[#003399] text-white' : 'bg-[#003399]/5 text-[#003399]/65 hover:bg-[#003399]/10'}`}>{item}</button>)}</div></div></SectionCard>
      <div className="mb-4 flex items-center justify-between"><p className="text-sm font-semibold text-[#003399]">{visibleBooks.length} resources found</p><button className="text-xs font-semibold text-[#003399]/65">Sort: Relevance</button></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleBooks.map((book) => <SectionCard key={book.id} className="group p-4 transition hover:-translate-y-0.5 hover:border-[#003399]/15 hover:shadow-lg hover:shadow-[#003399]/5"><div className="flex gap-4"><BookCover code={book.cover} accent={book.accent} className="w-24 shrink-0" /><div className="min-w-0 flex-1"><div className="mb-2 flex items-start justify-between gap-2"><StatusBadge status={book.status} /><span className="text-[10px] font-bold text-[#003399]/45">{book.year}</span></div><h2 className="line-clamp-2 font-display font-bold leading-snug text-[#003399]">{book.title}</h2><p className="mt-1 truncate text-xs text-[#003399]/65">{book.author}</p><div className="mt-3 space-y-1 text-[11px] text-[#003399]/65"><p><span className="font-semibold text-[#003399]">Shelf:</span> {book.shelf}</p><p><span className="font-semibold text-[#003399]">Copies:</span> {book.available} of {book.total} available</p></div></div></div><div className="mt-4 flex gap-2"><Button variant="secondary" className="flex-1">View details</Button><Button className="flex-1" variant={book.available ? 'primary' : 'secondary'}>{book.available ? 'Borrow' : 'Reserve'}</Button></div></SectionCard>)}</div>
    </>
  )
}

export function ResearchPage() {
  const [query, setQuery] = useState('')
  const rows = researchPapers.filter((paper) => `${paper.title} ${paper.authors} ${paper.department}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <>
      <PageHeader eyebrow="Research repository" title="Research and thesis catalog" description="Discover institutional studies by department, author, title, or graduation year." action={<Button><FileText size={16} /> APA reference guide</Button>} />
      <TableShell title="Institutional research" subtitle="Archived research and capstone manuscripts" controls={<TableSearch value={query} onChange={setQuery} placeholder="Search research..." />}>
        <table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Research title</th><th className="px-5 py-3">Department</th><th className="px-5 py-3">Year</th><th className="px-5 py-3">Shelf</th><th className="px-5 py-3">Access</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((paper) => <tr key={paper.id} className="hover:bg-[#003399]/60"><td className="px-5 py-4"><p className="max-w-sm font-semibold text-[#003399]">{paper.title}</p><p className="mt-1 text-xs text-[#003399]/65">{paper.authors}</p></td><td className="px-5 py-4 text-[#003399]/65">{paper.department}</td><td className="px-5 py-4 text-[#003399]/65">{paper.year}</td><td className="px-5 py-4 font-mono text-xs text-[#003399]/65">{paper.shelf}</td><td className="px-5 py-4"><StatusBadge status={paper.availability === 'Available' ? 'available' : 'reserved'} /></td><td className="px-5 py-4"><Button variant="ghost">View</Button></td></tr>)}</tbody></table>
      </TableShell>
    </>
  )
}

export function BorrowingPage() {
  return (
    <>
      <PageHeader eyebrow="My library" title="Borrowing and return history" description="Track active items, due times, returned books, and any penalties connected to your account." />
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Currently borrowed" value="1 / 2" note="Student borrowing limit" icon={BookOpen} tone="blue" /><StatCard label="Next return" value="8:59 AM" note="August 15, 2026" icon={Clock3} tone="orange" /><StatCard label="Unpaid fines" value="₱0.00" note="No outstanding charges" icon={PhilippinePeso} tone="emerald" /></div>
      <TableShell title="Transaction history" subtitle="Your recent borrowing activity">
        <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Book</th><th className="px-5 py-3">Transaction</th><th className="px-5 py-3">Borrowed</th><th className="px-5 py-3">Due / returned</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{loans.filter((loan) => loan.user.includes('John') || loan.status === 'returned').slice(0, 2).map((loan) => <tr key={loan.id}><td className="px-5 py-4"><p className="font-semibold text-[#003399]">{loan.book}</p><p className="mt-1 text-xs text-[#003399]/65">Copy {loan.copy}</p></td><td className="px-5 py-4 font-mono text-xs text-[#003399]/65">{loan.id}</td><td className="px-5 py-4 text-[#003399]/65">{loan.borrowed}</td><td className="px-5 py-4 text-[#003399]/65">{loan.due}</td><td className="px-5 py-4"><StatusBadge status={loan.status} /></td></tr>)}</tbody></table>
      </TableShell>
    </>
  )
}

export function StudentReservationsPage() {
  return (
    <>
      <PageHeader eyebrow="My library" title="Book reservations" description="Follow your place in the waiting list and collect available resources before the reservation expires." action={<Link to="/student/catalog"><Button><Search size={16} /> Find a book</Button></Link>} />
      <div className="grid gap-4 lg:grid-cols-2">{reservations.slice(0, 2).map((reservation) => <SectionCard key={reservation.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#003399]/5 text-[#003399]"><BookMarked size={20} /></div><StatusBadge status={reservation.status} /></div><h2 className="mt-4 font-display text-lg font-bold text-[#003399]">{reservation.book}</h2><p className="mt-1 text-xs text-[#003399]/65">Request {reservation.id} · {reservation.requested}</p><div className="mt-5 flex items-center justify-between rounded-xl bg-[#003399]/5 p-3"><div><p className="text-[11px] font-semibold uppercase text-[#003399]/45">Queue position</p><p className="mt-0.5 text-lg font-bold text-[#003399]">#{reservation.queue}</p></div><Button variant="secondary">Cancel request</Button></div></SectionCard>)}</div>
    </>
  )
}

export function PrintingPage() {
  const [submitted, setSubmitted] = useState(false)
  const submit = (event: FormEvent) => { event.preventDefault(); setSubmitted(true) }
  return (
    <>
      <PageHeader eyebrow="Online service" title="Printing service request" description="Prepare your print job online, receive status updates, and pay when you collect it at the library." />
      {submitted ? <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#003399]/15 bg-[#003399]/5 p-4 text-sm text-[#003399]"><CheckCircle2 className="mt-0.5 shrink-0" size={18} /><div><p className="font-bold">Mock request submitted</p><p className="mt-0.5 text-[#003399]">The template has added your request to the pending queue. No file was uploaded or saved.</p></div></div> : null}
      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <SectionCard className="p-5"><div className="mb-5"><h2 className="font-display text-lg font-bold text-[#003399]">New print request</h2><p className="mt-1 text-xs text-[#003399]/65">Prototype fields are prefilled and do not require validation.</p></div><form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#003399]/65">Document</span><div className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#003399]/15 bg-[#003399]/5 text-center"><Upload size={22} className="text-[#003399]" /><p className="mt-2 text-sm font-semibold text-[#003399]">Choose a file or drop it here</p><p className="mt-1 text-[11px] text-[#003399]/45">PDF or DOCX · Mock only</p></div></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-[#003399]/65">Print type<select defaultValue="Black & white" className="mt-1.5 h-10 w-full rounded-xl border border-[#003399]/15 bg-white px-3 text-sm font-normal outline-none focus:border-[#003399]/15"><option>Black & white</option><option>Color</option></select></label><label className="text-xs font-bold text-[#003399]/65">Copies<input defaultValue="1" type="number" className="mt-1.5 h-10 w-full rounded-xl border border-[#003399]/15 px-3 text-sm font-normal outline-none focus:border-[#003399]/15" /></label></div><label className="block text-xs font-bold text-[#003399]/65">Pickup schedule<input defaultValue="2026-08-15T14:00" type="datetime-local" className="mt-1.5 h-10 w-full rounded-xl border border-[#003399]/15 px-3 text-sm font-normal outline-none focus:border-[#003399]/15" /></label><label className="block text-xs font-bold text-[#003399]/65">Notes<textarea defaultValue="Please staple the upper-left corner." className="mt-1.5 min-h-20 w-full rounded-xl border border-[#003399]/15 p-3 text-sm font-normal outline-none focus:border-[#003399]/15" /></label><Button type="submit" className="w-full"><Printer size={16} /> Submit mock request</Button></form></SectionCard>
        <TableShell title="My print history" subtitle="Current and previous print requests">
          <div className="divide-y divide-slate-100">{printRequests.filter((request) => request.user.includes('John')).map((request) => <div key={request.id} className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#003399]/5 text-[#003399]"><FileText size={20} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[#003399]">{request.file}</p><StatusBadge status={request.status} /></div><p className="mt-1 text-xs text-[#003399]/65">{request.id} · {request.pages} pages · {request.type}</p></div><div className="sm:text-right"><p className="font-bold text-[#003399]">{request.amount}</p><p className="mt-1 text-[11px] text-[#003399]/45">Pay at library</p></div></div><div className="mt-4 grid grid-cols-4 gap-1"><div className="h-1.5 rounded-full bg-[#003399]" /><div className="h-1.5 rounded-full bg-[#003399]" /><div className="h-1.5 rounded-full bg-[#003399]" /><div className="h-1.5 rounded-full bg-[#003399]/10" /></div><div className="mt-2 flex justify-between text-[10px] text-[#003399]/45"><span>Pending</span><span>Printing</span><span>Ready</span><span>Completed</span></div></div>)}</div>
        </TableShell>
      </div>
    </>
  )
}

const qrPattern = Array.from({ length: 121 }, (_, index) => [0, 1, 2, 11, 13, 22, 24, 4, 5, 6, 9, 10, 15, 17, 19, 20, 26, 27, 29, 30, 34, 36, 37, 39, 41, 43, 45, 47, 50, 51, 54, 56, 58, 60, 61, 64, 67, 69, 72, 74, 76, 78, 82, 84, 86, 88, 91, 93, 95, 96, 99, 100, 104, 106, 108, 110, 112, 114, 116, 117, 118, 120].includes(index))

export function StudentAttendancePage() {
  return (
    <>
      <PageHeader eyebrow="QR attendance" title="Library visit pass" description="Present this rotating demo code at the entrance kiosk to record your visit." />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <SectionCard className="overflow-hidden"><div className="bg-[#003399] p-5 text-white"><div className="flex items-center gap-3"><div className="rounded-xl bg-white/10 p-2"><QrCode size={21} /></div><div><p className="font-display font-bold">STI Library Pass</p><p className="text-xs text-white/60">Demo QR attendance</p></div></div></div><div className="p-6 text-center"><div className="mx-auto grid aspect-square w-48 grid-cols-11 gap-[2px] rounded-xl border-8 border-white bg-white p-2 shadow-lg ring-1 ring-[#003399]/15">{qrPattern.map((filled, index) => <span key={index} className={filled ? 'bg-[#003399]' : 'bg-white'} />)}</div><p className="mt-5 font-display text-lg font-bold text-[#003399]">John Bazty Cantay</p><p className="mt-1 text-xs text-[#003399]/65">02000241372 · BSIT-3A</p><div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#003399]/5 px-3 py-1.5 text-xs font-bold text-[#003399]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#003399]/50" /> Valid for this demo session</div></div></SectionCard>
        <div><div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Visits this month" value="12" note="18.4 hours total" icon={LibraryBig} tone="emerald" /><StatCard label="Today's check-in" value="8:12 AM" note="Currently in library" icon={Clock3} tone="blue" /><StatCard label="Most common purpose" value="Research" note="6 of 12 visits" icon={BookOpen} tone="violet" /></div><TableShell title="Attendance history" subtitle="Your recorded library visits"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Time in</th><th className="px-5 py-3">Time out</th><th className="px-5 py-3">Purpose</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{attendance.filter((item) => item.user.includes('John')).map((item) => <tr key={item.id}><td className="px-5 py-4 font-semibold text-[#003399]">{item.date}</td><td className="px-5 py-4 text-[#003399]/65">{item.checkIn}</td><td className="px-5 py-4 text-[#003399]/65">{item.checkOut}</td><td className="px-5 py-4 text-[#003399]/65">{item.purpose}</td><td className="px-5 py-4"><StatusBadge status={item.checkOut === '-' ? 'active' : 'returned'} /></td></tr>)}</tbody></table></TableShell></div>
      </div>
    </>
  )
}

export function NotificationsPage() {
  return (
    <>
      <PageHeader eyebrow="Activity center" title="Notifications" description="Due-date reminders, reservation alerts, printing updates, and library announcements." action={<Button variant="secondary"><CheckCircle2 size={16} /> Mark all as read</Button>} />
      <SectionCard className="overflow-hidden"><div className="divide-y divide-slate-100">{notifications.map((item) => <div key={item.id} className={`flex gap-4 p-5 ${item.read ? '' : 'bg-[#003399]/30'}`}><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.read ? 'bg-[#003399]/5 text-[#003399]/65' : 'bg-[#003399]/10 text-[#003399]'}`}><Bell size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[#003399]">{item.title}</p>{!item.read ? <span className="h-2 w-2 rounded-full bg-[#003399]/50" /> : null}</div><p className="mt-1 text-sm text-[#003399]/65">{item.message}</p><p className="mt-2 text-[11px] font-medium text-[#003399]/45">{item.type} · {item.time}</p></div></div>)}</div></SectionCard>
    </>
  )
}

export function ClearancePage() {
  return (
    <>
      <PageHeader eyebrow="Account standing" title="Library clearance" description="Your status is computed from active loans, unreturned resources, and outstanding fines." />
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#003399] to-[#003399] p-7 text-white shadow-xl shadow-[#003399]/10"><div className="absolute right-8 top-1/2 hidden h-36 w-36 -translate-y-1/2 items-center justify-center rounded-full border-[20px] border-white/5 lg:flex"><BadgeCheck size={56} className="text-[#FFF200]" /></div><div className="relative z-10 max-w-xl"><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold ring-1 ring-white/10"><CheckCircle2 size={15} className="text-[#FFF200]" /> CLEARED</div><h2 className="mt-5 font-display text-3xl font-bold">You have no library obligations.</h2><p className="mt-3 text-sm leading-6 text-white/75">This status was checked on August 15, 2026 at 9:32 AM. The registrar-facing export will use the same computed standing.</p></div></section>
      <div className="mt-5 grid gap-4 sm:grid-cols-3"><StatCard label="Active loans" value="0" note="All items accounted for" icon={BookOpen} tone="emerald" /><StatCard label="Unpaid fines" value="₱0.00" note="No financial hold" icon={PhilippinePeso} tone="emerald" /><StatCard label="Clearance blocks" value="0" note="No manual override" icon={BadgeCheck} tone="emerald" /></div>
      <SectionCard className="mt-5 p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-[#003399]/5 p-2.5 text-[#003399]"><Users size={19} /></div><div><h3 className="font-display font-bold text-[#003399]">How clearance is determined</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-[#003399]/65">The system checks whether you have unreturned books or unpaid library fines. Authorized staff can apply a documented exception, but every override remains visible in the audit history.</p></div></div></SectionCard>
    </>
  )
}
