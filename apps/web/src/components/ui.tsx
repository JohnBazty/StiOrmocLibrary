import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight, MoreHorizontal, Search } from 'lucide-react'
import type { ReactNode } from 'react'

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#003399]">{eyebrow}</p> : null}
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#003399] sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[#003399]/65">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function Button({ children, variant = 'primary', className, type = 'button', onClick }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; className?: string; type?: 'button' | 'submit'; onClick?: () => void }) {
  const variants = {
    primary: 'bg-[#003399] text-white shadow-sm hover:bg-[#003399]',
    secondary: 'border border-[#003399]/15 bg-white text-[#003399] hover:border-[#003399]/15 hover:text-[#003399]',
    ghost: 'text-[#003399]/65 hover:bg-[#003399]/5 hover:text-[#003399]',
  }
  return <button type={type} onClick={onClick} className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition', variants[variant], className)}>{children}</button>
}

export function SectionCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-[#003399]/10 bg-white shadow-[0_1px_3px_rgba(0,51,153,0.08)]', className)}>{children}</section>
}

const toneClasses: Record<string, string> = {
  active: 'bg-[#003399]/5 text-[#003399] ring-[#003399]/10',
  available: 'bg-[#003399]/5 text-[#003399] ring-[#003399]/10',
  ready_for_pickup: 'bg-[#003399]/5 text-[#003399] ring-[#003399]/10',
  cleared: 'bg-[#003399]/5 text-[#003399] ring-[#003399]/10',
  paid: 'bg-[#003399]/5 text-[#003399] ring-[#003399]/10',
  returned: 'bg-[#003399]/5 text-[#003399]/65 ring-[#003399]/10',
  queued: 'bg-[#FFF200]/35 text-[#003399] ring-[#003399]/10',
  pending: 'bg-[#FFF200]/35 text-[#003399] ring-[#003399]/10',
  partially_paid: 'bg-[#FFF200]/35 text-[#003399] ring-[#003399]/10',
  printing: 'bg-[#FFF200]/35 text-[#003399] ring-[#003399]/10',
  overdue: 'bg-[#FFF200] text-[#003399] ring-[#003399]/10',
  borrowed: 'bg-[#003399]/5 text-[#003399] ring-[#003399]/10',
  reserved: 'bg-[#FFF200]/35 text-[#003399] ring-[#003399]/10',
  blocked: 'bg-[#FFF200] text-[#003399] ring-[#003399]/10',
  unpaid: 'bg-[#FFF200] text-[#003399] ring-[#003399]/10',
  unavailable: 'bg-[#003399]/5 text-[#003399]/65 ring-[#003399]/10',
  inactive: 'bg-[#003399]/5 text-[#003399]/65 ring-[#003399]/10',
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll(' ', '_')
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ring-1 ring-inset', toneClasses[normalized] ?? 'bg-[#003399]/5 text-[#003399]/65 ring-[#003399]/10')}>{status.replaceAll('_', ' ')}</span>
}

const statTones: Record<string, string> = {
  emerald: 'bg-[#003399]/5 text-[#003399]', blue: 'bg-[#003399]/5 text-[#003399]', teal: 'bg-[#003399]/5 text-[#003399]',
  orange: 'bg-[#FFF200]/35 text-[#003399]', violet: 'bg-[#003399]/5 text-[#003399]', cyan: 'bg-[#003399]/5 text-[#003399]',
  pink: 'bg-[#003399]/5 text-[#003399]', red: 'bg-[#FFF200] text-[#003399]', amber: 'bg-[#FFF200]/35 text-[#003399]',
}

export function StatCard({ label, value, note, icon: Icon, tone = 'emerald' }: { label: string; value: string | number; note?: string; icon: LucideIcon; tone?: string }) {
  return (
    <SectionCard className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#003399]/65">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-[#003399]">{value}</p>
          {note ? <p className="mt-1 text-xs text-[#003399]/65">{note}</p> : null}
        </div>
        <div className={cn('rounded-xl p-2.5', statTones[tone] ?? statTones.emerald)}><Icon size={18} /></div>
      </div>
    </SectionCard>
  )
}

export function TableSearch({ placeholder = 'Search records...', value, onChange }: { placeholder?: string; value?: string; onChange?: (value: string) => void }) {
  return (
    <label className="relative block w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#003399]/45" size={16} />
      <input value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-xl border border-[#003399]/15 bg-[#003399]/5 pl-9 pr-3 text-sm outline-none transition focus:border-[#003399]/15 focus:bg-white focus:ring-4 focus:ring-[#003399]/10" />
    </label>
  )
}

export function TableShell({ title, subtitle, controls, children }: { title: string; subtitle?: string; controls?: ReactNode; children: ReactNode }) {
  return (
    <SectionCard className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#003399]/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-display text-base font-bold text-[#003399]">{title}</h2>{subtitle ? <p className="mt-0.5 text-xs text-[#003399]/65">{subtitle}</p> : null}</div>
        {controls}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </SectionCard>
  )
}

export function MoreButton() {
  return <button aria-label="More actions" className="rounded-lg p-2 text-[#003399]/45 transition hover:bg-[#003399]/5 hover:text-[#003399]"><MoreHorizontal size={17} /></button>
}

export function CardLink({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-xs font-bold text-[#003399]">{children}<ArrowUpRight size={13} /></span>
}

export function BookCover({ code, accent, className }: { code: string; accent: string; className?: string }) {
  return (
    <div className={cn('relative flex aspect-[3/4] items-end overflow-hidden rounded-xl bg-gradient-to-br p-3 text-white shadow-lg shadow-[#003399]/10', accent, className)}>
      <div className="absolute inset-y-0 left-2 w-px bg-white/20" />
      <div className="absolute right-3 top-3 h-5 w-5 rounded-full border border-white/20" />
      <span className="font-display text-xl font-black tracking-tight">{code}</span>
    </div>
  )
}
