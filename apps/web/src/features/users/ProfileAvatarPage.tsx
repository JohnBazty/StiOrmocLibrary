import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageHeader, SectionCard } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'

type AvatarState = { currentUrl: string | null; pending: { id: number; submittedAt: string } | null; lastRejection?: { reviewedAt: string; reason: string } | null }

export function ProfileAvatarPage() {
  const [data, setData] = useState<AvatarState | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    const response = await fetch('/api/v1/profile/avatar/me', { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` } })
    const payload = await response.json() as { data?: AvatarState; message?: string }
    if (!response.ok || !payload.data) throw new Error(payload.message ?? 'Unable to load your picture.')
    setData(payload.data)
  }, [])
  useEffect(() => { void load().catch(cause => setMessage(cause instanceof Error ? cause.message : 'Unable to load your picture.')) }, [load])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true); setMessage('')
    try {
      const form = new FormData(); form.set('image', file)
      const response = await fetch('/api/v1/profile/avatar/me', {
        method: 'POST', headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }, body: form,
      })
      const payload = await response.json() as { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Unable to upload your picture.')
      setFile(null); setMessage('Your new picture is awaiting Admin approval.'); await load()
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to upload your picture.') }
    finally { setBusy(false) }
  }
  return <><PageHeader eyebrow="My account" title="Profile picture" description="Your current picture stays visible while a new one awaits approval." />
    {message ? <p role="status" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-[#003399]">{message}</p> : null}
    {data?.lastRejection ? <p role="status" className="mb-4 rounded-xl border border-[#003399]/20 p-4 text-[#003399]">Your previous picture was not approved: {data.lastRejection.reason}</p> : null}
    <SectionCard className="max-w-xl p-6"><div className="flex items-center gap-5">{data?.currentUrl ? <img src={data.currentUrl} alt="Your approved profile picture" className="h-24 w-24 rounded-full object-cover" /> : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#003399]/10 text-sm text-[#003399]">No picture</div>}<div><p className="font-bold text-[#003399]">Approved picture</p><p className="text-sm text-[#003399]/60">{data?.pending ? 'A replacement is awaiting review.' : 'Upload a new picture below.'}</p></div></div>
      <form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-bold text-[#003399]">New picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full" /></label><p className="text-xs text-[#003399]/60">PNG, JPEG, or WebP up to 2 MB.</p><button disabled={busy || !file} className="rounded-xl bg-[#003399] px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Uploading…' : 'Submit for approval'}</button></form>
    </SectionCard>
  </>
}
