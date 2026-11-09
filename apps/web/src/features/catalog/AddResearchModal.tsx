import { type FormEvent, useState } from 'react'
import { QrCode, X } from 'lucide-react'
import { ApiError, catalogApi } from './catalog-api'
import type { BulkBookResult } from './types'
import { BookLabelSheet } from './BookLabelSheet'

const fieldClass = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#003399]'
function Input({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return <label><span className={labelClass}>{label}{required ? ' *' : ''}</span><input name={name} required={required} className={fieldClass} /></label>
}

export function AddResearchModal({ locations, onCreated, onClose }: { locations: string[]; onCreated: () => Promise<void> | void; onClose: () => void }) {
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [batch, setBatch] = useState<BulkBookResult | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || batch) return
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    setSaving(true); setErrors({}); setMessage('')
    try {
      const result = await catalogApi.createThesis({
        title: data.title, authors: [data.author], adviser: data.adviser, year: data.year,
        abstract: data.abstract, researchCode: data.researchCode,
        departmentOrProgram: data.departmentOrProgram, keywords: data.keywords,
        copy: { shelfLocation: data.shelfLocation },
      })
      setBatch(result); setMessage('Research inventory record and unique QR/barcode label created.')
      await onCreated()
    } catch (reason) {
      const error = reason as ApiError
      setErrors(error.details?.errors ?? {}); setMessage(error.message || 'The research record could not be published.')
    } finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#003399]/80 p-4"><div role="dialog" aria-modal="true" className="mx-auto my-6 max-w-4xl rounded-2xl bg-[#FFFFFF] shadow-2xl">
    <header className="flex items-center justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase text-[#003399]">Catalog entry</p><h2 className="text-xl font-black text-[#003399]">Add research / thesis</h2></div><button aria-label="Close" disabled={saving} onClick={onClose} className="p-2 text-[#003399] disabled:opacity-40"><X /></button></header>
    <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
      {message ? <div role={batch ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm font-semibold text-[#003399] sm:col-span-2 ${batch ? 'border border-[#003399] bg-[#FFFFFF]' : 'bg-[#FFF200]'}`}>{message}</div> : null}
      {Object.keys(errors).length ? <div role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm text-[#003399] sm:col-span-2"><ul className="list-inside list-disc">{Object.entries(errors).map(([field, value]) => <li key={field}><strong>{field}:</strong> {value}</li>)}</ul></div> : null}
      <Input label="Title" name="title" required /><Input label="Author" name="author" required />
      <Input label="Research code" name="researchCode" required /><Input label="Year" name="year" required />
      <Input label="Adviser" name="adviser" required /><Input label="Department / program" name="departmentOrProgram" required />
      <Input label="Keywords" name="keywords" />
      <label><span className={labelClass}>Shelf location *</span><select name="shelfLocation" required className={fieldClass}><option value="">Select existing shelf location</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
      <div className="rounded-xl border border-[#003399]/15 bg-[#FFF200] p-3 text-xs font-semibold text-[#003399] sm:col-span-2">New publications start in Good condition. Accession number, inventory barcode, and QR code are generated automatically.</div>
      <label className="sm:col-span-2"><span className={labelClass}>Abstract *</span><textarea name="abstract" required minLength={20} rows={6} className={`${fieldClass} h-auto py-3`} /></label>
      <div className="flex justify-end gap-2 sm:col-span-2">{!batch ? <><button type="button" disabled={saving} onClick={onClose} className="h-11 rounded-xl border border-[#003399] bg-[#FFFFFF] px-5 font-bold text-[#003399]">Cancel</button><button disabled={saving || !locations.length} type="submit" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#003399] px-5 font-bold text-[#FFFFFF] disabled:opacity-50"><QrCode size={17} />{saving ? 'Publishing and generating codes…' : 'Publish and generate codes'}</button></> : <button type="button" onClick={onClose} className="h-11 rounded-xl bg-[#003399] px-5 font-bold text-[#FFFFFF]">Close and view inventory</button>}</div>
    </form>
    {batch ? <div className="border-t border-[#003399]/15 p-5"><BookLabelSheet batch={batch} /></div> : null}
  </div></div>
}
