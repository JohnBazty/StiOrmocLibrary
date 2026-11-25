import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  GraduationCap,
  MapPin,
  Megaphone,
  PhilippinePeso,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshButton } from '../../components/RefreshButton'
import { Button, CardLink, NoticeBanner, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { DashboardQrPass } from '../attendance/DashboardQrPass'
import { useAttendanceRefresh } from '../attendance/attendance-updates'
import type { AuthRole } from '../auth/auth-storage'
import { BookCoverThumbnail } from '../catalog/BookCoverThumbnail'
import { BookOverview } from '../catalog/BookOverview'
import { FlyToCartOverlay, triggerFlyToCart } from '../catalog/FlyToCartAnimation'
import { validateBookCartAddition } from '../catalog/book-cart'
import { useBookCart } from '../catalog/book-cart-store'
import { fetchBookOverview } from '../catalog/book-catalog-api'
import type { BookCatalogItem } from '../catalog/book-catalog-types'
import { formatManilaTime12, formatPhDate } from '../notifications/LibrarySchedulePage'
import { usePaymentUpdates } from '../payments/payment-updates'
import { dashboardApi } from './dashboard-api'
import type { UserDashboardData } from './types'

const peso = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
const first = (name: string) => name.trim().split(/\s+/)[0] || 'Library user'
const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function OccupancyGauge({ current, capacity }: { current: number; capacity: number }) {
  const safeCapacity = Math.max(1, capacity)
  const percent = Math.min(100, Math.max(0, Math.round((current / safeCapacity) * 100)))
  const radius = 44
  const circumference = Math.PI * radius
  const strokeDashoffset = circumference - (percent / 100) * circumference
  // Strict traffic-light status colors: Green (available), Yellow/Amber (moderate), Red (very busy)
  const strokeColor = percent >= 85 ? '#dc2626' : percent >= 60 ? '#eab308' : '#16a34a'
  const pillTextColor = percent >= 85 ? '#b42318' : percent >= 60 ? '#92400e' : '#166534'
  const pillBgColor =
    percent >= 85 ? 'rgba(220,38,38,0.12)' : percent >= 60 ? 'rgba(234,179,8,0.18)' : 'rgba(22,163,74,0.12)'
  const statusLabel = percent >= 85 ? 'Very busy' : percent >= 60 ? 'Moderate' : 'Seats available'

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-16 w-28 shrink-0">
        <svg viewBox="0 0 110 62" className="h-full w-full overflow-visible" aria-hidden="true">
          <path
            d="M 11 55 A 44 44 0 0 1 99 55"
            fill="none"
            stroke="var(--sl-border)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 11 55 A 44 44 0 0 1 99 55"
            fill="none"
            stroke={strokeColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <span className="font-display text-lg font-bold tabular-nums text-[var(--sl-text-header)]">
            {percent}%
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--sl-text-muted)]">Library occupancy</p>
        <p className="mt-0.5 font-display text-xl font-bold tabular-nums text-[var(--sl-text-header)]">
          {current}
          <span className="text-sm font-medium text-[var(--sl-text-muted)]"> / {capacity}</span>
        </p>
        <span
          className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{
            backgroundColor: pillBgColor,
            color: pillTextColor,
          }}
        >
          <Users size={11} />
          {statusLabel}
        </span>
      </div>
    </div>
  )
}

export function UserDashboardPage() {
  const [data, setData] = useState<UserDashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedTitleId, setSelectedTitleId] = useState<number | null>(null)
  const [borrowingTitleId, setBorrowingTitleId] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const { items: cart, addItem } = useBookCart()
  const cartIds = useMemo(() => new Set(cart.map((item) => item.titleId)), [cart])
  const fetching = useRef(false)

  const load = useCallback(async () => {
    if (fetching.current) return
    fetching.current = true
    setError('')
    try {
      setData(await dashboardApi.user())
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The dashboard could not be loaded.')
    } finally {
      setLoading(false)
      fetching.current = false
    }
  }, [])

  useAttendanceRefresh(load)
  useEffect(() => {
    void load()
  }, [load])
  usePaymentUpdates(load, 5000)

  if (!data && loading) {
    return (
      <div className="space-y-4">
        <div className="h-14 w-80 animate-pulse rounded-[10px] bg-[var(--sl-bg-subtle)]" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-[10px] bg-[var(--sl-bg-subtle)]" />
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="h-80 animate-pulse rounded-[12px] bg-[var(--sl-bg-subtle)]" />
          <div className="h-80 animate-pulse rounded-[12px] bg-[var(--sl-bg-subtle)]" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <SectionCard className="p-8 text-center">
        <p className="font-display text-xl font-semibold text-[var(--sl-text-header)]">
          Dashboard unavailable
        </p>
        <NoticeBanner tone="error" className="mt-4 text-left">
          {error}
        </NoticeBanner>
        <Button className="mt-5" onClick={() => void load()}>
          <RotateCcw size={16} />
          Try again
        </Button>
      </SectionCard>
    )
  }

  const isFaculty = data.user.role === 'Faculty'
  const prefix = isFaculty ? '/faculty' : '/student'
  const limitNote =
    data.summary.borrowingLimit === null
      ? 'No fixed borrowing limit'
      : `${Math.max(0, data.summary.borrowingLimit - data.summary.activeLoans)} slot${
          Math.max(0, data.summary.borrowingLimit - data.summary.activeLoans) === 1 ? '' : 's'
        } remaining`
  const clearanceOverride =
    data.summary.clearanceStatus === 'Cleared' && data.summary.clearanceComputedStatus === 'Not Cleared'
  const clearanceDeadline = data.clearanceSchedule?.deadlineAt
  const clearanceOverdue = Boolean(
    !clearanceOverride &&
      data.summary.clearanceStatus !== 'Cleared' &&
      clearanceDeadline &&
      Date.now() > new Date(clearanceDeadline).getTime(),
  )
  const cleared = data.summary.clearanceStatus === 'Cleared'
  const today = manilaDay()
  const todaySchedule = data.profile.schedule.find((item) => item.day === today)
  const hasUnpaidFines = data.summary.outstandingFines > 0
  const atBorrowLimit =
    data.summary.borrowingLimit !== null &&
    data.summary.activeBookCount + cart.length >= data.summary.borrowingLimit
  const borrowBlocked = hasUnpaidFines || atBorrowLimit
  const borrowBlockReason = hasUnpaidFines
    ? `Settle your unpaid balance of ${peso(data.summary.outstandingFines)} before borrowing.`
    : atBorrowLimit
      ? `Borrowing limit reached (${data.summary.activeBookCount + cart.length} of ${data.summary.borrowingLimit}).`
      : undefined

  const addCatalogBook = (book: BookCatalogItem) => {
    const validation = validateBookCartAddition({
      role: data.user.role as AuthRole,
      activeBookCount: data.summary.activeBookCount,
      selectedBookCount: cart.length,
      alreadySelected: cartIds.has(book.titleId),
      bookLimit: data.summary.borrowingLimit,
    })
    if (!validation.allowed) {
      setNotice('')
      setError(validation.message ?? 'This book cannot be added to the cart.')
      return
    }
    if (!cartIds.has(book.titleId)) {
      addItem(book)
      triggerFlyToCart({ title: book.title, coverImagePath: book.coverImagePath })
    }
    setError('')
    setNotice(validation.message ?? `${book.title} was added to your borrow cart.`)
  }

  const borrowRecommendation = async (titleId: number) => {
    if (borrowBlocked) return
    setBorrowingTitleId(titleId)
    setError('')
    setNotice('')
    try {
      addCatalogBook(await fetchBookOverview(titleId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The book could not be added to the cart.')
    } finally {
      setBorrowingTitleId(null)
    }
  }

  const clearanceLabel = clearanceOverride
    ? 'Approved by override'
    : cleared
      ? 'Requirements complete'
      : clearanceOverdue
        ? 'Clearance overdue'
        : 'Requirements to complete'

  // Strict Green / Yellow / Red status colors for clearance
  const clearanceToneClass =
    clearanceOverride || cleared
      ? 'border-[#16a34a]/30 bg-[#dcfce7]/70 text-[#166534] dark:border-[#16a34a]/40 dark:bg-[#166534]/20 dark:text-[#86efac]'
      : clearanceOverdue
        ? 'border-[#dc2626]/30 bg-[#fee2e2]/75 text-[#b42318] dark:border-[#dc2626]/40 dark:bg-[#991b1b]/25 dark:text-[#fca5a5]'
        : 'border-[#eab308]/45 bg-[#fef9c3]/80 text-[#92400e] dark:border-[#eab308]/40 dark:bg-[#854d0e]/25 dark:text-[#fde047]'

  return (
    <div className="space-y-5">
      {/* Compact Command Header — Complementary Soft Sky + Warm Cream Gradient */}
      <header className="relative overflow-hidden rounded-[12px] border border-[var(--sl-border)] border-t-[3px] border-t-[#0b5ea2] bg-gradient-to-r from-[#f0f7ff] via-[var(--sl-bg-elevated)] to-[#fffdf0] p-5 shadow-[var(--sl-shadow-xs)] dark:from-[#16253b] dark:via-[#1a2232] dark:to-[#24251c] lg:flex lg:items-center lg:justify-between lg:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${
                isFaculty
                  ? 'bg-[#4f46e5]/14 text-[#4f46e5] dark:bg-[#4f46e5]/25 dark:text-[#c7d2fe]'
                  : 'bg-[#0b5ea2]/14 text-[#0b5ea2] dark:bg-[#0b5ea2]/25 dark:text-[#93c5fd]'
              }`}
            >
              <GraduationCap size={13} />
              {data.user.role} workspace
            </span>
            {data.user.program ? (
              <span className="inline-flex items-center rounded-full bg-[#0f766e]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#0f766e] dark:bg-[#0f766e]/25 dark:text-[#5eead4]">
                {data.user.program}
              </span>
            ) : null}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                todaySchedule?.isOpen
                  ? 'bg-[#dcfce7] text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]'
                  : 'bg-[#fee2e2] text-[#b42318] dark:bg-[#991b1b]/30 dark:text-[#fca5a5]'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  todaySchedule?.isOpen ? 'bg-[#16a34a]' : 'bg-[#dc2626]'
                }`}
              />
              {todaySchedule?.isOpen
                ? `Open · ${formatManilaTime12(todaySchedule.opensAt)} – ${formatManilaTime12(todaySchedule.closesAt)}`
                : 'Closed today'}
            </span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--sl-text-header)] sm:text-[1.75rem]">
            Good day, {first(data.user.name)}!
          </h1>
          <p className="mt-1 text-sm text-[var(--sl-text-secondary)]">
            {isFaculty
              ? 'Manage your teaching loans, research access, print requests, and campus library status.'
              : 'Track your borrowing slots, reservations, fines, clearance standing, and today’s library hours.'}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 lg:mt-0 lg:shrink-0">
          <Link to={`${prefix}/library`}>
            <Button className="bg-[#FFF200] text-[#132a3f] shadow-sm hover:bg-[#f2e500]">
              <Search size={15} />
              Browse catalog
            </Button>
          </Link>
          <Link to={`${prefix}/research`}>
            <Button variant="secondary">
              <BookOpen size={15} />
              Browse research
            </Button>
          </Link>
          <Link to={`${prefix}/cart`} data-cart-target="true" className="inline-block rounded-[6px]">
            <Button variant="secondary">
              <ShoppingBag size={15} />
              Borrow cart ({cart.length})
            </Button>
          </Link>
          <RefreshButton label="Refresh dashboard" onRefresh={() => load()} variant="secondary" />
        </div>
      </header>

      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {notice ? (
        <NoticeBanner
          tone="success"
          action={
            <Link to={`${prefix}/cart`} className="inline-flex min-h-8 items-center text-xs font-semibold underline">
              Open borrow cart
            </Link>
          }
        >
          {notice}
        </NoticeBanner>
      ) : null}

      {/* Top Priority KPI Strip — Immediately Above the Fold */}
      <section aria-label="Account summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          className="group block rounded-[10px] transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4"
          to={`${prefix}/borrowing`}
        >
          <StatCard
            label="Active loans"
            value={data.summary.activeLoans}
            note={limitNote}
            icon={BookOpen}
            tone="info"
          />
        </Link>
        <Link
          className="group block rounded-[10px] transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4"
          to={`${prefix}/reservations`}
        >
          <StatCard
            label="Requests & reservations"
            value={data.summary.activeReservations}
            note={
              data.reservation?.status === 'ready_for_pickup'
                ? 'Ready for pickup'
                : data.summary.activeReservations > 0
                  ? 'Active in queue'
                  : 'No active requests'
            }
            icon={BookMarked}
            tone="violet"
          />
        </Link>
        <Link
          className="group block rounded-[10px] transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4"
          to={`${prefix}/notifications`}
        >
          <StatCard
            label="Unread updates"
            value={data.summary.unreadNotifications}
            note={data.summary.unreadNotifications > 0 ? 'Needs review' : 'All caught up'}
            icon={Bell}
            tone={data.summary.unreadNotifications ? 'warning' : 'default'}
          />
        </Link>
        <Link
          className="group block rounded-[10px] transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4"
          to={`${prefix}/fines`}
        >
          <StatCard
            label="Outstanding fines"
            value={peso(data.summary.outstandingFines)}
            note={hasUnpaidFines ? 'Settle before borrowing' : 'All settled'}
            icon={PhilippinePeso}
            tone={hasUnpaidFines ? 'error' : 'success'}
          />
        </Link>
      </section>

      {/* Asymmetric 2-Column Vaadin Bento Workspace */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left Main Workspace */}
        <div className="min-w-0 space-y-5">
          {/* 1. Recommendations (kept before Return reminder in DOM order) */}
          <SectionCard className="border-t-[3px] border-t-[#0f766e] p-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--sl-border)] pb-3.5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0f766e] dark:text-[#5eead4]">
                  Recommended for {data.user.program ?? 'you'}
                </p>
                <h2 className="mt-0.5 font-display text-lg font-semibold text-[var(--sl-text-header)]">
                  Available to borrow
                </h2>
              </div>
              <Link to={`${prefix}/library`}>
                <CardLink>View all</CardLink>
              </Link>
            </div>

            {hasUnpaidFines ? (
              <NoticeBanner
                tone="error"
                className="mb-4"
                action={
                  <Link to={`${prefix}/fines`} className="inline-flex min-h-8 items-center text-xs font-semibold underline">
                    View fines
                  </Link>
                }
              >
                Settle your unpaid balance of {peso(data.summary.outstandingFines)} before borrowing books.
              </NoticeBanner>
            ) : atBorrowLimit ? (
              <NoticeBanner
                tone="warning"
                className="mb-4"
                action={
                  <Link to={`${prefix}/my-books`} className="inline-flex min-h-8 items-center text-xs font-semibold underline">
                    View my books
                  </Link>
                }
              >
                Borrowing limit reached ({data.summary.activeBookCount + cart.length} of{' '}
                {data.summary.borrowingLimit}). Return a book or remove an item from your cart to borrow another.
              </NoticeBanner>
            ) : null}

            {data.recommendations.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.recommendations.map((book) => {
                  const inCart = cartIds.has(book.id)
                  const disabled = inCart || borrowingTitleId === book.id || borrowBlocked
                  return (
                    <article
                      key={book.id}
                      className="group flex min-w-0 flex-col rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3.5 transition-all hover:border-[#0b5ea2]/40 hover:shadow-[var(--sl-shadow-s)]"
                    >
                      <div className="flex justify-center rounded-[8px] bg-gradient-to-b from-[#f0f9ff] to-[#f8fafc] py-3.5 dark:from-[#1d2b3e] dark:to-[#1a2232]">
                        <BookCoverThumbnail
                          title={book.title}
                          coverImagePath={book.coverPath}
                          className="h-40 w-28 rounded-[6px] border border-[var(--sl-border)] shadow-[var(--sl-shadow-s)] transition-transform duration-200 group-hover:scale-[1.02]"
                        />
                      </div>
                      <div className="mt-2.5">
                        <span className="inline-flex items-center rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-semibold text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]">
                          {book.availableCopies} available
                        </span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-[var(--sl-text-header)]">
                        {book.title}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-[var(--sl-text-secondary)]">
                        {book.author}
                      </p>
                      <div className="mt-auto grid grid-cols-2 gap-2 pt-3.5">
                        <Button variant="secondary" size="sm" onClick={() => setSelectedTitleId(book.id)}>
                          <Eye size={14} />
                          View details
                        </Button>
                        <Button
                          size="sm"
                          disabled={disabled}
                          title={disabled && !inCart ? borrowBlockReason : undefined}
                          onClick={() => void borrowRecommendation(book.id)}
                        >
                          <ShoppingBag size={14} />
                          {inCart ? 'In cart' : borrowingTitleId === book.id ? 'Adding…' : 'Borrow'}
                        </Button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <Empty text="No available recommendations right now." />
            )}
          </SectionCard>

          {/* 2. Active Borrowing Desk: Return Reminder + Cart & Reservations */}
          <div className="grid gap-5 md:grid-cols-2">
            <SectionCard className="flex flex-col border-t-[3px] border-t-[#0b5ea2] p-5">
              <div className="mb-3.5 flex items-center justify-between gap-3 border-b border-[var(--sl-border)] pb-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b5ea2] dark:text-[#93c5fd]">
                    Current loan
                  </p>
                  <h2 className="mt-0.5 font-display text-base font-semibold text-[var(--sl-text-header)]">
                    Return reminder
                  </h2>
                </div>
                {data.currentLoan ? <StatusBadge status={data.currentLoan.status} /> : null}
              </div>

              {data.currentLoan ? (
                <div className="flex flex-1 gap-3.5 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3.5">
                  <BookCoverThumbnail
                    title={data.currentLoan.title}
                    coverImagePath={data.currentLoan.coverPath}
                    className="h-28 w-20 shrink-0 rounded-[6px] border border-[var(--sl-border)] shadow-[var(--sl-shadow-xs)]"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 font-display text-sm font-semibold text-[var(--sl-text-header)]">
                      {data.currentLoan.title}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-[var(--sl-text-secondary)]">
                      {data.currentLoan.author}
                    </p>
                    <div className="mt-3 space-y-1.5 text-xs text-[var(--sl-text-secondary)]">
                      <div className="flex items-center gap-1.5">
                        <CalendarClock size={14} className="shrink-0 text-[#0b5ea2] dark:text-[#93c5fd]" />
                        <span>Due {data.currentLoan.dueAt}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin size={14} className="shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
                        <span className="truncate">
                          {data.currentLoan.shelfLocation || data.currentLoan.barcode}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Empty text="You have no active borrowed books." />
              )}

              <div className="mt-3.5 pt-1">
                <Link to={`${prefix}/my-books`}>
                  <CardLink>Open my books</CardLink>
                </Link>
              </div>
            </SectionCard>

            <SectionCard className="flex flex-col border-t-[3px] border-t-[#4f46e5] p-5">
              <div className="mb-3.5 flex items-center justify-between gap-3 border-b border-[var(--sl-border)] pb-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#4f46e5] dark:text-[#c7d2fe]">
                    Book request
                  </p>
                  <h2 className="mt-0.5 font-display text-base font-semibold text-[var(--sl-text-header)]">
                    Cart and reservations
                  </h2>
                </div>
                {data.reservation ? <StatusBadge status={data.reservation.status} /> : null}
              </div>

              {data.reservation ? (
                <div className="flex flex-1 gap-3.5 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3.5">
                  <BookCoverThumbnail
                    title={data.reservation.title}
                    coverImagePath={data.reservation.coverPath}
                    className="h-28 w-20 shrink-0 rounded-[6px] border border-[var(--sl-border)] shadow-[var(--sl-shadow-xs)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-display text-sm font-semibold text-[var(--sl-text-header)]">
                      {data.reservation.title}
                    </p>
                    {data.reservation.queuePosition > 0 ? (
                      <p className="mt-2 text-xs text-[var(--sl-text-secondary)]">
                        Queue position <strong className="text-[var(--sl-text-header)]">#{data.reservation.queuePosition}</strong>
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-[var(--sl-text-secondary)]">
                        Awaiting staff handover
                      </p>
                    )}
                    {data.reservation.pickupDeadline ? (
                      <p className="mt-1.5 text-xs font-medium text-[#b45309] dark:text-[#fcd34d]">
                        Pickup by {data.reservation.pickupDeadline}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <Empty text="No active book request." />
              )}

              <div className="mt-3.5 pt-1">
                <Link
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b5ea2] hover:underline dark:text-[#93c5fd]"
                  to={`${prefix}/reservations`}
                >
                  View requests &amp; reservations
                  <ArrowRight size={14} />
                </Link>
              </div>
            </SectionCard>
          </div>

          {/* 3. Print Service & Recent Borrowing History */}
          <div className="grid gap-5 md:grid-cols-[0.85fr_1.15fr]">
            <SectionCard className="flex flex-col border-t-[3px] border-t-[#0284c7] p-5">
              <div className="mb-3.5 flex items-center justify-between gap-3 border-b border-[var(--sl-border)] pb-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0284c7] dark:text-[#7dd3fc]">
                    Print service
                  </p>
                  <h2 className="mt-0.5 font-display text-base font-semibold text-[var(--sl-text-header)]">
                    Latest request
                  </h2>
                </div>
                <Printer size={18} className="text-[#0b5ea2] dark:text-[#93c5fd]" />
              </div>

              {data.printRequest ? (
                <div className="flex flex-1 flex-col justify-between rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-semibold text-[var(--sl-text-header)]">
                        {data.printRequest.fileName}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                        {data.printRequest.copies} copies · {data.printRequest.printType}
                      </p>
                    </div>
                    <StatusBadge status={data.printRequest.status} />
                  </div>
                  <div className="mt-4 flex items-end justify-between border-t border-[var(--sl-border)] pt-3">
                    <p className="font-display text-lg font-bold tabular-nums text-[var(--sl-text-header)]">
                      {peso(data.printRequest.cost)}
                    </p>
                    <Link to={`${prefix}/printing`}>
                      <CardLink>View request</CardLink>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
                  <p className="text-sm text-[var(--sl-text-muted)]">No active print request.</p>
                  <Link to={`${prefix}/printing`} className="mt-2.5">
                    <CardLink>Submit a print job</CardLink>
                  </Link>
                </div>
              )}
            </SectionCard>

            <SectionCard className="flex flex-col border-t-[3px] border-t-[#0f766e] p-5">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--sl-border)] pb-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0f766e] dark:text-[#5eead4]">
                    Recent borrowing
                  </p>
                  <h2 className="mt-0.5 font-display text-base font-semibold text-[var(--sl-text-header)]">
                    History preview
                  </h2>
                </div>
                <Link to={`${prefix}/borrowing`}>
                  <CardLink>View full history</CardLink>
                </Link>
              </div>

              <div className="flex-1 divide-y divide-[var(--sl-border)]">
                {data.recentHistory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-1">
                    <div className="flex min-w-0 items-center gap-3">
                      <BookCoverThumbnail
                        title={item.title}
                        coverImagePath={item.coverPath}
                        className="h-14 w-10 shrink-0 rounded-[5px] border border-[var(--sl-border)] shadow-[var(--sl-shadow-xs)]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--sl-text-header)]">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">{item.eventAt}</p>
                      </div>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
                {!data.recentHistory.length ? <Empty text="No borrowing history yet." /> : null}
              </div>
            </SectionCard>
          </div>
        </div>

        {/* Right Sticky Utility Rail */}
        <aside className="space-y-5 xl:sticky xl:top-20" aria-label="Library pass and live status">
          {/* 1. Latest Notification (top of rail, above QR pass) */}
          <SectionCard
            className={`border-t-[3px] p-5 ${
              data.summary.unreadNotifications > 0 ? 'border-t-[#eab308]' : 'border-t-[#0b5ea2]'
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p
                  className={`text-[11px] font-bold uppercase tracking-[0.12em] ${
                    data.summary.unreadNotifications > 0
                      ? 'text-[#92400e] dark:text-[#fde047]'
                      : 'text-[#0b5ea2] dark:text-[#93c5fd]'
                  }`}
                >
                  Latest update
                </p>
                <h2 className="mt-0.5 font-display text-base font-semibold text-[var(--sl-text-header)]">
                  Notifications
                </h2>
              </div>
              <Link to={`${prefix}/notifications`}>
                <CardLink>View all</CardLink>
              </Link>
            </div>
            {data.latestNotification ? (
              <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3">
                <p className="text-sm font-semibold text-[var(--sl-text-header)]">
                  {data.latestNotification.title}
                </p>
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--sl-text-secondary)]">
                  {data.latestNotification.message}
                </p>
              </div>
            ) : (
              <p className="text-xs text-[var(--sl-text-muted)]">You are all caught up.</p>
            )}
          </SectionCard>

          {/* 2. Digital Library QR Pass */}
          <DashboardQrPass
            schoolId={data.user.schoolId}
            role={data.user.role}
            attendancePath={`${prefix}/attendance`}
          />

          {/* 2. Live Library Occupancy & Operating Hours */}
          <SectionCard className="p-5">
            <div className="mb-3.5 flex items-center justify-between gap-2 border-b border-[var(--sl-border)] pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0f766e] dark:text-[#5eead4]">
                  Live campus status
                </p>
                <h2 className="mt-0.5 font-display text-base font-semibold text-[var(--sl-text-header)]">
                  Hours &amp; occupancy
                </h2>
              </div>
              <Clock3 size={18} className="text-[#0f766e] dark:text-[#5eead4]" />
            </div>

            <OccupancyGauge current={data.occupancy.current} capacity={data.occupancy.capacity} />

            <div className="mt-4 space-y-2 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3 text-xs">
              <p className="font-semibold text-[var(--sl-text-header)]">
                {dayNames[today]}:{' '}
                {todaySchedule?.isOpen
                  ? `${formatManilaTime12(todaySchedule.opensAt)} – ${formatManilaTime12(todaySchedule.closesAt)}`
                  : 'Closed'}
              </p>
              {data.profile.nextClosure ? (
                <p className="text-[var(--sl-text-secondary)]">
                  Next closure: {formatPhDate(data.profile.nextClosure.date, 'medium')} ·{' '}
                  {data.profile.nextClosure.reason}
                </p>
              ) : (
                <p className="text-[var(--sl-text-secondary)]">No upcoming closure is posted.</p>
              )}
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
              <Link to={`${prefix}/schedule`}>
                <CardLink>Full schedule</CardLink>
              </Link>
              {data.profile.mapPath ? (
                <a
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b5ea2] hover:underline dark:text-[#93c5fd]"
                  href={data.profile.mapPath}
                >
                  <MapPin size={14} />
                  View library map
                </a>
              ) : (
                <Link
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b5ea2] hover:underline dark:text-[#93c5fd]"
                  to={`${prefix}/floor-plan`}
                >
                  <MapPin size={14} />
                  Floor plan
                </Link>
              )}
            </div>
          </SectionCard>

          {/* 3. Clearance Standing Widget */}
          <SectionCard className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--sl-text-muted)]">
                Clearance status
              </p>
              <Link to={`${prefix}/clearance`}>
                <CardLink>Details</CardLink>
              </Link>
            </div>
            <div className={`flex items-start gap-3 rounded-[10px] border p-3.5 ${clearanceToneClass}`}>
              {clearanceOverride ? (
                <ShieldCheck size={20} className="mt-0.5 shrink-0" />
              ) : cleared ? (
                <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={20} className="mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-display text-sm font-bold leading-snug">{clearanceLabel}</p>
                <p className="mt-1 text-xs opacity-85">
                  {clearanceDeadline
                    ? `Deadline: ${new Date(clearanceDeadline).toLocaleString('en-PH', {
                        timeZone: 'Asia/Manila',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}`
                    : data.clearanceSchedule === null
                      ? 'Keep your library obligations up to date.'
                      : 'No schedule yet for clearance day.'}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* 5. Library Announcement */}
          {data.announcement ? (
            <SectionCard className="border-l-4 border-l-[#0b5ea2] p-5">
              <div className="flex items-start gap-3">
                <Megaphone className="mt-0.5 shrink-0 text-[#0b5ea2] dark:text-[#93c5fd]" size={18} />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b5ea2] dark:text-[#93c5fd]">
                    Library announcement · {data.announcement.priority}
                  </p>
                  <h2 className="mt-1 font-display text-base font-semibold text-[var(--sl-text-header)]">
                    {data.announcement.title}
                  </h2>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--sl-text-secondary)]">
                    {data.announcement.message}
                  </p>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </aside>
      </div>

      {selectedTitleId !== null ? (
        <BookOverview
          titleId={selectedTitleId}
          role={data.user.role as AuthRole}
          activeBookCount={data.summary.activeBookCount}
          bookLimit={data.summary.borrowingLimit}
          selectedBookCount={cart.length}
          alreadySelected={cartIds.has(selectedTitleId)}
          onAddToCart={addCatalogBook}
          onClose={() => setSelectedTitleId(null)}
        />
      ) : null}
      <FlyToCartOverlay />
    </div>
  )
}

function manilaDay() {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
  }).format(new Date())
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[short] ?? 1
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-[var(--sl-text-muted)]">{text}</p>
}
