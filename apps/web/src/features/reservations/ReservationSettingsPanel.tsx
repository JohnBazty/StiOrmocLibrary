import { useEffect, useId, useRef, useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { catalogInput } from '../catalog/CatalogDetailsPanel'
import { reservationApi, type ReservationSettingsView } from './reservation-api'

const message = (e: unknown) => e instanceof Error ? e.message : 'Unable to save this setting.'
function lastChanged(by: string | null, at: string | null) {
  if (!at) return 'Default'
  return `Last changed by ${by ?? 'a librarian'} on ${new Date(at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })}`
}

function SettingCard({ title, action, label, help, min, max, initial, status, onSave, anchor }: { title: string; action: string; label: string; help: string; min: number; max: number; initial: string; status: string; onSave: (value: string) => Promise<void>; anchor?: string }) {
  const [value, setValue] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const id = useId(), helpId = `${id}-help`, errorId = `${id}-error`
  const field = useRef<HTMLInputElement>(null)
  // A shortcut link such as #pickup-window lands on this setting once it has loaded.
  useEffect(() => { if (anchor && window.location.hash === `#${anchor}`) { field.current?.scrollIntoView?.({ block: 'center' }); field.current?.focus({ preventScroll: true }) } }, [anchor])
  async function save() { setBusy(true); setError(''); try { await onSave(value) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  return <SectionCard className="space-y-3 p-4">
    <h2 className="text-lg font-bold">{title}</h2>
    <label className="block" id={anchor}>{label}<input ref={field} type="number" min={min} max={max} step={1} className={catalogInput} value={value} onChange={e => setValue(e.target.value)}
      aria-invalid={error ? true : undefined} aria-describedby={error ? `${helpId} ${errorId}` : helpId} /></label>
    <p id={helpId} className="text-sm">{help}</p>
    {error && <p id={errorId} role="alert" className="rounded-xl bg-[#b42318] p-3 text-white">{error}</p>}
    <div className="flex flex-wrap items-center gap-3"><Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : action}</Button><span role="status" className="text-sm">{status}</span></div>
  </SectionCard>
}

export function ReservationSettingsPanel() {
  const [view, setView] = useState<ReservationSettingsView | null>(null), [error, setError] = useState('')
  const [roleTab, setRoleTab] = useState<'Student' | 'Faculty'>('Student')
  useEffect(() => {
    let live = true
    reservationApi.settings().then(v => { if (live) setView(v) }).catch(e => { if (live) setError(message(e)) })
    return () => { live = false }
  }, [])
  if (error) return <p role="alert" className="rounded-xl bg-[#b42318] p-3 text-white">{error}</p>
  if (!view) return <p>Loading reservation settings…</p>
  const tabClass = (active: boolean) => `rounded-lg px-3.5 py-2 text-sm font-semibold transition ${active ? 'bg-[#0b5ea2] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`
  return <div className="space-y-4">
    <div role="tablist" aria-label="Borrower policy role" className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
      <button type="button" role="tab" aria-selected={roleTab === 'Student'} className={tabClass(roleTab === 'Student')} onClick={() => setRoleTab('Student')}>Student</button>
      <button type="button" role="tab" aria-selected={roleTab === 'Faculty'} className={tabClass(roleTab === 'Faculty')} onClick={() => setRoleTab('Faculty')}>Faculty</button>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <SettingCard anchor="pickup-window" title="Pickup window" action="Save pickup window" label="Pickup window (days)" min={1} max={7} initial={String(view.pickupWindowDays)}
        help="How long a book marked ready is held for the borrower, from 1 to 7 days."
        status={lastChanged(view.pickupWindowChangedBy, view.pickupWindowChangedAt)}
        onSave={async value => setView(await reservationApi.saveSettings({ pickupWindowDays: value }))} />
      {roleTab === 'Student' ? (
        <SettingCard key="student-waiting" title="Waiting-list limit" action="Save waiting-list limit" label="Waiting-list limit (days)" min={7} max={90} initial={view.waitingExpiryDays === null ? '' : String(view.waitingExpiryDays)}
          help="How many days a reservation can wait for a copy before it expires, from 7 to 90. Leave it blank so waiting reservations never expire. Any save restarts the count for every waiting reservation."
          status={lastChanged(view.waitingExpiryChangedBy, view.waitingExpiryChangedAt)}
          onSave={async value => setView(await reservationApi.saveSettings({ waitingExpiryDays: value }))} />
      ) : (
        <SettingCard key="faculty-waiting" title="Faculty waiting-list limit" action="Save faculty waiting-list limit" label="Faculty waiting-list limit (days)" min={7} max={180} initial={view.facultyWaitingExpiryDays == null ? '' : String(view.facultyWaitingExpiryDays)}
          help="How many days a faculty reservation can wait before it expires, from 7 to 180. Leave it blank so faculty waiting requests never expire."
          status={view.facultyWaitingExpiryDays == null ? 'Never expires (default)' : `${view.facultyWaitingExpiryDays} days`}
          onSave={async value => setView(await reservationApi.saveSettings({ facultyWaitingExpiryDays: value }))} />
      )}
    </div>
  </div>
}
