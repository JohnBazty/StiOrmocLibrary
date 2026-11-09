import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'

export function CancelBorrowRequestDialog({ title, busy, error, onCancel, onConfirm }: {
  title: string
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return <div role="dialog" aria-modal="true" aria-labelledby="cancel-request-title" className="fixed inset-0 z-[120] flex items-center justify-center bg-[#003399]/60 p-4">
    <div className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-rose-600">Pending request</p><h2 id="cancel-request-title" className="mt-1 text-xl font-black text-[#003399]">Cancel counter claim?</h2></div><button disabled={busy} aria-label="Close cancellation" onClick={onCancel} className="rounded-xl p-2 text-[#003399] disabled:opacity-40"><X size={19} /></button></header>
      <div className="space-y-4 p-5"><div className="flex gap-3 rounded-xl bg-rose-50 p-4 text-rose-700"><AlertTriangle className="shrink-0" size={19} /><p className="text-sm">Cancel <strong>{title}</strong>? Its physical copy will be released for other catalog users.</p></div>{error ? <div role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{error}</div> : null}<label className="block text-xs font-bold uppercase text-[#003399]">Reason (optional)<textarea value={reason} maxLength={255} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-[#003399]/20 p-3 text-sm font-normal text-[#003399] outline-none focus:border-[#003399]" placeholder="Student cancelled or did not proceed" /></label></div>
      <footer className="flex justify-end gap-2 border-t border-[#003399]/15 p-4"><button disabled={busy} onClick={onCancel} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399] disabled:opacity-40">Keep request</button><button disabled={busy} onClick={() => onConfirm(reason)} className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Cancelling…' : 'Cancel request'}</button></footer>
    </div>
  </div>
}
