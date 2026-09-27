import { BadgeCheck, RefreshCw, Search, UserCheck, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, PageHeader, SectionCard, StatCard } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { usersApi, type AccountStatus, type ActiveUser, type Pagination, type ProfileEdit, type UserDetail, type UserFilters, type UserSummary } from './users-api'

const field = 'h-10 w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-sm text-[#003399] outline-none focus:border-[#003399]'
const initial: UserFilters = { q: '', role: '', program: '', clearance: '', status: 'Active', page: 1, limit: 25 }
const emptyProfile: ProfileEdit = { first_name: '', last_name: '', email: '', contact_number: '', program_strand: '', year_grade_level: '', reason: '' }

export function AdminUsersPage() {
  const canManage = getCurrentIdentity()?.role === 'Admin'
  const [filters, setFilters] = useState<UserFilters>(initial)
  const [refresh, setRefresh] = useState(0)
  const [summary, setSummary] = useState<UserSummary | null>(null)
  const [programs, setPrograms] = useState<string[]>([])
  const [rows, setRows] = useState<ActiveUser[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, total_pages: 0 })
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [profile, setProfile] = useState<ProfileEdit>(emptyProfile)
  const [nextStatus, setNextStatus] = useState<AccountStatus | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([usersApi.summary(), usersApi.programs()]).then(([s, p]) => {
      if (active) { setSummary(s); setPrograms(p) }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load users.') })
    return () => { active = false }
  }, [refresh])
  useEffect(() => {
    let active = true
    setLoading(true)
    void usersApi.directory(filters).then(result => {
      if (active) { setRows(result.rows); setPagination(result.pagination); setError('') }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load users.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, refresh])

  const update = (change: Partial<UserFilters>) => setFilters(current => ({ ...current, ...change, page: change.page ?? 1 }))
  async function open(row: ActiveUser) {
    setError(''); setNotice(''); setNextStatus(null); setStatusReason('')
    try {
      const user = await usersApi.detail(row.id)
      setDetail(user)
      setProfile({ first_name: user.first_name ?? '', last_name: user.last_name ?? '', email: user.email ?? '',
        contact_number: user.contact_number ?? '', program_strand: user.program_strand ?? '',
        year_grade_level: user.year_grade_level ?? '', reason: '' })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open account.') }
  }
  async function reloadDetail(id: number) {
    setDetail(await usersApi.detail(id))
    setRefresh(value => value + 1)
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault()
    if (!detail) return
    setSaving(true); setError(''); setNotice('')
    try {
      await usersApi.editProfile(detail.id, profile)
      await reloadDetail(detail.id)
      setProfile(current => ({ ...current, reason: '' }))
      setNotice('Student profile updated and recorded in the audit history.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Profile update failed.') }
    finally { setSaving(false) }
  }
  async function saveStatus() {
    if (!detail || !nextStatus) return
    setSaving(true); setError(''); setNotice('')
    try {
      await usersApi.changeStatus(detail.id, nextStatus, statusReason)
      await reloadDetail(detail.id)
      setNextStatus(null); setStatusReason('')
      setNotice(`Account ${nextStatus.toLowerCase()}. Existing sign-ins have been invalidated.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Account status update failed.') }
    finally { setSaving(false) }
  }

  return <>
    <PageHeader eyebrow="Access management" title="Library users" action={<Button variant="secondary" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} /> Refresh</Button>} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-bold text-[#003399]">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl border border-[#003399]/20 p-3 text-sm font-bold text-[#003399]">{notice}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Active accounts" value={String(summary?.active_accounts ?? 0)} icon={UserCheck} /><StatCard label="Deactivated" value={String(summary?.deactivated_accounts ?? 0)} icon={Users} /><StatCard label="Archived" value={String(summary?.archived_accounts ?? 0)} icon={BadgeCheck} /></div>
    <SectionCard className="mb-5 p-4"><div className="grid gap-3 md:grid-cols-5">
      <label className={`${field} flex items-center gap-2`}><Search size={15} /><input aria-label="Search users" className="w-full outline-none" placeholder="Name, ID, or email" value={filters.q} onChange={event => update({ q: event.target.value })} /></label>
      <select aria-label="Account status" className={field} value={filters.status} onChange={event => update({ status: event.target.value })}><option value="">All statuses</option><option>Active</option><option>Deactivated</option><option>Archived</option></select>
      <select aria-label="User role" className={field} value={filters.role} onChange={event => update({ role: event.target.value })}><option value="">All roles</option>{['Student', 'Faculty', 'Librarian', 'Admin'].map(role => <option key={role}>{role}</option>)}</select>
      <select aria-label="Program" className={field} value={filters.program} onChange={event => update({ program: event.target.value })}><option value="">All programs</option>{programs.map(program => <option key={program}>{program}</option>)}</select>
      <select aria-label="Clearance" className={field} value={filters.clearance} onChange={event => update({ clearance: event.target.value })}><option value="">All clearance states</option><option>Cleared</option><option>Not Cleared</option></select>
    </div></SectionCard>
    <SectionCard><div className="border-b border-[#003399]/15 p-5"><h2 className="font-bold text-[#003399]">Account directory</h2><p className="text-xs text-[#003399]/65">{pagination.total} matching accounts · Student profiles can be managed by Admin</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr>{['User', 'School ID', 'Role', 'Program / unit', 'Year / level', 'Clearance', 'Status', 'Action'].map(label => <th key={label} className="px-5 py-3 text-xs">{label}</th>)}</tr></thead><tbody>
        {loading ? <tr><td colSpan={8} className="p-10 text-center text-[#003399]">Loading users…</td></tr> : rows.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-[#003399]">No accounts match these filters.</td></tr> : rows.map(user => <tr key={user.id} className="border-b border-[#003399]/10 text-[#003399]"><td className="px-5 py-4"><b>{user.full_name}</b><p className="text-xs opacity-70">{user.email}</p></td><td className="px-5 py-4 font-mono text-xs">{user.school_id}</td><td className="px-5 py-4">{user.role}</td><td className="px-5 py-4">{user.program}</td><td className="px-5 py-4">{user.year_or_unit}</td><td className="px-5 py-4">{user.clearance_status}</td><td className="px-5 py-4"><span className="rounded-full bg-[#003399] px-2 py-1 text-xs font-bold text-white">{user.account_status}</span></td><td className="px-5 py-4"><button className="font-bold underline" onClick={() => void open(user)}>View{canManage && user.role === 'Student' ? ' / manage' : ''}</button></td></tr>)}
      </tbody></table></div><div className="flex justify-end gap-2 p-4"><Button variant="secondary" disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })}>Previous</Button><span className="self-center text-xs font-bold text-[#003399]">Page {pagination.page} of {Math.max(1, pagination.total_pages)}</span><Button variant="secondary" disabled={filters.page >= pagination.total_pages} onClick={() => update({ page: filters.page + 1 })}>Next</Button></div>
    </SectionCard>
    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#003399]/75 p-4"><div role="dialog" aria-modal="true" aria-label="Account record" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-[#003399]">
      <div className="flex justify-between gap-4"><div><p className="text-xs font-bold uppercase">{detail.role} account · {detail.account_status}</p><h2 className="text-2xl font-black">{detail.full_name}</h2><p className="text-sm">{detail.school_id}</p></div><button aria-label="Close account record" onClick={() => setDetail(null)}><X /></button></div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#FFF200] p-3 text-sm font-bold">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-[#003399]/20 p-3 text-sm font-bold">{notice}</p>}
      {canManage && detail.role === 'Student' ? <>
        <form onSubmit={event => void saveProfile(event)} className="mt-6 grid gap-3 sm:grid-cols-2"><h3 className="sm:col-span-2 font-bold">Edit student profile</h3>
          {([['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['contact_number', 'Contact number'], ['program_strand', 'Program / strand'], ['year_grade_level', 'Year / grade level']] as const).map(([key, label]) => <label key={key} className="text-xs font-bold">{label}<input className={`${field} mt-1`} value={profile[key]} onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} /></label>)}
          <label className="sm:col-span-2 text-xs font-bold">Audit reason<input className={`${field} mt-1`} value={profile.reason} onChange={event => setProfile(current => ({ ...current, reason: event.target.value }))} placeholder="Why are these details changing?" /></label>
          <Button type="submit" disabled={saving} className="sm:col-span-2">Save profile</Button>
        </form>
        <div className="mt-6 border-t border-[#003399]/15 pt-5"><h3 className="font-bold">Account status</h3><p className="mt-1 text-sm">Deactivated and archived accounts cannot sign in. Archive requires all loans returned and reservations closed. Past records stay available to staff.</p><div className="mt-3 flex flex-wrap gap-2">{(['Active', 'Deactivated', 'Archived'] as const).filter(status => status !== detail.account_status).map(status => <button key={status} onClick={() => { setNextStatus(status); setStatusReason('') }} className="rounded-xl border border-[#003399] px-3 py-2 text-sm font-bold">{status === 'Active' ? 'Activate' : status === 'Archived' ? 'Archive' : 'Deactivate'}</button>)}</div>
          {nextStatus && <div className="mt-4 rounded-xl border border-[#003399]/20 p-4"><p className="font-bold">Confirm {nextStatus.toLowerCase()} status</p><label className="mt-2 block text-xs font-bold">Audit reason<input className={`${field} mt-1`} value={statusReason} onChange={event => setStatusReason(event.target.value)} placeholder="Why is this status changing?" /></label><div className="mt-3 flex gap-2"><Button disabled={saving || statusReason.trim().length < 3} onClick={() => void saveStatus()}>Confirm</Button><Button variant="secondary" onClick={() => setNextStatus(null)}>Cancel</Button></div></div>}
        </div>
      </> : <p className="mt-5 text-sm">This account is view-only here. Only Admin can manage student access; staff and faculty accounts are not editable on this page.</p>}
      <div className="mt-6 border-t border-[#003399]/15 pt-5"><h3 className="font-bold">Change history</h3>{detail.events.length ? <div className="mt-2 space-y-2">{detail.events.map(event => <p key={event.id} className="rounded-xl border border-[#003399]/15 p-3 text-sm"><b>{event.action}</b> · {new Date(event.created_at).toLocaleString()} · {event.actor_school_id}<br />{event.reason}{event.changed_fields ? ` · Fields: ${event.changed_fields}` : ''}</p>)}</div> : <p className="mt-2 text-sm opacity-70">No management changes recorded yet.</p>}</div>
    </div></div>}
  </>
}
