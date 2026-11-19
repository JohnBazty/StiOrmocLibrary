import { Link } from 'react-router-dom'
import { BookOpen, CalendarClock, Clock, Wrench } from 'lucide-react'
import { Button, SectionCard } from '../../components/ui'
import type { DeskOverview, DeskTaskFilters } from './desk-dashboard-api'

export function DashboardActionCards({
  data,
  onSelect,
  onRemind,
  reminderBusy = false,
}: {
  data: DeskOverview | null
  onSelect: (tab: DeskTaskFilters['tab']) => void
  onRemind: () => void
  reminderBusy?: boolean
}) {
  const cards = [
    { label: 'Books due today', value: data?.counts.dueToday, icon: Clock, tab: 'due' as const, accent: 'border-l-[3px] border-l-[#d97706]', iconClass: 'bg-[var(--sl-warning-soft)] text-[#b45309] dark:text-[#fcd34d]' },
    { label: 'Overdue books', value: data?.counts.overdue, icon: CalendarClock, tab: 'overdue' as const, accent: 'border-l-[3px] border-l-[#b42318]', iconClass: 'bg-[var(--sl-error-soft)] text-[#b42318] dark:text-[#fca5a5]' },
    { label: 'Pending reservations', value: data?.counts.holds, icon: BookOpen, tab: 'holds' as const, accent: '', iconClass: 'bg-[var(--sl-info-soft)] text-[#0b5ea2] dark:text-[#93c5fd]' },
  ]

  return (
    <section aria-label="Daily action cards" className="mb-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-[var(--sl-text-header)]">Today’s priorities</h2>
        <span className="text-xs text-[var(--sl-text-muted)]">School-wide totals · Philippine time</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tab, accent, iconClass }) => (
          <SectionCard key={label} className={`p-4 ${accent}`}>
            <button onClick={() => onSelect(tab)} className="block min-h-11 w-full text-left">
              <span className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--sl-text-secondary)]">
                <span>{label}</span>
                <span className={`rounded-[8px] p-1.5 ${iconClass}`} aria-hidden="true">
                  <Icon size={17} />
                </span>
              </span>
              <strong className="mt-2 block font-display text-3xl font-bold tracking-tight tabular-nums text-[var(--sl-text-header)]">
                {value?.toLocaleString('en-PH') ?? '—'}
              </strong>
            </button>
            {tab === 'overdue' ? (
              <div className="mt-3">
                <Button variant="secondary" size="sm" className="w-full" disabled={!value || reminderBusy} onClick={onRemind}>
                  {reminderBusy ? 'Queuing emails…' : 'Send email reminders'}
                </Button>
                <p className="mt-1.5 text-[11px] text-[var(--sl-text-muted)]">Applies to your active overdue task filters</p>
              </div>
            ) : (
              <p className="mt-2.5 text-xs text-[var(--sl-text-muted)]">
                {tab === 'due' ? 'Not yet overdue · View due list' : 'Copies needing shelf preparation'}
              </p>
            )}
          </SectionCard>
        ))}
        <Link
          to="/librarian/inventory?condition=For%20Repair"
          className="section-card block rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-4 shadow-[var(--sl-shadow-xs)] transition-colors hover:bg-[var(--sl-bg-subtle)]"
        >
          <span className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--sl-text-secondary)]">
            <span>Books in repair</span>
            <span className="rounded-[8px] bg-[var(--sl-bg-subtle)] p-1.5 text-[var(--sl-text-secondary)]" aria-hidden="true">
              <Wrench size={17} />
            </span>
          </span>
          <strong className="mt-2 block font-display text-3xl font-bold tracking-tight tabular-nums text-[var(--sl-text-header)]">
            {data?.counts.repair.toLocaleString('en-PH') ?? '—'}
          </strong>
          <p className="mt-2.5 text-xs text-[var(--sl-text-muted)]">View copies marked For Repair</p>
        </Link>
      </div>
    </section>
  )
}
