import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { reservationApi } from './reservation-api'
import type { ReservationQueueItem, SwapCandidate } from './types'

const MIN_REASON = 5
const MAX_REASON = 500

/** Modal shell: focus moves in, Tab stays inside, Escape closes (unless saving). */
export function DialogShell({ titleId, title, busy, onClose, children }: { titleId: string; title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null)
  const state = useRef({ busy, onClose })
  useLayoutEffect(() => { state.current = { busy, onClose } })
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!state.current.busy) state.current.onClose(); return }
      if (event.key !== 'Tab') return
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])') ?? [])]
      if (!controls.length) { event.preventDefault(); return }
      const first = controls[0], last = controls[controls.length - 1], active = document.activeElement
      if (event.shiftKey && (active === first || active === dialog.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (active === last || active === dialog.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus() }
  }, [])
  return <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex items-center justify-center bg-[#001b50]/60 p-4">
    <div ref={dialog} tabIndex={-1} className="w-full max-w-md"><SectionCard className="p-6"><h2 id={titleId} className="text-xl font-bold">{title}</h2>{children}</SectionCard></div>
  </div>
}

type DialogProps = { item: ReservationQueueItem; onClose: () => void; onDone: (message: string) => void }

export function SwapCopyDialog({ item, onClose, onDone }: DialogProps) {
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    reservationApi.swapCandidates(item.reservationId).then(list => { if (active) setCandidates(list) })
      .catch(reason => { if (active) { setCandidates([]); setError(reason instanceof Error ? reason.message : 'Could not load copies.') } })
    return () => { active = false }
  }, [item.reservationId])
  async function confirm() {
    if (chosen === null || busy) return
    setBusy(true); setError('')
    try { await reservationApi.swapCopy(item.reservationId, chosen); onDone(`${item.materialTitle}: copy swapped. The pickup deadline is unchanged.`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The copy could not be swapped.'); setBusy(false) }
  }
  const others = (candidates ?? []).filter(c => c.physicalCopyId !== item.assignedCopyId)
  return <DialogShell titleId="swap-copy-title" title="Swap copy" busy={busy} onClose={onClose}>
    <p className="my-3 text-sm">{item.materialTitle} for {item.userName}. Pick another available copy of this title. The pickup deadline does not change.</p>
    {error ? <p role="alert" className="auth-error mb-3 rounded-xl p-3 text-sm">{error}</p> : null}
    {candidates === null ? <p>Loading copies…</p> : others.length ? <fieldset className="mb-4 grid gap-2"><legend className="mb-1 text-sm font-semibold">Eligible copies</legend>
      {others.map(c => <label key={c.physicalCopyId} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#003399]/20 p-2 text-sm">
        <input type="radio" name="swap-copy" checked={chosen === c.physicalCopyId} onChange={() => setChosen(c.physicalCopyId)} />
        <span><span className="font-mono font-bold">{c.barcode ?? 'No barcode'}</span> · {c.accessionNumber ?? 'No accession'} · {c.shelfLocation ?? 'Location not recorded'}</span>
      </label>)}</fieldset> : error ? null : <p className="mb-4 text-sm">No other copy is available to swap to.</p>}
    <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>Close</Button><Button disabled={busy || chosen === null} onClick={() => void confirm()}>{busy ? 'Working…' : 'Swap copy'}</Button></div>
  </DialogShell>
}

