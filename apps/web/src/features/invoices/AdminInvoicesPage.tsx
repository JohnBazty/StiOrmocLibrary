import { useEffect, useState, type FormEvent } from 'react'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { downloadInvoice, invoiceApi, invoiceSchemaPending, type Invoice, type InvoiceSetup } from './invoice-api'

const field = 'w-full rounded-xl border border-[#003399]/20 bg-white px-3 py-2 text-sm text-[#003399]'
const choices = ['Unclassified', 'Invoiceable', 'Acknowledgment Only']

export function AdminInvoicesPage() {
  const [setup, setSetup] = useState<InvoiceSetup | null>(null)
  const [rows, setRows] = useState<Invoice[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'pending' | 'error'>('loading')
  async function load() {
    setLoadState('loading')
    try {
      const [nextSetup, nextRows] = await Promise.all([invoiceApi.setup(), invoiceApi.list()])
      setSetup(nextSetup); setRows(nextRows); setError('')
      setLoadState(nextSetup ? 'ready' : 'pending')
    } catch (cause) {
      setSetup(null); setRows([])
      setError(cause instanceof Error ? cause.message : 'Invoice records are unavailable.')
      setLoadState(invoiceSchemaPending(cause) ? 'pending' : 'error')
    }
  }
  useEffect(() => { void load() }, [])
  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const form = new FormData(event.currentTarget)
    try {
      await invoiceApi.configure({ issuerName: form.get('issuerName'), issuerAddress: form.get('issuerAddress'), issuerTin: form.get('issuerTin'), authorityReference: form.get('authorityReference'), serialPrefix: form.get('serialPrefix'), serialStart: Number(form.get('serialStart')), serialEnd: Number(form.get('serialEnd')), printClassification: form.get('printClassification'), fineClassification: form.get('fineClassification'), approved: form.get('approved') === 'on' })
      setNotice('Finance classification and issuer setup saved.'); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The setup could not be saved.') } finally { setBusy(false) }
  }
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const form = new FormData(event.currentTarget)
    try { const row = await invoiceApi.issue(String(form.get('sourceType')) as 'Printing' | 'Fine Collection', Number(form.get('sourceId'))); setNotice(`Invoice ${row.invoice_number} is available.`); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The invoice could not be issued.') } finally { setBusy(false) }
  }
  async function voidInvoice(row: Invoice) {
    const reason = window.prompt(`Reason for voiding ${row.invoice_number} (at least 10 characters):`)?.trim()
    if (!reason || reason.length < 10) return
    setBusy(true)
    try { await invoiceApi.void(row.invoice_id, reason); setNotice(`${row.invoice_number} was voided and retained for audit.`); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The invoice could not be voided.') } finally { setBusy(false) }
  }
  if (loadState !== 'ready') return <div className="space-y-5">
    <PageHeader eyebrow="Finance records" title="Invoices" action={<Button variant="secondary" onClick={() => void load()}>Refresh</Button>} />
    <SectionCard className="p-5"><div role="status">
      <h2 className="font-bold text-[#003399]">{loadState === 'loading' ? 'Checking invoice setup…' : loadState === 'pending' ? 'Invoices are not ready yet' : 'Invoices could not be loaded'}</h2>
      <p className="mt-2 text-sm text-[#003399]/70">{loadState === 'pending' ? 'The connected Supabase database does not have the invoice setup yet. No invoice can be issued here. Existing payment history is still available in Fines and Printing.' : loadState === 'error' ? error : 'Please wait while the invoice records load.'}</p>
    </div></SectionCard>
  </div>
  return <div className="space-y-5"><PageHeader eyebrow="Finance records" title="Invoices" description="Issue invoices only after the school finance team approves the issuer, format, serial range, and payment classification." action={<Button variant="secondary" onClick={() => void load()}>Refresh</Button>} />
    {error ? <p role="alert" className="rounded-xl bg-[#FFF200] p-3 font-semibold text-[#003399]">{error}</p> : null}{notice ? <p role="status" className="rounded-xl border border-[#003399]/20 p-3 text-[#003399]">{notice}</p> : null}
    {setup ? <SectionCard className="p-5"><h2 className="font-bold text-[#003399]">Approved issuer and classification</h2><p className="mt-1 text-sm text-[#003399]/70">Leave approval off until finance confirms the legal details. Historical payment records stay available separately.</p><form onSubmit={configure} className="mt-4 grid gap-3 sm:grid-cols-2">{([['issuerName','Issuer name',setup.issuer_name],['issuerAddress','Issuer address',setup.issuer_address],['issuerTin','Tax identification number',setup.issuer_tin],['authorityReference','Authority or permit reference',setup.authority_reference],['serialPrefix','Invoice serial prefix',setup.serial_prefix],['serialStart','First approved serial',setup.serial_start],['serialEnd','Last approved serial',setup.serial_end]] as const).map(([name,label,value]) => <label key={name} className="text-sm font-semibold text-[#003399]">{label}<input name={name} defaultValue={value} className={`${field} mt-1`} required={name !== 'issuerAddress'} type={name.startsWith('serial') && name !== 'serialPrefix' ? 'number' : 'text'} /></label>)}{([['printClassification','Printing payments',setup.print_classification],['fineClassification','Fine collections',setup.fine_classification]] as const).map(([name,label,value]) => <label key={name} className="text-sm font-semibold text-[#003399]">{label}<select name={name} defaultValue={value} className={`${field} mt-1`}>{choices.map((choice) => <option key={choice}>{choice}</option>)}</select></label>)}<label className="flex items-center gap-2 text-sm font-bold text-[#003399]"><input name="approved" type="checkbox" defaultChecked={Boolean(setup.approved)} /> Finance approval confirmed</label><Button type="submit" disabled={busy}>Save issuer setup</Button></form></SectionCard> : null}
    <SectionCard className="p-5">{setup?.issuanceEnabled && setup.approved ? <><h2 className="font-bold text-[#003399]">Issue for an existing payment record</h2><p className="mt-1 text-sm text-[#003399]/70">Enter the payment record ID shown in the printing or fines panel. Issuing the same payment again returns its existing invoice.</p><form onSubmit={issue} className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold text-[#003399]">Payment type<select name="sourceType" className={`${field} mt-1`}><option>Printing</option><option>Fine Collection</option></select></label><label className="text-sm font-semibold text-[#003399]">Payment record ID<input name="sourceId" className={`${field} mt-1`} type="number" min="1" required /></label><Button type="submit" disabled={busy}>Issue invoice</Button></form></> : <><h2 className="font-bold text-[#003399]">Invoice issuing is off</h2><p className="mt-1 text-sm text-[#003399]/70">The school must approve the invoice format and finance setup before invoices can be issued. Existing payments remain in their original records.</p></>}</SectionCard>
    <SectionCard className="overflow-hidden"><h2 className="border-b border-[#003399]/10 p-5 font-bold text-[#003399]">Issued invoice ledger</h2><div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr>{['Invoice','Customer','Source','Amount','Status','Actions'].map((label) => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.invoice_id} className="border-b border-[#003399]/10"><td className="p-3 font-bold">{row.invoice_number}</td><td className="p-3">{row.customer_name}<br />{row.customer_school_id}</td><td className="p-3">{row.source_type} #{row.source_id}</td><td className="p-3">₱{Number(row.amount).toFixed(2)}</td><td className="p-3">{row.status}</td><td className="flex gap-2 p-3"><Button variant="secondary" onClick={() => void downloadInvoice(row.invoice_id, true).catch((cause) => setError(String(cause)))}>PDF</Button>{row.status === 'Issued' ? <Button variant="secondary" disabled={busy} onClick={() => void voidInvoice(row)}>Void</Button> : null}</td></tr>)}</tbody></table></div>{!rows.length ? <p className="p-5 text-sm text-[#003399]/65">No invoices issued yet.</p> : null}</SectionCard>
  </div>
}
