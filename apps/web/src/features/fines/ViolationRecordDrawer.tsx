import { X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, FormField, NoticeBanner } from '../../components/ui'
import { violationRequest, type Incident } from './violations-api'

const date = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })

/** Record detail beside the list, so the librarian keeps their place in the table. */
export function ViolationRecordDrawer({ item, base, admin, onClose, onSaved }: {
  item: Incident
  base: string
  admin: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [eventType, setEventType] = useState('Correction')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Focus moves in once on open and returns to the row button on close, whatever the parent re-renders.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onCloseRef.current()
      if (event.key !== 'Tab' || !panelRef.current) return
      // Keep Tab and Shift+Tab inside the drawer while it is open.
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => !(el as HTMLButtonElement).disabled)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      // A record opened from a link has no row button to go back to, so the page heading takes focus.
      const back = opener && opener !== document.body && document.contains(opener) ? opener : document.getElementById('violation-records-heading')
      back?.focus?.()
    }
  }, [])

  async function addEvent(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await violationRequest(`${base}/${item.incident_id}/events`, { type: eventType, reason })
      onSaved('Review note saved; original history is preserved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review note could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  const state = item.voided_at ? 'Voided' : item.events.some(e => e.type === 'Resolved') ? 'Resolved' : 'Recorded'

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-slate-950/45" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="violation-drawer-title"
        className="flex h-full w-full max-w-md flex-col border-l border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] shadow-[var(--sl-shadow-l)]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="violation-drawer-title" className="font-display text-lg font-semibold text-[var(--sl-text-header)]">{item.full_name} · {item.category}</h2>
            <p className="text-xs text-[var(--sl-text-muted)]">{item.school_id}</p>
          </div>
          <button ref={closeRef} type="button" aria-label="Close record" onClick={onClose}
            className="shrink-0 rounded-[6px] p-1.5 text-[var(--sl-text-muted)] hover:bg-[var(--sl-bg-hover)]">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="font-semibold">Step</dt>
            <dd>{item.action}{item.source === 'Paper log' ? ' · Paper log' : ''}</dd>
            <dt className="font-semibold">Case</dt>
            <dd>{state}</dd>
            <dt className="font-semibold">When</dt>
            <dd>{date(item.incident_at)}</dd>
            <dt className="font-semibold">Where</dt>
            <dd>{item.location}</dd>
            {item.fine_amount ? (<><dt className="font-semibold">Fine</dt><dd>PHP {Number(item.fine_amount).toFixed(2)} · {item.payment_status}</dd></>) : null}
            {admin ? (<><dt className="font-semibold">Recorded by</dt><dd>{item.recorded_by}</dd></>) : null}
          </dl>
          <div>
            <h3 className="font-semibold">What happened</h3>
            <p className="mt-1 break-words">{item.details}</p>
          </div>
          {item.events.length ? (
            <div>
              <h3 className="font-semibold">Review notes</h3>
              <ul className="mt-1 space-y-1.5">
                {item.events.map((event, index) => <li key={index} className="break-words">{event.type} · {date(event.at)}: {event.reason}</li>)}
              </ul>
            </div>
          ) : null}
          {!admin ? <p>Ask the librarian at the counter if you believe this record needs review.</p> : (
            <form onSubmit={addEvent} className="space-y-3 border-t border-[var(--sl-border)] pt-4">
              <h3 className="font-semibold">Add a review note</h3>
              {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
              <FormField id="vd-action" label="Review action">
                <select id="vd-action" value={eventType} onChange={event => setEventType(event.target.value)} className="sl-input">
                  <option>Correction</option><option>Resolved</option><option>Voided</option>
                </select>
              </FormField>
              <FormField id="vd-reason" label="Reason" required helperText="At least 10 characters. Original facts stay visible; notes do not reset warnings. Money changes use Adjust on Fines & charges.">
                <textarea id="vd-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={1000} required className="sl-input h-24 py-2.5" />
              </FormField>
              <Button type="submit" disabled={busy || reason.trim().length < 10}>{busy ? 'Saving…' : 'Save review note'}</Button>
            </form>
          )}
        </div>
      </aside>
    </div>
  )
}
