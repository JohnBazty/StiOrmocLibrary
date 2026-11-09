import { Archive, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { InventoryApiError } from './inventory-api'
import type { InventoryRemovalTarget } from './types'

type RemovalAction = 'deleted' | 'archived'

export function InventoryRemovalDialog({
  target,
  deleteItem,
  archiveItem,
  onCancel,
  onCompleted,
}: {
  target: InventoryRemovalTarget
  deleteItem: () => Promise<unknown>
  archiveItem: (reason: string) => Promise<unknown>
  onCancel: () => void
  onCompleted: (action: RemovalAction) => Promise<void>
}) {
  const [mode, setMode] = useState<'delete' | 'archive'>('delete')
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmationInput = useRef<HTMLInputElement>(null)
  const archiveReasonInput = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (mode === 'delete') confirmationInput.current?.focus()
    else archiveReasonInput.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mode, onCancel, saving])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (mode === 'delete') {
        await deleteItem()
        await onCompleted('deleted')
      } else {
        await archiveItem(reason.trim())
        await onCompleted('archived')
      }
    } catch (caught) {
      if (
        mode === 'delete'
        && caught instanceof InventoryApiError
        && (caught.code === 'PHYSICAL_COPY_REQUIRES_ARCHIVE' || caught.code === 'THESIS_REQUIRES_ARCHIVE')
      ) {
        setMode('archive')
        setError(`${caught.message} Enter an archive reason to continue without deleting its history.`)
      } else {
        setError(caught instanceof Error ? caught.message : 'The inventory record could not be removed.')
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteConfirmed = confirmation.trim() === target.accession_number
  const canSubmit = mode === 'delete' ? deleteConfirmed : reason.trim().length > 0

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#003399]/65 p-4" role="presentation">
    <form onSubmit={submit} className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#003399]/20 bg-[#FFFFFF] shadow-2xl shadow-[#003399]/35" role="alertdialog" aria-modal="true" aria-labelledby="removal-dialog-title">
      <div className="flex items-start gap-4 border-b border-[#003399]/15 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]">{mode === 'delete' ? <Trash2 size={22} /> : <Archive size={22} />}</span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]/60">Inventory removal</p><h2 id="removal-dialog-title" className="mt-1 text-xl font-black text-[#003399]">{mode === 'delete' ? `Delete ${target.kind} copy?` : `Archive ${target.kind} copy?`}</h2></div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Close removal dialog" className="rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5 disabled:opacity-40"><X size={18} /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-[#003399]/5 p-4 text-[#003399]"><p className="font-bold">{target.item_title}</p><p className="mt-1 text-xs text-[#003399]/65">Accession {target.accession_number} · Barcode {target.barcode}</p></div>
        <div className="flex gap-3 rounded-xl border border-[#003399]/20 bg-[#FFF200]/45 p-4 text-sm leading-6 text-[#003399]"><ShieldAlert className="mt-0.5 shrink-0" size={19} /><p>{mode === 'delete' ? <>Permanent deletion is allowed only when this copy has never been borrowed, reserved, or audited. Records with history must be archived.</> : <>Archiving hides the copy from active inventory, reports, student searches, and reservation allocation while preserving its history.</>}</p></div>
        {error ? <div className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]" role="alert">{error}</div> : null}
        {mode === 'delete' ? <label className="block text-sm font-bold text-[#003399]">Type <span className="font-mono">{target.accession_number}</span> to confirm<input ref={confirmationInput} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-2 h-11 w-full rounded-xl border border-[#003399]/25 bg-[#FFFFFF] px-3 font-mono text-sm text-[#003399] outline-none focus:ring-2 focus:ring-[#003399]/20" /></label> : <label className="block text-sm font-bold text-[#003399]">Archive reason<textarea ref={archiveReasonInput} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} rows={3} className="mt-2 w-full resize-none rounded-xl border border-[#003399]/25 bg-[#FFFFFF] p-3 text-sm font-normal text-[#003399] outline-none focus:ring-2 focus:ring-[#003399]/20" placeholder="Explain why this copy is being archived" /></label>}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#003399]/15 p-5"><button type="button" onClick={onCancel} disabled={saving} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399] disabled:opacity-40">Cancel</button><button disabled={saving || !canSubmit} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:cursor-not-allowed disabled:opacity-40">{saving ? <RefreshCw className="animate-spin" size={15} /> : mode === 'delete' ? <Trash2 size={15} /> : <Archive size={15} />}{saving ? 'Processing…' : mode === 'delete' ? 'Delete permanently' : 'Archive copy'}</button></div>
    </form>
  </div>
}
