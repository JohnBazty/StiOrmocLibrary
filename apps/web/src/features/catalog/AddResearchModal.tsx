import { type FormEvent, useEffect, useState } from 'react'
import { QrCode, X } from 'lucide-react'
import { ApiError, catalogApi } from './catalog-api'
import type { BulkBookResult, CatalogItem } from './types'
import { fetchResearchOverview } from './research-catalog-api'
import { enhancedCatalog } from './enhanced-catalog-api'
import { BookLabelSheet } from './BookLabelSheet'
import { confirmLeave, UnsavedGuard } from '../../components/UnsavedChanges'

const fieldClass = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#003399]'
function Input({ label, name, required, value }: { label: string; name: string; required?: boolean; value?: string }) {
  return <label><span className={labelClass}>{label}{required ? ' *' : ''}</span><input name={name} required={required} defaultValue={value} className={fieldClass} /></label>
}

/** With `initial` the modal edits that title's metadata only; bound copies are untouched (`copy: null`). */
export function AddResearchModal({ locations, programs = [], onCreated, onClose, initial }: { locations: string[]; programs?: string[]; onCreated: () => Promise<void> | void; onClose: () => void; initial?: CatalogItem }) {
  const [details, setDetails] = useState<{ abstract: string | null; keywords: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [batch, setBatch] = useState<BulkBookResult | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const [program, setProgram] = useState(initial?.research?.departmentOrProgram ?? '')
  const [newProgram, setNewProgram] = useState<{ name: string; code: string } | null>(null)
  // A program saved on an older record may no longer be in the active list; keep it selectable.
  const programOptions = [...new Set([...programs, ...added, ...(initial?.research?.departmentOrProgram ? [initial.research.departmentOrProgram] : [])])]
  async function saveProgram() {
    if (!newProgram) return
    const name = newProgram.name.trim(), code = newProgram.code.trim().toUpperCase()
    try { await enhancedCatalog.saveFoundation('programs', null, { name, code }); setAdded((current) => [...current, name]); setProgram(name); setNewProgram(null); setMessage('') }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The department/program could not be added.') }
  }
  useEffect(() => {
    if (!initial) return
    const controller = new AbortController()
    fetchResearchOverview(initial.titleId, controller.signal).then(setDetails).catch((reason: Error) => { if (!controller.signal.aborted) setMessage(reason.message) })
    return () => controller.abort()
  }, [initial])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || batch) return
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    setSaving(true); setErrors({}); setMessage('')
    try {
      if (initial) {
        await catalogApi.updateThesis(initial.titleId, {
          title: data.title, authors: String(data.author).split(';').map((name) => name.trim()).filter(Boolean), adviser: data.adviser, year: data.year,
          abstract: data.abstract, categoryId: initial.categoryId, researchCode: data.researchCode,
          departmentOrProgram: data.departmentOrProgram, keywords: data.keywords || null, copy: null,
        })
        await onCreated(); onClose(); return
      }
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
    <header className="flex items-center justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase text-[#003399]">Catalog entry</p><h2 className="text-xl font-black text-[#003399]">{initial ? 'Edit research' : 'Add research / thesis'}</h2></div><button aria-label="Close" disabled={saving} onClick={() => confirmLeave(onClose)} className="p-2 text-[#003399] disabled:opacity-40"><X /></button></header>
    {initial && !details ? <p role={message ? 'alert' : 'status'} className="p-5 text-sm font-semibold text-[#003399]">{message || 'Loading research details…'}</p> : <UnsavedGuard className="contents" cleanOnSubmit><form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
      {message ? <div role={batch ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm font-semibold text-[#003399] sm:col-span-2 ${batch ? 'border border-[#003399] bg-[#FFFFFF]' : 'bg-[#FFF200]'}`}>{message}</div> : null}
      {Object.keys(errors).length ? <div role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm text-[#003399] sm:col-span-2"><ul className="list-inside list-disc">{Object.entries(errors).map(([field, value]) => <li key={field}><strong>{field}:</strong> {value}</li>)}</ul></div> : null}
      <Input label="Title" name="title" required value={initial?.title} /><Input label="Author" name="author" required value={initial?.authors.join('; ')} />
      <Input label="Research code" name="researchCode" required value={initial?.research?.researchCode} /><Input label="Year" name="year" required value={initial?.publicationYear?.toString()} />
      <Input label="Adviser" name="adviser" value={initial?.research?.adviser ?? undefined} />
      <div><label><span className={labelClass}>Department / program *</span><select name="departmentOrProgram" required value={program} onChange={(event) => setProgram(event.target.value)} className={fieldClass}><option value="">Select department / program</option>{programOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        {newProgram ? <div className="mt-2 grid gap-2 rounded-xl border border-[#003399]/15 p-3"><label><span className={labelClass}>New program name</span><input value={newProgram.name} onChange={(event) => setNewProgram({ ...newProgram, name: event.target.value })} className={fieldClass} /></label><label><span className={labelClass}>New program code</span><input value={newProgram.code} onChange={(event) => setNewProgram({ ...newProgram, code: event.target.value })} className={fieldClass} /></label><div className="flex gap-2"><button type="button" disabled={!newProgram.name.trim() || !newProgram.code.trim()} onClick={() => void saveProgram()} className="h-10 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">Save program</button><button type="button" onClick={() => setNewProgram(null)} className="h-10 rounded-xl border border-[#003399] px-4 text-sm font-bold text-[#003399]">Cancel</button></div></div>
          : <button type="button" onClick={() => setNewProgram({ name: '', code: '' })} className="mt-1 text-xs font-bold text-[#003399] underline">Add department/program</button>}</div>
      <Input label="Keywords" name="keywords" value={details?.keywords ?? undefined} />
      {initial ? null : <><label><span className={labelClass}>Shelf location *</span><select name="shelfLocation" required className={fieldClass}><option value="">Select existing shelf location</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
      <div className="rounded-xl border border-[#003399]/15 bg-[#FFF200] p-3 text-xs font-semibold text-[#003399] sm:col-span-2">New publications start in Good condition. Accession number, inventory barcode, and QR code are generated automatically.</div></>}
      <label className="sm:col-span-2"><span className={labelClass}>Abstract</span><textarea name="abstract" minLength={20} rows={6} defaultValue={details?.abstract ?? undefined} className={`${fieldClass} h-auto py-3`} /></label>
      <div className="flex justify-end gap-2 sm:col-span-2">{!batch ? <><button type="button" disabled={saving} onClick={() => confirmLeave(onClose)} className="h-11 rounded-xl border border-[#003399] bg-[#FFFFFF] px-5 font-bold text-[#003399]">Cancel</button><button disabled={saving || (!initial && !locations.length)} type="submit" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#003399] px-5 font-bold text-[#FFFFFF] disabled:opacity-50"><QrCode size={17} />{initial ? (saving ? 'Saving…' : 'Save changes') : saving ? 'Publishing and generating codes…' : 'Publish and generate codes'}</button></> : <button type="button" onClick={() => confirmLeave(onClose)} className="h-11 rounded-xl bg-[#003399] px-5 font-bold text-[#FFFFFF]">Close and view inventory</button>}</div>
    </form></UnsavedGuard>}
    {batch ? <div className="border-t border-[#003399]/15 p-5"><BookLabelSheet batch={batch} /></div> : null}
  </div></div>
}
