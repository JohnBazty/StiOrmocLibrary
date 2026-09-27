import { useEffect, useState, type FormEvent } from 'react'
import { catalogApi } from './catalog-api'

type Quotation = { quotationId: number; filename: string; quotedAmount: number; uploadedAt: string; current: boolean }

export function BookQuotationModal({ titleId, title, onClose }: { titleId: number; title: string; onClose: () => void }) {
  const [items, setItems] = useState<Quotation[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function load() { try { setItems(await catalogApi.quotations(titleId)); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Quotations are unavailable.') } }
  useEffect(() => { void load() }, [titleId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function upload(event: FormEvent) {
    event.preventDefault(); if (!file || busy) return
    setBusy(true); setError('')
    try { await catalogApi.uploadQuotation(titleId, file, Number(amount)); setFile(null); setAmount(''); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Quotation upload failed.') }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#003399]/75 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-label={`Supplier quotations for ${title}`} className="mx-auto my-6 w-full max-w-xl rounded-2xl bg-white p-6 text-[#003399]">
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">Supplier quotations</h2><p className="text-sm">{title}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close quotations" className="font-bold">Close</button></div>
    <p className="mt-4 rounded-xl bg-[#FFF200] p-3 text-sm">A quotation is optional. Upload one only when the supplier provides a replacement price. Earlier versions stay in this history.</p>
    {error ? <p role="alert" className="mt-3 rounded-xl bg-[#FFF200] p-3 text-sm font-bold">{error}</p> : null}
    <div className="mt-4 space-y-2">{items.length ? items.map(item => <div key={item.quotationId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#003399]/20 p-3 text-sm"><div><strong>{item.current ? 'Current quotation' : 'Earlier quotation'} · ₱{item.quotedAmount.toFixed(2)}</strong><p>{item.filename} · {new Date(item.uploadedAt).toLocaleString('en-PH')}</p></div><button type="button" onClick={() => void catalogApi.downloadQuotation(titleId, item.quotationId, item.filename).catch(cause => setError(cause instanceof Error ? cause.message : 'Download failed.'))} className="font-bold underline">Download</button></div>) : <p className="text-sm">No quotation uploaded for this book.</p>}</div>
    <form onSubmit={upload} className="mt-5 space-y-3 border-t border-[#003399]/20 pt-4"><label className="block text-sm font-bold">Supplier quotation file<input required type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full" /></label><label className="block text-sm font-bold">Quoted replacement amount (PHP)<input required type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#003399]/30 px-3" /></label><button disabled={busy || !file} className="rounded-lg bg-[#003399] px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? 'Uploading…' : items.length ? 'Upload newer quotation' : 'Upload quotation'}</button></form>
  </section></div>
}
