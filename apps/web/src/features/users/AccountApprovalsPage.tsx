import { useCallback, useEffect, useState } from 'react'
import { PageHeader, SectionCard } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'

type Request = { request_id: number; school_id: string; email: string; first_name: string; last_name: string; requested_role: string; created_at: string }
type Avatar = { id: number; accountId: number; schoolId: string; name: string; submittedAt: string; previewUrl: string }
const headers = () => ({ Authorization: `Bearer ${getAccessToken() ?? ''}`, Accept: 'application/json', 'Content-Type': 'application/json' })

export function AccountApprovalsPage() {
  const [rows, setRows] = useState<Request[]>([])
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const load = useCallback(async () => {
    try {
      const [response, avatarResponse] = await Promise.all([
        fetch('/api/v1/auth/registration-requests', { headers: headers() }),
        fetch('/api/v1/profile/avatar/submissions', { headers: headers() }),
      ])
      const payload = await response.json() as { data?: Request[]; message?: string }
      const avatarPayload = await avatarResponse.json() as { data?: Avatar[]; message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Unable to load requests.')
      if (!avatarResponse.ok) throw new Error(avatarPayload.message ?? 'Unable to load picture requests.')
      setRows(payload.data ?? []); setAvatars(avatarPayload.data ?? []); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load requests.') }
  }, [])
  useEffect(() => { void load() }, [load])
  async function review(row: Request, decision: 'approve' | 'reject') {
    if (!window.confirm(`${decision === 'approve' ? 'Approve' : 'Reject'} ${row.requested_role} access for ${row.school_id}?`)) return
    setBusy(row.request_id); setError('')
    try {
      const response = await fetch(`/api/v1/auth/registration-requests/${row.request_id}/review`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ decision, reason }),
      })
      const payload = await response.json() as { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Review failed.')
      setReason('')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Review failed.') }
    finally { setBusy(null) }
  }
  async function reviewAvatar(row: Avatar, decision: 'approve' | 'reject') {
    if (!window.confirm(`${decision === 'approve' ? 'Approve' : 'Reject'} ${row.name}'s profile picture?`)) return
    setBusy(row.id); setError('')
    try {
      const response = await fetch(`/api/v1/profile/avatar/submissions/${row.id}/review`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ decision, reason }),
      })
      const payload = await response.json() as { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Picture review failed.')
      setReason('')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Picture review failed.') }
    finally { setBusy(null) }
  }
  return <>
    <PageHeader eyebrow="Users" title="Account approvals" />
    {error ? <p role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-[#003399]">{error}</p> : null}
    <SectionCard className="p-5"><label className="block text-sm font-bold text-[#003399]">Audit reason<input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="mt-2 w-full rounded-xl border border-[#003399]/20 p-3" /></label></SectionCard>
    <h2 className="mt-6 font-display text-xl font-bold text-[#003399]">Role requests</h2>
    <div className="mt-3 space-y-3">{rows.map(row => <SectionCard key={row.request_id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-bold text-[#003399]">{row.first_name} {row.last_name} · {row.requested_role}</p><p className="text-sm text-[#003399]/70">{row.school_id} · {row.email}</p><p className="text-xs text-[#003399]/50">Requested {new Date(row.created_at).toLocaleString('en-PH')}</p></div><div className="flex gap-2"><button disabled={busy !== null || reason.trim().length < 10} onClick={() => void review(row, 'approve')} className="rounded-xl bg-[#003399] px-4 py-2 font-bold text-white disabled:opacity-50">Approve</button><button disabled={busy !== null || reason.trim().length < 10} onClick={() => void review(row, 'reject')} className="rounded-xl border border-[#003399]/20 px-4 py-2 font-bold text-[#003399] disabled:opacity-50">Reject</button></div></SectionCard>)}{rows.length === 0 ? <SectionCard className="p-6 text-[#003399]">No pending role requests.</SectionCard> : null}</div>
    <h2 className="mt-6 font-display text-xl font-bold text-[#003399]">Profile pictures</h2>
    <div className="mt-3 space-y-3">{avatars.map(row => <SectionCard key={row.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-center gap-4"><img src={row.previewUrl} alt={`Pending picture for ${row.name}`} className="h-16 w-16 rounded-full object-cover" /><div><p className="font-bold text-[#003399]">{row.name}</p><p className="text-sm text-[#003399]/70">{row.schoolId}</p></div></div><div className="flex gap-2"><button disabled={busy !== null || reason.trim().length < 10} onClick={() => void reviewAvatar(row, 'approve')} className="rounded-xl bg-[#003399] px-4 py-2 font-bold text-white disabled:opacity-50">Approve picture</button><button disabled={busy !== null || reason.trim().length < 10} onClick={() => void reviewAvatar(row, 'reject')} className="rounded-xl border border-[#003399]/20 px-4 py-2 font-bold text-[#003399] disabled:opacity-50">Reject</button></div></SectionCard>)}{avatars.length === 0 ? <SectionCard className="p-6 text-[#003399]">No pending pictures.</SectionCard> : null}</div>
  </>
}
