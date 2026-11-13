import { AlertTriangle, CheckCircle2, ChevronDown, RefreshCw, ShieldAlert, X, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cn } from '../../components/ui'

export type ConditionInput = 'good' | 'fair' | 'for_repair' | 'damaged' | 'lost'
export type AuditableItem = {
  item_title: string
  accession_number: string
  barcode: string
  availability_status: string
  condition_status?: string
  condition_state?: string
}

export type InventoryAction = {
  label: string
  onSelect: () => void
  disabled?: boolean
  description?: string
  destructive?: boolean
}

export function InventoryActions({ accession, actions }: { accession: string; actions: InventoryAction[] }) {
  const dropdown = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  function close() {
    if (dropdown.current) dropdown.current.open = false
    trigger.current?.focus()
  }

  return <details ref={dropdown} name="inventory-row-actions" className="group w-44 max-w-full" onKeyDown={event => {
    if (event.key === 'Escape' && dropdown.current?.open) { event.stopPropagation(); close() }
  }}>
    <summary ref={trigger} aria-label={`Actions for ${accession}`} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-[#003399]/20 px-3 py-2 text-sm font-semibold text-[#003399] hover:bg-[#003399]/5 dark:border-white/20 dark:text-white dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden">
      Actions <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
    </summary>
    <div className="mt-1 space-y-1 rounded-lg border border-[#003399]/15 bg-white p-1 shadow-sm dark:border-white/15 dark:bg-[#001a4d]">
      {actions.map(action => <button key={action.label} type="button" disabled={action.disabled} title={action.description}
        aria-label={action.destructive ? `Delete ${accession}` : undefined}
        onClick={() => { close(); action.onSelect() }}
        className="block min-h-11 w-full rounded-md px-2 py-2 text-left text-sm text-[#003399] hover:bg-[#003399]/5 disabled:cursor-not-allowed disabled:opacity-45 dark:text-white dark:hover:bg-white/10">
        {action.label}
        {action.disabled && action.destructive && action.description && <span className="mt-1 block text-xs">{action.description}</span>}
      </button>)}
    </div>
  </details>
}

export function ConditionBadge({ condition }: { condition: string }) {
  if (condition === 'Lost') return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#003399] px-2.5 py-1 text-[11px] font-bold text-[#FFFFFF]"><XCircle size={13} /> Lost</span>
  if (condition === 'Damaged' || condition === 'For Repair') return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF200] px-2.5 py-1 text-[11px] font-bold text-[#003399] ring-1 ring-inset ring-[#003399]/20"><AlertTriangle size={13} /> {condition}</span>
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFFFFF] px-2.5 py-1 text-[11px] font-bold text-[#003399] ring-1 ring-inset ring-[#003399]/25"><CheckCircle2 size={13} /> {condition}</span>
}

export function AvailabilityBadge({ status }: { status: string }) {
  const unavailable = status === 'Unavailable' || status === 'Archived'
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset', unavailable ? 'bg-[#003399] text-[#FFFFFF] ring-[#003399]' : status === 'Reserved' ? 'bg-[#FFF200] text-[#003399] ring-[#003399]/20' : 'bg-[#FFFFFF] text-[#003399] ring-[#003399]/25')}>{unavailable ? <ShieldAlert size={13} /> : <CheckCircle2 size={13} />}{status}</span>
}

export function ConditionModal({ copy, onClose, onSaved, saveCondition, initialCondition = 'good' }: { copy: AuditableItem; onClose: () => void; onSaved: () => Promise<void>; saveCondition: (barcode: string, condition: ConditionInput) => Promise<unknown>; initialCondition?: ConditionInput }) {
  const [condition, setCondition] = useState<ConditionInput>(initialCondition)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null)
    try { await saveCondition(copy.barcode, condition); await onSaved(); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update this physical copy.') }
    finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#003399]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="condition-title">
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl shadow-[#003399]/25">
      <div className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]/60">Condition audit</p><h2 id="condition-title" className="mt-1 text-xl font-bold text-[#003399]">Update physical condition</h2></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5"><X size={18} /></button></div>
      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-[#003399]/5 p-4 text-sm text-[#003399]"><p className="font-bold">{copy.item_title}</p><p className="mt-1 text-xs text-[#003399]/65">Accession {copy.accession_number} · Barcode {copy.barcode}</p><p className="mt-2 text-xs">Current: <strong>{copy.condition_status ?? copy.condition_state}</strong> · {copy.availability_status}</p></div>
        {error ? <div className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]" role="alert">{error}</div> : null}
        <fieldset><legend className="mb-2 text-sm font-bold text-[#003399]">New condition</legend><div className="grid grid-cols-2 gap-3">{(['good', 'fair', 'for_repair', 'damaged', 'lost'] as const).map((value) => <label key={value} className={cn('cursor-pointer rounded-xl border p-4 text-sm font-bold transition', condition === value ? 'border-[#003399] bg-[#FFF200] text-[#003399]' : 'border-[#003399]/15 bg-[#FFFFFF] text-[#003399]')}><input className="sr-only" type="radio" name="condition" value={value} checked={condition === value} onChange={() => setCondition(value)} />{value === 'lost' ? <XCircle className="mb-2" size={20} /> : value === 'damaged' || value === 'for_repair' ? <AlertTriangle className="mb-2" size={20} /> : <CheckCircle2 className="mb-2" size={20} />}<span className="capitalize">{value.replace('_', ' ')}</span></label>)}</div></fieldset>
        <div className="flex gap-3 rounded-xl border border-[#003399]/20 bg-[#FFF200]/40 p-3 text-xs leading-5 text-[#003399]"><ShieldAlert className="mt-0.5 shrink-0" size={17} /><p>{condition === 'lost' ? <>Lost is the only automatic exception: availability will be forced to <strong>Unavailable</strong> and this copy will leave reservation allocation.</> : <>Availability remains <strong>{copy.availability_status}</strong>. Use the separate availability control to change it manually.</>}</p></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#003399]/15 p-5"><button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-[#003399]/20 px-4 text-sm font-bold text-[#003399] disabled:opacity-50">Cancel</button><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? <RefreshCw className="animate-spin" size={15} /> : <ShieldAlert size={15} />}{saving ? 'Updating…' : 'Confirm override'}</button></div>
    </form>
  </div>
}

export function AvailabilityConfirmationDialog({
  copy, saving, error, onCancel, onConfirm,
}: {
  copy: AuditableItem
  saving: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const confirmButton = useRef<HTMLButtonElement>(null)
  const nextStatus = copy.availability_status.toLowerCase() === 'available' ? 'Unavailable' : 'Available'
  const becomingUnavailable = nextStatus === 'Unavailable'

  useEffect(() => {
    confirmButton.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel, saving])

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#003399]/60 p-4" role="presentation">
    <section className="w-full max-w-md overflow-hidden rounded-2xl border border-[#003399]/20 bg-[#FFFFFF] shadow-2xl shadow-[#003399]/30" role="alertdialog" aria-modal="true" aria-labelledby="availability-dialog-title" aria-describedby="availability-dialog-description">
      <div className="flex items-start gap-4 border-b border-[#003399]/15 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]"><ShieldAlert size={22} /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]/60">Availability control</p><h2 id="availability-dialog-title" className="mt-1 text-xl font-black text-[#003399]">Make copy {nextStatus.toLowerCase()}?</h2></div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Close confirmation" className="rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5 disabled:opacity-40"><X size={18} /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-[#003399]/5 p-4 text-[#003399]"><p className="font-bold">{copy.item_title}</p><p className="mt-1 text-xs text-[#003399]/65">Accession {copy.accession_number} · Barcode {copy.barcode}</p><p className="mt-2 text-xs">Current availability: <strong>{copy.availability_status}</strong></p></div>
        <div id="availability-dialog-description" className="flex gap-3 rounded-xl border border-[#003399]/20 bg-[#FFF200]/45 p-4 text-sm leading-6 text-[#003399]">
          {becomingUnavailable ? <ShieldAlert className="mt-0.5 shrink-0" size={19} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={19} />}
          <p>{becomingUnavailable ? <>This copy will be hidden from student search availability and cannot be assigned to new reservations.</> : <>This copy will return to active search results and may be assigned to a student reservation.</>}</p>
        </div>
        {error ? <div className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]" role="alert">{error}</div> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#003399]/15 p-5">
        <button type="button" onClick={onCancel} disabled={saving} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399] disabled:opacity-40">Cancel</button>
        <button ref={confirmButton} type="button" onClick={onConfirm} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? <RefreshCw className="animate-spin" size={15} /> : becomingUnavailable ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}{saving ? 'Updating…' : `Confirm ${nextStatus.toLowerCase()}`}</button>
      </div>
    </section>
  </div>
}
