import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageHeader, SectionCard } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'
import { usersApi, type OwnProfile, type ProfileEdit } from './users-api'

type AvatarState = { currentUrl: string | null; pending: { id: number; submittedAt: string } | null; lastRejection?: { reviewedAt: string; reason: string } | null }

export function ProfileAvatarPage() {
  const [data, setData] = useState<AvatarState | null>(null)
  const [profile, setProfile] = useState<OwnProfile | null>(null)
  const [draft, setDraft] = useState<ProfileEdit>({ first_name: '', last_name: '', program_strand: '', year_grade_level: '' })
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
  useEffect(() => { void usersApi.myProfile().then(value => {
    setProfile(value)
    setDraft({ first_name: value.first_name ?? '', last_name: value.last_name ?? '', program_strand: value.program_strand ?? '', year_grade_level: value.year_grade_level ?? '' })
  }).catch(cause => setMessage(cause instanceof Error ? cause.message : 'Unable to load your profile.')) }, [])
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      await usersApi.saveMyProfile(draft)
      setProfile(await usersApi.myProfile())
      setMessage('Your profile has been updated. Admin can see the change in your account history.')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to save your profile.') }
    finally { setBusy(false) }
  }
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
  return <><PageHeader eyebrow="My account" title="My profile" description="Edit your profile details and submit a new picture for approval." />
    {message ? <p role="status" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-[#003399]">{message}</p> : null}
    <SectionCard className="mb-5 max-w-2xl p-6"><h2 className="font-bold text-[#003399]">Profile details</h2><p className="mt-1 text-sm text-[#003399]/70">Only you can edit these details. Your school email and ID are fixed.</p>
      {profile ? <form onSubmit={saveProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold text-[#003399]">School ID<input value={profile.school_id} readOnly className="mt-1 w-full rounded-xl border p-3 opacity-70" /></label>
        <label className="text-sm font-bold text-[#003399]">School email<input value={profile.email ?? ''} readOnly className="mt-1 w-full rounded-xl border p-3 opacity-70" /></label>
        {([['first_name', 'First name'], ['last_name', 'Last name']] as const).map(([key, label]) => <label key={key} className="text-sm font-bold text-[#003399]">{label}<input aria-label={label} required maxLength={100} value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-xl border p-3" /></label>)}
        {profile.role === 'Student' && ([['program_strand', 'Program / strand'], ['year_grade_level', 'Year / grade level']] as const).map(([key, label]) => <label key={key} className="text-sm font-bold text-[#003399]">{label}<input aria-label={label} required value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-xl border p-3" /></label>)}
        <button disabled={busy} className="rounded-xl bg-[#003399] px-5 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2">Save my profile</button>
      </form> : <p className="mt-3 text-sm">Loading profile…</p>}
    </SectionCard>
    {data?.lastRejection ? <p role="status" className="mb-4 rounded-xl border border-[#003399]/20 p-4 text-[#003399]">Your previous picture was not approved: {data.lastRejection.reason}</p> : null}
    <SectionCard className="max-w-xl p-6"><div className="flex items-center gap-5">{data?.currentUrl ? <img src={data.currentUrl} alt="Your approved profile picture" className="h-24 w-24 rounded-full object-cover" /> : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#003399]/10 text-sm text-[#003399]">No picture</div>}<div><p className="font-bold text-[#003399]">Approved picture</p><p className="text-sm text-[#003399]/60">{data?.pending ? 'A replacement is awaiting review.' : 'Upload a new picture below.'}</p></div></div>
      <form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-bold text-[#003399]">New picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full" /></label><p className="text-xs text-[#003399]/60">PNG, JPEG, or WebP up to 2 MB.</p><button disabled={busy || !file} className="rounded-xl bg-[#003399] px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Uploading…' : 'Submit for approval'}</button></form>
    </SectionCard>
  </>
}
