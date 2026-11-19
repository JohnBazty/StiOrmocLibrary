import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Inbox,
  Info,
  MinusCircle,
  MoreHorizontal,
  Search,
  X,
} from 'lucide-react'
import { isValidElement, useEffect, useId, type HTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { ResponsiveTable } from './ResponsiveTable'

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="page-header mb-6 flex min-w-0 flex-col gap-3 border-b border-[var(--sl-border)] pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#0b5ea2] dark:text-[#93c5fd]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--sl-text-header)] sm:text-[1.75rem] leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--sl-text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="page-header-actions min-w-0 shrink-0">{action}</div> : null}
    </div>
  )
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  onClick,
  disabled = false,
  title,
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  disabled?: boolean
  title?: string
  'aria-label'?: string
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-[#0b5ea2] text-white shadow-[var(--sl-shadow-xs)] hover:bg-[#094e87] active:bg-[#073e6c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2] dark:focus-visible:outline-[#FFF200]',
    secondary:
      'border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] hover:bg-[var(--sl-bg-subtle)] active:bg-[var(--sl-bg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2] dark:border-white/20 dark:bg-[#232634] dark:text-[#f7f9ff] dark:hover:bg-white/10 dark:focus-visible:outline-[#FFF200]',
    ghost:
      'text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2] dark:text-white/75 dark:hover:bg-white/10 dark:hover:text-white',
    danger:
      'bg-[#b42318] text-white shadow-[var(--sl-shadow-xs)] hover:bg-[#991b1b] active:bg-[#7f1d1d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b42318]',
    success:
      'bg-[#166534] text-white shadow-[var(--sl-shadow-xs)] hover:bg-[#14532d] active:bg-[#052e16] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#166534]',
  }
  const sizes: Record<ButtonSize, string> = {
    sm: 'min-h-8 rounded-[6px] px-3 py-1.5 text-xs',
    md: 'min-h-[38px] rounded-[6px] px-3.5 py-2 text-sm',
  }
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      data-variant={variant}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'smartlib-button inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        sizes[size],
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function SectionCard({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  return (
    <section
      {...props}
      className={cn(
        'section-card min-w-0 max-w-full rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-[var(--sl-shadow-xs)]',
        className,
      )}
    >
      {children}
    </section>
  )
}

export type SemanticTone = 'error' | 'warning' | 'success' | 'info' | 'neutral'

const statusToneMap: Record<string, SemanticTone> = {
  // Error — overdue, blocked, unpaid, failures, lost, not cleared
  overdue: 'error',
  blocked: 'error',
  unpaid: 'error',
  not_cleared: 'error',
  failed: 'error',
  lost: 'error',
  damaged: 'error',
  for_repair: 'error',
  mismatch: 'error',
  rejected: 'error',
  reversed: 'error',
  out_of_stock: 'error',
  empty: 'error',
  urgent: 'error',
  // Warning — pending action, due soon, low stock, accruing, review needed
  due_today: 'warning',
  low_stock: 'warning',
  accruing: 'warning',
  pending: 'warning',
  queued: 'warning',
  printing: 'warning',
  partially_paid: 'warning',
  reserved: 'warning',
  refund_pending: 'warning',
  refund_needs_review: 'warning',
  needs_review: 'warning',
  preparing: 'warning',
  awaiting_handover: 'warning',
  waiting_for_a_copy: 'warning',
  pending_pickup: 'warning',
  in_request_queue: 'warning',
  processing: 'warning',
  fair: 'warning',
  important: 'warning',
  upcoming: 'warning',
  // Success — cleared, paid, available, in stock, completed, ready
  available: 'success',
  in_stock: 'success',
  cleared: 'success',
  paid: 'success',
  completed: 'success',
  collected: 'success',
  claimed: 'success',
  ready_for_pickup: 'success',
  ready: 'success',
  published: 'success',
  open: 'success',
  good: 'success',
  resolved: 'success',
  verified: 'success',
  approved: 'success',
  qr_ready: 'success',
  // Info — active, borrowed, scheduled, in progress, live presence
  active: 'info',
  borrowed: 'info',
  scheduled: 'info',
  in_progress: 'info',
  inside: 'info',
  available_for_viewing: 'info',
  issued: 'info',
  recorded: 'info',
  // Neutral — returned, archived, cancelled, expired, inactive, waived
  returned: 'neutral',
  archived: 'neutral',
  deactivated: 'neutral',
  cancelled: 'neutral',
  canceled: 'neutral',
  expired: 'neutral',
  waived: 'neutral',
  voided: 'neutral',
  superseded: 'neutral',
  unfulfilled: 'neutral',
  closed: 'neutral',
  inactive: 'neutral',
  unavailable: 'neutral',
  not_registered: 'neutral',
  exited: 'neutral',
  draft: 'neutral',
  refunded: 'neutral',
  qr_unavailable: 'neutral',
  normal: 'neutral',
}

const badgeToneStyles: Record<SemanticTone, { classes: string; icon: LucideIcon }> = {
  error: {
    classes:
      'bg-[#fef2f2] text-[#991b1b] ring-[#fecaca] dark:bg-[rgba(180,35,24,0.26)] dark:text-[#fca5a5] dark:ring-[rgba(248,113,113,0.35)]',
    icon: AlertCircle,
  },
  warning: {
    classes:
      'bg-[#fffbeb] text-[#92400e] ring-[#fde68a] dark:bg-[rgba(180,83,9,0.28)] dark:text-[#fcd34d] dark:ring-[rgba(251,191,36,0.35)]',
    icon: Clock3,
  },
  success: {
    classes:
      'bg-[#f0fdf4] text-[#166534] ring-[#bbf7d0] dark:bg-[rgba(22,101,52,0.28)] dark:text-[#86efac] dark:ring-[rgba(74,222,128,0.35)]',
    icon: CheckCircle2,
  },
  info: {
    classes:
      'bg-[rgba(11,94,162,0.10)] text-[#0b5ea2] ring-[rgba(11,94,162,0.22)] dark:bg-[rgba(56,146,224,0.22)] dark:text-[#93c5fd] dark:ring-[rgba(96,165,250,0.35)]',
    icon: Info,
  },
  neutral: {
    classes:
      'bg-[#f1f5f9] text-[#475569] ring-[#cbd5e1] dark:bg-white/10 dark:text-[#cbd5e1] dark:ring-white/15',
    icon: MinusCircle,
  },
}

export function resolveStatusTone(status: string): SemanticTone {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return statusToneMap[normalized] ?? 'neutral'
}

export function StatusBadge({ status, tone }: { status: string; tone?: SemanticTone }) {
  const resolved = tone ?? resolveStatusTone(status)
  const { classes, icon: Icon } = badgeToneStyles[resolved]
  return (
    <span
      data-tone={resolved}
      className={cn(
        'sl-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset whitespace-nowrap',
        classes,
      )}
    >
      <Icon size={13} aria-hidden="true" className="shrink-0" />
      <span>{status.replaceAll('_', ' ')}</span>
    </span>
  )
}

const statToneClasses: Record<string, { icon: string; accent: string }> = {
  default: {
    icon: 'bg-[var(--sl-bg-subtle)] text-[var(--sl-text-secondary)]',
    accent: '',
  },
  info: {
    icon: 'bg-[var(--sl-info-soft)] text-[#0b5ea2] dark:text-[#93c5fd]',
    accent: '',
  },
  success: {
    icon: 'bg-[var(--sl-success-soft)] text-[#166534] dark:text-[#86efac]',
    accent: '',
  },
  warning: {
    icon: 'bg-[var(--sl-warning-soft)] text-[#b45309] dark:text-[#fcd34d]',
    accent: 'border-l-[3px] border-l-[#d97706]',
  },
  error: {
    icon: 'bg-[var(--sl-error-soft)] text-[#b42318] dark:text-[#fca5a5]',
    accent: 'border-l-[3px] border-l-[#b42318]',
  },
  // Backwards-compatible aliases used across legacy screens
  emerald: {
    icon: 'bg-[var(--sl-success-soft)] text-[#166534] dark:text-[#86efac]',
    accent: '',
  },
  blue: {
    icon: 'bg-[var(--sl-info-soft)] text-[#0b5ea2] dark:text-[#93c5fd]',
    accent: '',
  },
  teal: {
    icon: 'bg-[var(--sl-info-soft)] text-[#0f766e] dark:text-[#5eead4]',
    accent: '',
  },
  violet: {
    icon: 'bg-[var(--sl-info-soft)] text-[#0b5ea2] dark:text-[#93c5fd]',
    accent: '',
  },
  cyan: {
    icon: 'bg-[var(--sl-info-soft)] text-[#0b5ea2] dark:text-[#93c5fd]',
    accent: '',
  },
  pink: {
    icon: 'bg-[var(--sl-info-soft)] text-[#0b5ea2] dark:text-[#93c5fd]',
    accent: '',
  },
  orange: {
    icon: 'bg-[var(--sl-warning-soft)] text-[#b45309] dark:text-[#fcd34d]',
    accent: 'border-l-[3px] border-l-[#d97706]',
  },
  amber: {
    icon: 'bg-[var(--sl-warning-soft)] text-[#b45309] dark:text-[#fcd34d]',
    accent: 'border-l-[3px] border-l-[#d97706]',
  },
  red: {
    icon: 'bg-[var(--sl-error-soft)] text-[#b42318] dark:text-[#fca5a5]',
    accent: 'border-l-[3px] border-l-[#b42318]',
  },
}

export function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'info',
}: {
  label: string
  value: string | number
  note?: string
  icon?: LucideIcon
  tone?: string
}) {
  const style = statToneClasses[tone] ?? statToneClasses.info
  return (
    <SectionCard className={cn('p-4', style.accent)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--sl-text-secondary)]">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold tracking-tight tabular-nums text-[var(--sl-text-header)]">
            {value}
          </p>
          {note ? (
            <p className="mt-1 text-xs leading-snug text-[var(--sl-text-muted)]">{note}</p>
          ) : null}
        </div>
        {Icon ? (
          <div className={cn('shrink-0 rounded-[8px] p-2', style.icon)} aria-hidden="true">
            <Icon size={18} />
          </div>
        ) : null}
      </div>
    </SectionCard>
  )
}

export function TableSearch({
  placeholder = 'Search records…',
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  'aria-label'?: string
}) {
  return (
    <label className="relative block w-full sm:max-w-xs">
      <span className="sr-only">{ariaLabel ?? placeholder}</span>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sl-text-muted)]"
        size={15}
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={event => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="sl-input pl-9 pr-3"
      />
    </label>
  )
}

export function TableShell({
  title,
  subtitle,
  controls,
  children,
}: {
  title: string
  subtitle?: string
  controls?: ReactNode
  children: ReactNode
}) {
  return (
    <SectionCard className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--sl-border)] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">{subtitle}</p>
          ) : null}
        </div>
        {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
      </div>
      {isValidElement(children) && children.type === 'table' ? (
        <ResponsiveTable label={title}>{children as ReactElement<{ children?: ReactNode }>}</ResponsiveTable>
      ) : (
        <div className="min-w-0 overflow-x-auto">{children}</div>
      )}
    </SectionCard>
  )
}

export function NoticeBanner({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'error' | 'success' | 'warning' | 'info'
  title?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  const icons: Record<'error' | 'success' | 'warning' | 'info', LucideIcon> = {
    error: AlertCircle,
    success: CheckCircle2,
    warning: AlertTriangle,
    info: Info,
  }
  const styles: Record<'error' | 'success' | 'warning' | 'info', string> = {
    error: 'border-[#b42318] bg-[#b42318] text-white',
    success: 'border-[#166534] bg-[#166534] text-white',
    warning:
      'border-[#fde68a] bg-[#fffbeb] text-[#92400e] dark:border-[rgba(251,191,36,0.35)] dark:bg-[rgba(180,83,9,0.26)] dark:text-[#fcd34d]',
    info:
      'border-[var(--sl-info-border)] bg-[var(--sl-info-soft)] text-[var(--sl-text-header)]',
  }
  const Icon = icons[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      data-tone={tone}
      className={cn(
        'mb-4 flex flex-wrap items-start justify-between gap-3 rounded-[8px] border px-4 py-3 text-sm',
        styles[tone],
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className={cn(title ? 'mt-0.5 opacity-95' : 'font-medium')}>{children}</div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <span
        aria-hidden="true"
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--sl-bg-subtle)] text-[var(--sl-text-muted)]"
      >
        <Icon size={20} />
      </span>
      <p className="text-sm font-semibold text-[var(--sl-text-header)]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--sl-text-secondary)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function FormField({
  id,
  label,
  required = false,
  helperText,
  error,
  children,
  className,
}: {
  id: string
  label: string
  required?: boolean
  helperText?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-[13px] font-semibold text-[var(--sl-text-header)]', required && 'sl-field-required')}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error text-[13px] font-medium leading-snug">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-[var(--sl-text-muted)]">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}

export function LumoDialog({
  title,
  eyebrow,
  description,
  role = 'dialog',
  size = 'md',
  busy = false,
  onClose,
  footer,
  children,
}: {
  title: string
  eyebrow?: string
  description?: string
  role?: 'dialog' | 'alertdialog'
  size?: 'sm' | 'md' | 'lg'
  busy?: boolean
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  }

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] shadow-[var(--sl-shadow-l)]',
          widths[size],
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--sl-border)] px-6 py-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#0b5ea2] dark:text-[#93c5fd]">
                {eyebrow}
              </p>
            ) : null}
            <h2 id={titleId} className="font-display text-lg font-semibold leading-snug text-[var(--sl-text-header)]">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-xs leading-relaxed text-[var(--sl-text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Close dialog"
            onClick={onClose}
            className="shrink-0 rounded-[6px] p-1.5 text-[var(--sl-text-muted)] transition-colors hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)] disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4 text-sm leading-relaxed">
          {children}
        </div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-6 py-3">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  )
}

export function MoreButton() {
  return (
    <button
      aria-label="More actions"
      className="rounded-[6px] p-2 text-[var(--sl-text-muted)] transition-colors hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]"
    >
      <MoreHorizontal size={17} />
    </button>
  )
}

export function CardLink({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b5ea2] dark:text-[#93c5fd]">
      {children}
      <ArrowUpRight size={13} aria-hidden="true" />
    </span>
  )
}

export function BookCover({ code, accent, className }: { code: string; accent: string; className?: string }) {
  return (
    <div
      className={cn(
        'relative flex aspect-[3/4] items-end overflow-hidden rounded-[8px] bg-gradient-to-br p-3 text-white shadow-sm',
        accent,
        className,
      )}
    >
      <div className="absolute inset-y-0 left-2 w-px bg-white/20" />
      <div className="absolute right-3 top-3 h-5 w-5 rounded-full border border-white/20" />
      <span className="font-display text-xl font-black tracking-tight">{code}</span>
    </div>
  )
}
