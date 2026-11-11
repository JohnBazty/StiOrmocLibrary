import { useEffect, useState } from 'react'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { downloadInvoice, invoiceApi, invoiceSchemaPending, type Invoice } from './invoice-api'

export function MyInvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([])
  const [error, setError] = useState('')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'pending' | 'error'>('loading')
  useEffect(() => { void invoiceApi.mine().then((result) => { setRows(result); setLoadState('ready') }).catch((cause) => { setError(cause instanceof Error ? cause.message : 'Invoices are unavailable.'); setLoadState(invoiceSchemaPending(cause) ? 'pending' : 'error') }) }, [])
  return <div className="space-y-5"><PageHeader eyebrow="My account" title="Invoices" description="Invoices issued for your recorded library payments." />
    {loadState !== 'ready' ? <SectionCard className="p-5"><div role="status"><h2 className="font-bold text-[#003399]">{loadState === 'loading' ? 'Loading invoices…' : loadState === 'pending' ? 'Invoices are not ready yet' : 'Invoices could not be loaded'}</h2><p className="mt-2 text-sm text-[#003399]/70">{loadState === 'pending' ? 'The invoice feature is still being prepared. Your existing payments remain in Printing or Fines.' : loadState === 'error' ? error : 'Please wait while your invoices load.'}</p></div></SectionCard> : <>{error ? <p role="alert" className="rounded-xl bg-[#FFF200] p-3 text-[#003399]">{error}</p> : null}<SectionCard className="divide-y divide-[#003399]/10">{rows.length ? rows.map((row) => <div className="flex flex-wrap items-center justify-between gap-3 p-5" key={row.invoice_id}><div><p className="font-bold text-[#003399]">{row.invoice_number}</p><p className="text-sm text-[#003399]/65">{row.source_type} · {row.status} · ₱{Number(row.amount).toFixed(2)}</p></div><Button variant="secondary" onClick={() => void downloadInvoice(row.invoice_id, false).catch((cause) => setError(String(cause)))}>Download PDF</Button></div>) : <p className="p-5 text-sm text-[#003399]/65">No invoice has been issued for your payments.</p>}</SectionCard></>}
  </div>
}
