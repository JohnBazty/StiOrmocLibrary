import { ArrowLeft, BookOpen, CheckCircle2, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/ui'
import { deskCirculationApi, type ReturnPreview } from './desk-circulation-api'

export function CirculationReturnDialog({ barcode, onClose, onReturned }: {
  barcode: string; onClose: () => void; onReturned: (message: string) => void
}) {
  const [preview, setPreview] = useState<ReturnPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [assessment, setAssessment] = useState(false)
  const [condition, setCondition] = useState('')
  const [note, setNote] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const saving = useRef(false)
  const key = useRef(crypto.randomUUID())
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!saving.current) close.current() }
      if (event.key !== 'Tab') return
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? [])]
      if (!controls.length) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === dialog.current)) {
        event.preventDefault(); controls.at(-1)?.focus()
      } else if (!event.shiftKey && (document.activeElement === controls.at(-1) || document.activeElement === dialog.current)) {
        event.preventDefault(); controls[0].focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus() }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setPreview(null)
    deskCirculationApi.returnPreview(barcode).then(result => {
      if (active) { setPreview(result); key.current = crypto.randomUUID() }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'This loan could not be found.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [barcode, attempt])

  async function confirm() {
    if (!preview || saving.current || loading) return
    saving.current = true; setBusy(true); setError('')
    try {
      const result = await deskCirculationApi.returnCopy(preview, key.current, assessment ? condition : '', assessment ? note : '')
      onReturned(`${result.title} returned.${result.assessmentNeeded ? ' Condition assessment is required; this copy is unavailable.' : ''}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Return could not be saved. Please retry.')
    } finally { saving.current = false; setBusy(false) }
  }

  return createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0b5ea2]/60 p-3 backdrop-blur-sm sm:p-6">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="return-review-heading" aria-describedby="return-review-help" tabIndex={-1} className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white text-[#0b5ea2] shadow-2xl outline-none dark:bg-[#001a4d] dark:text-white">
      <header className="flex items-center justify-between border-b border-[#0b5ea2]/10 p-5 dark:border-white/15">
        <div><p className="text-[10px] font-bold uppercase tracking-[.18em] opacity-60">Book return</p><h2 id="return-review-heading" className="mt-1 text-2xl font-bold">Review & return</h2></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close return" className="rounded-xl p-2 hover:bg-[#0b5ea2]/5 disabled:opacity-40 dark:hover:bg-white/10"><X size={21} /></button>
      </header>
      <div className="space-y-4 overflow-y-auto p-5">
        <p id="return-review-help" className="text-sm opacity-75">Match this barcode to the book in your hand, then confirm its return.</p>
        <p className="break-all rounded-xl bg-[#0b5ea2]/5 p-3 font-mono text-sm font-bold dark:bg-white/10">{barcode}</p>
        {loading ? <p role="status" className="flex items-center gap-2 py-6 text-sm"><LoaderCircle className="animate-spin" size={18} /> Finding the borrower…</p> : null}
        {error ? <div role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</div> : null}
        {!loading && !preview ? <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Try lookup again</Button> : null}
        {preview ? <>
          <div className="rounded-2xl border border-[#0b5ea2]/15 p-4 dark:border-white/15">
            <div className="flex items-start gap-3"><BookOpen className="mt-1 shrink-0" size={21} /><div className="min-w-0"><h3 className="break-words text-lg font-bold">{preview.title}</h3><p className="mt-1 text-xs opacity-65">{preview.kind === 'InLibrary' ? 'In-library use' : 'Take-home loan'} · {preview.status}</p></div></div>
            <dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-xs opacity-60">Borrower</dt><dd className="font-semibold">{preview.borrower.name} · {preview.borrower.schoolId}</dd></div><div><dt className="text-xs opacity-60">Due / hand-back</dt><dd>{new Date(preview.dueAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}</dd></div><div><dt className="text-xs opacity-60">Recorded condition</dt><dd>{preview.condition}</dd></div></dl>
          </div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={assessment} disabled={busy} onChange={event => { setAssessment(event.target.checked); key.current = crypto.randomUUID() }} className="h-4 w-4 accent-[#0b5ea2]" />Record damage or a condition change</label>
          {assessment ? <div className="space-y-3 rounded-xl border border-[#0b5ea2]/15 p-4 dark:border-white/15"><label className="block text-sm font-semibold">Condition<select value={condition} disabled={busy} onChange={event => { setCondition(event.target.value); key.current = crypto.randomUUID() }} className="mt-2 w-full rounded-xl border border-[#0b5ea2]/20 bg-white p-3 text-[#0b5ea2]"><option value="">Choose condition</option><option>Good</option><option>Worn</option><option>Damaged</option></select></label><label className="block text-sm font-semibold">Assessment note{condition === 'Damaged' ? <span className="ml-2 text-xs font-normal opacity-65">Required for damage</span> : null}<input value={note} maxLength={500} placeholder="Describe the condition" disabled={busy} onChange={event => { setNote(event.target.value); key.current = crypto.randomUUID() }} className="mt-2 w-full rounded-xl border border-[#0b5ea2]/20 bg-white p-3 text-[#0b5ea2]" /></label></div> : null}
          <p className="text-xs opacity-65">Any applicable fines are calculated using the library’s existing rules.</p>
        </> : null}
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-[#0b5ea2]/10 p-4 sm:flex-row sm:justify-end dark:border-white/15">
        <Button variant="secondary" disabled={busy} onClick={onClose}><ArrowLeft size={16} /> Back</Button>
        <Button disabled={loading || busy || !preview || (assessment && (!condition || (condition === 'Damaged' && !note.trim())))} onClick={() => void confirm()}><CheckCircle2 size={17} />{busy ? 'Saving return…' : 'Confirm return'}</Button>
      </footer>
    </div>
  </div>, document.body)
}
