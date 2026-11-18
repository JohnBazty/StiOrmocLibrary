import { useEffect, useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { catalogInput } from '../catalog/CatalogDetailsPanel'
import { reservationApi, type ReservationSettingsView } from './reservation-api'

const message = (e: unknown) => e instanceof Error ? e.message : 'Unable to save this setting.'
function lastChanged(by: string | null, at: string | null) {
  if (!at) return 'Default'
  return `Last changed by ${by ?? 'a librarian'} on ${new Date(at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })}`
}

function SettingCard({ title, label, help, min, max, initial, status, onSave }: { title: string; label: string; help: string; min: number; max: number; initial: string; status: string; onSave: (value: string) => Promise<void> }) {
  const [value, setValue] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save() { setBusy(true); setError(''); try { await onSave(value) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  return <SectionCard className="space-y-3 p-4">
    <h2 className="text-lg font-bold">{title}</h2>
    <label className="block">{label}<input type="number" min={min} max={max} step={1} className={catalogInput} value={value} onChange={e => setValue(e.target.value)} /></label>
    <p className="text-sm">{help}</p>
    {error && <p role="alert" className="rounded-xl bg-[#b42318] p-3 text-white">{error}</p>}
    <div className="flex flex-wrap items-center gap-3"><Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : `Save ${title.toLowerCase()}`}</Button><span className="text-sm">{status}</span></div>
  </SectionCard>
}

export function ReservationSettingsPanel() {
  const [view, setView] = useState<ReservationSettingsView | null>(null), [error, setError] = useState('')
  useEffect(() => { reservationApi.settings().then(setView).catch(e => setError(message(e))) }, [])
  if (error) return <p role="alert" className="rounded-xl bg-[#b42318] p-3 text-white">{error}</p>
  if (!view) return <p>Loading reservation settings…</p>
  return <div className="grid gap-4 lg:grid-cols-2">
    <SettingCard title="Pickup window" label="Pickup window (days)" min={1} max={7} initial={String(view.pickupWindowDays)}
      help="How long a book marked ready is held for the borrower, from 1 to 7 days."
      status={lastChanged(view.pickupWindowChangedBy, view.pickupWindowChangedAt)}
      onSave={async value => setView(await reservationApi.saveSettings({ pickupWindowDays: value }))} />
  </div>
}
