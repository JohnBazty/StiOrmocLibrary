import { AlertTriangle, X } from 'lucide-react'

export function ReportLostDialog({ title, busy, error, onCancel, onConfirm }: {
  title: string
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return <div role="dialog" aria-modal="true" aria-labelledby="report-lost-title" className="fixed inset-0 z-[120] flex items-center justify-center bg-[#003399]/60 p-4">
    <div className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#003399]/15 p-5">
        <h2 id="report-lost-title" className="text-xl font-black text-[#003399]">Report this book as lost?</h2>
        <button type="button" disabled={busy} aria-label="Close lost-book report" onClick={onCancel} className="rounded-xl p-2 text-[#003399] disabled:opacity-40"><X size={19} /></button>
      </header>
      <div className="space-y-4 p-5">
        <div className="flex gap-3 rounded-xl bg-[#FFF200] p-4 text-[#003399]"><AlertTriangle className="shrink-0" size={19} /><p className="text-sm">Report <strong>{title}</strong> as lost? Library staff will review the report before confirming any replacement charge.</p></div>
        {error ? <p role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{error}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-[#003399]/15 p-4">
        <button type="button" disabled={busy} onClick={onCancel} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399] disabled:opacity-40">Keep book record</button>
        <button type="button" disabled={busy} onClick={onConfirm} className="h-10 rounded-xl bg-[#003399] px-4 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Submitting…' : 'Submit lost report'}</button>
      </footer>
    </div>
  </div>
}
