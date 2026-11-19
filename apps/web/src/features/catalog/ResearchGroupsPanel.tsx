import { useEffect, useState, type FormEvent } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { enhancedCatalog, type CatalogRecord } from './enhanced-catalog-api'
import { researchGroupsApi, type ResearchGroup, type ResearchAssignment } from './research-groups-api'

const field = 'mt-1 min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2] dark:bg-[#001a4d] dark:text-white'
const blank: Partial<ResearchGroup> = { department: 'College', program: '', yearLevel: 1, active: true }
export function ResearchGroupsPanel() {
  const [groups,setGroups] = useState<ResearchGroup[]>([]), [edit,setEdit] = useState(blank)
  const [error,setError] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false)
  const [query,setQuery] = useState(''), [titles,setTitles] = useState<CatalogRecord[]>([]), [titleId,setTitleId] = useState(Number(new URLSearchParams(window.location.search).get('titleId')) || 0)
  const [assignment,setAssignment] = useState<ResearchAssignment|null>(null), [groupId,setGroupId] = useState('')
  useEffect(() => { if (titleId > 0) enhancedCatalog.detail(titleId).then(title => { setTitles([title]); setQuery(title.title) }).catch(() => setError('The selected research title could not be loaded.')) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { researchGroupsApi.list(true).then(setGroups).catch(() => setError('Research groups could not be loaded. Reopen this section to retry.')) }, [])
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      if (query.trim().length < 2) { setTitles([]); return }
      enhancedCatalog.search(new URLSearchParams({ q: query, kind: 'Research/Thesis' })).then(result => { if (active) setTitles(result.items) }).catch(() => { if (active) setError('Research titles could not be loaded.') })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  useEffect(() => {
    let active = true; setAssignment(null); setGroupId('')
    if (titleId) researchGroupsApi.assignment(titleId).then(result => { if (active) { setAssignment(result); setGroupId(result.groupId ? String(result.groupId) : '') } }).catch(() => { if (active) setError('The selected classification could not be loaded.') })
    return () => { active = false }
  }, [titleId])
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await researchGroupsApi.save(edit); setGroups(await researchGroupsApi.list(true)); setEdit(blank); setNotice('Research group saved.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The research group could not be saved.') } finally { setBusy(false) }
  }
  async function assign(event: FormEvent) {
    event.preventDefault(); if (busy || !assignment || !groupId) return
    setBusy(true); setError(''); setNotice('')
    try { const result = await researchGroupsApi.assign(titleId,Number(groupId),assignment.version); setAssignment(result); setGroups(await researchGroupsApi.list(true)); setNotice('Research classification updated.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The classification could not be saved.') } finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <div><h2 className="text-lg font-bold">Research groups</h2><p className="mt-1 text-sm opacity-70">Organize research by College program and year, or SHS strand and grade.</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">{notice}</p>}
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <SectionCard className="p-4"><h3 className="font-bold">{edit.id ? 'Edit research group' : 'Add research group'}</h3>
        <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>Department<select className={field} value={edit.department} disabled={busy} onChange={e => setEdit({ ...edit, department: e.target.value, yearLevel: e.target.value === 'SHS' ? 11 : 1 })}><option>College</option><option>SHS</option></select></label>
          <label>{edit.department === 'SHS' ? 'Strand' : 'Program'}<input required maxLength={80} className={field} value={edit.program} disabled={busy} placeholder={edit.department === 'SHS' ? 'e.g. STEM' : 'e.g. BSIT'} onChange={e => setEdit({ ...edit, program: e.target.value })}/></label>
          <label>Year / grade level<select className={field} value={edit.yearLevel} disabled={busy} onChange={e => setEdit({ ...edit, yearLevel: Number(e.target.value) })}>{(edit.department === 'SHS' ? [11,12] : [1,2,3,4]).map(year => <option key={year} value={year}>{edit.department === 'SHS' ? 'Grade' : 'Year'} {year}</option>)}</select></label>
          <label>Status<select className={field} value={edit.active ? 'active' : 'archived'} disabled={busy} onChange={e => setEdit({ ...edit, active: e.target.value === 'active' })}><option value="active">Active</option><option value="archived">Archived</option></select></label>
          <p className="text-xs opacity-70 sm:col-span-2">Archived groups keep their research history. Used group names stay unchanged.</p>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{edit.id ? 'Save group' : 'Add group'}</Button>{edit.id && <Button variant="secondary" disabled={busy} onClick={() => setEdit(blank)}>Cancel edit</Button>}</div>
        </form>
      </SectionCard>
      <SectionCard className="p-4"><h3 className="font-bold">Classify existing research</h3><form onSubmit={assign} className="mt-3 space-y-3">
        <label className="block">Find a research title<input className={field} value={query} onChange={e => { setQuery(e.target.value); setTitleId(0) }} placeholder="Enter at least two characters"/></label>
        <label className="block">Research title<select className={field} value={titleId || ''} disabled={busy} onChange={e => setTitleId(Number(e.target.value))}><option value="">Choose research title</option>{titles.map(title => <option key={title.id} value={title.id}>{title.title}</option>)}</select></label>
        {assignment && <><p className="text-xs opacity-70">Original department: {assignment.legacyDepartment}. {assignment.groupId ? 'Review the group below before saving.' : 'No structured group assigned yet.'}</p><label className="block">Assign research group<select required className={field} value={groupId} onChange={e => setGroupId(e.target.value)}><option value="">Choose program / strand and year</option>{groups.filter(group => group.active).map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label><Button type="submit" disabled={busy || !groupId || Number(groupId) === assignment.groupId}>Save research classification</Button></>}
      </form></SectionCard>
    </div>
    <SectionCard className="max-h-96 overflow-y-auto divide-y divide-[#0b5ea2]/10 dark:divide-white/10" aria-label="Configured research groups">{groups.map(group => <div key={group.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="font-semibold">{group.label}</p><p className="text-xs opacity-70">{group.department} · {group.uses} research records · {group.active ? 'Active' : 'Archived'}</p></div><Button variant="secondary" disabled={busy} onClick={() => { setEdit(group); setError(''); setNotice('') }}>Edit {group.label}</Button></div>)}</SectionCard>
  </div>
}
