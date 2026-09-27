import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { PageHeader, SectionCard } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'

type Request = { request_id: number; school_id: string; email: string; first_name: string; last_name: string; requested_role: string; created_at: string }
type Avatar = { id: number; accountId: number; schoolId: string; name: string; submittedAt: string; previewUrl: string }
type Review = { kind: 'account'; row: Request; decision: 'approve' | 'reject' } | { kind: 'avatar'; row: Avatar; decision: 'approve' | 'reject' }
const headers = () => ({ Authorization: `Bearer ${getAccessToken() ?? ''}`, Accept: 'application/json', 'Content-Type': 'application/json' })

export function AccountApprovalsPage() {
  const [rows, setRows] = useState<Request[]>([])
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [pendingReview, setPendingReview] = useState<Review | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
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
  useEffect(() => { if (pendingReview) cancelRef.current?.focus() }, [pendingReview])
  useEffect(() => { if (!pendingReview && busy === null) openerRef.current?.focus() }, [pendingReview, busy])
  useEffect(() => {
    if (!pendingReview) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && busy === null) closeReview()
      if (event.key === 'Tab') {
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
        if (!buttons.length) return
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingReview, busy])
  function closeReview() {
    setPendingReview(null)
  }
  function openReview(next: Review) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setError('')
    setPendingReview(next)
  }
  async function review(row: Request, decision: 'approve' | 'reject') {
    setBusy(row.request_id); setError('')
    try {
      const response = await fetch(`/api/v1/auth/registration-requests/${row.request_id}/review`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ decision }),
      })
      const payload = await response.json() as { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Review failed.')
      closeReview()
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Review failed.') }
    finally { setBusy(null) }
  }
  async function reviewAvatar(row: Avatar, decision: 'approve' | 'reject') {
    setBusy(row.id); setError('')
    try {
      const response = await fetch(`/api/v1/profile/avatar/submissions/${row.id}/review`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ decision }),
      })
      const payload = await response.json() as { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Picture review failed.')
      closeReview()
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Picture review failed.') }
    finally { setBusy(null) }
  }
  return <>
    <PageHeader eyebrow="Users" title="Account approvals" />
    {error ? <p role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-[#003399]">{error}</p> : null}
    <p className="text-sm text-[#003399]/70">New accounts appear here after their school email is verified. Approve an account before its owner can sign in.</p>
    <h2 className="mt-6 font-display text-xl font-bold text-[#003399]">Account registrations</h2>
    <div className="mt-3 space-y-3">{rows.map(row => <SectionCard key={row.request_id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-bold text-[#003399]">{row.first_name} {row.last_name} · {row.requested_role}</p><p className="text-sm text-[#003399]/70">{row.school_id} · {row.email}</p><p className="text-xs text-[#003399]/50">Registered {new Date(row.created_at).toLocaleString('en-PH')}</p></div><div className="flex gap-2"><button disabled={busy !== null} onClick={() => openReview({ kind: 'account', row, decision: 'approve' })} className="rounded-xl bg-[#003399] px-4 py-2 font-bold text-white disabled:opacity-50">Approve</button><button disabled={busy !== null} onClick={() => openReview({ kind: 'account', row, decision: 'reject' })} className="rounded-xl border border-[#003399]/20 px-4 py-2 font-bold text-[#003399] disabled:opacity-50">Reject</button></div></SectionCard>)}{rows.length === 0 ? <SectionCard className="p-6 text-[#003399]">No account registrations awaiting approval.</SectionCard> : null}</div>
    <h2 className="mt-6 font-display text-xl font-bold text-[#003399]">Profile pictures</h2>
    <div className="mt-3 space-y-3">{avatars.map(row => <SectionCard key={row.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-center gap-4"><img src={row.previewUrl} alt={`Pending picture for ${row.name}`} className="h-16 w-16 rounded-full object-cover" /><div><p className="font-bold text-[#003399]">{row.name}</p><p className="text-sm text-[#003399]/70">{row.schoolId}</p></div></div><div className="flex gap-2"><button disabled={busy !== null} onClick={() => openReview({ kind: 'avatar', row, decision: 'approve' })} className="rounded-xl bg-[#003399] px-4 py-2 font-bold text-white disabled:opacity-50">Approve picture</button><button disabled={busy !== null} onClick={() => openReview({ kind: 'avatar', row, decision: 'reject' })} className="rounded-xl border border-[#003399]/20 px-4 py-2 font-bold text-[#003399] disabled:opacity-50">Reject</button></div></SectionCard>)}{avatars.length === 0 ? <SectionCard className="p-6 text-[#003399]">No pending pictures.</SectionCard> : null}</div>
    {pendingReview ? <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#003399]/65 p-4 backdrop-blur-sm">
      <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="approval-dialog-title" aria-describedby="approval-dialog-description" className="w-full max-w-md overflow-hidden rounded-3xl border border-[#003399]/15 bg-[#FFFFFF] shadow-2xl shadow-[#003399]/30">
        <div className="h-2 bg-[#FFF200]" />
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF200] text-[#003399]"><ShieldCheck size={24} /></span><button type="button" aria-label="Close confirmation" disabled={busy !== null} onClick={closeReview} className="rounded-xl p-2 text-[#003399] hover:bg-[#003399]/5 disabled:opacity-50"><X size={20} /></button></div>
          <h2 id="approval-dialog-title" className="mt-5 font-display text-2xl font-black text-[#003399]">{pendingReview.decision === 'approve' ? 'Confirm approval' : 'Confirm rejection'}</h2>
          <p id="approval-dialog-description" className="mt-2 text-sm leading-6 text-[#003399]/75">{pendingReview.kind === 'account'
            ? `${pendingReview.decision === 'approve' ? 'Approve' : 'Reject'} the ${pendingReview.row.requested_role} account for ${pendingReview.row.first_name} ${pendingReview.row.last_name} (${pendingReview.row.school_id})?`
            : `${pendingReview.decision === 'approve' ? 'Approve' : 'Reject'} the profile picture for ${pendingReview.row.name} (${pendingReview.row.schoolId})?`}</p>
          {error ? <p role="alert" className="mt-4 rounded-xl bg-[#FFF200] p-3 text-sm font-bold text-[#003399]">{error}</p> : null}
          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button ref={cancelRef} type="button" disabled={busy !== null} onClick={closeReview} className="rounded-xl border border-[#003399]/20 px-5 py-2.5 font-bold text-[#003399] disabled:opacity-50">Cancel</button><button type="button" disabled={busy !== null} onClick={() => void (pendingReview.kind === 'account' ? review(pendingReview.row, pendingReview.decision) : reviewAvatar(pendingReview.row, pendingReview.decision))} className="rounded-xl bg-[#003399] px-5 py-2.5 font-bold text-[#FFFFFF] disabled:opacity-50">{busy !== null ? 'Saving…' : pendingReview.decision === 'approve' ? pendingReview.kind === 'account' ? 'Approve account' : 'Approve picture' : pendingReview.kind === 'account' ? 'Reject account' : 'Reject picture'}</button></div>
        </div>
      </section>
    </div> : null}
  </>
}
