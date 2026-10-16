import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, CheckCircle2, Clock3, GraduationCap, ImagePlus, LockKeyhole, Save, ShieldCheck, UserRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { PageHeader } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'
import { usersApi, type OwnProfile, type ProfileEdit } from './users-api'
import { notifyProfileUpdated } from './profile-events'

type AvatarState = { currentUrl: string | null; pending: { id: number; submittedAt: string } | null; lastRejection?: { reviewedAt: string; reason: string } | null }

export function ProfileAvatarPage() {
  const [params] = useSearchParams()
  const section = params.get('section')
  const showAll = !['personal', 'school', 'photo'].includes(section ?? '')
  const [data, setData] = useState<AvatarState | null>(null)
  const [profile, setProfile] = useState<OwnProfile | null>(null)
  const [draft, setDraft] = useState<ProfileEdit>({ first_name: '', last_name: '', program_strand: '', year_grade_level: '' })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [operation, setOperation] = useState<'profile' | 'photo' | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(true)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  function clearPicture() { setFile(null); if (fileInput.current) fileInput.current.value = '' }
  function selectPicture(selected: File | null) {
    if (selected && (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 2 * 1024 * 1024)) {
      clearPicture(); setMessageError(true); setMessage('Choose a PNG, JPEG, or WebP image up to 2 MB.'); return
    }
    setFile(selected); setMessage('')
  }
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
    event.preventDefault(); setBusy(true); setOperation('profile'); setMessage(''); setMessageError(true)
    try {
      await usersApi.saveMyProfile(draft)
      setProfile(await usersApi.myProfile())
      notifyProfileUpdated()
      setMessageError(false); setMessage('Your profile has been updated. The librarian can see the change in your account history.')
    } catch (cause) { setMessageError(true); setMessage(cause instanceof Error ? cause.message : 'Unable to save your profile.') }
    finally { setBusy(false); setOperation(null) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true); setOperation('photo'); setMessage(''); setMessageError(true)
    try {
      const form = new FormData(); form.set('image', file)
      const response = await fetch('/api/v1/profile/avatar/me', {
        method: 'POST', headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }, body: form,
      })
      const payload = await response.json() as { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Unable to upload your picture.')
      clearPicture(); setMessageError(false); setMessage('Your new picture is awaiting Librarian approval.'); await load()
    } catch (cause) { setMessageError(true); setMessage(cause instanceof Error ? cause.message : 'Unable to upload your picture.') }
    finally { setBusy(false); setOperation(null) }
  }
  const name = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.full_name || 'Your account' : 'Your account'
  const initials = profile ? `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase() : ''
  return <div className="my-profile-page"><PageHeader eyebrow="My account" title={showAll ? 'My profile' : section === 'personal' ? 'Personal details' : section === 'school' ? 'School details' : 'Profile photo'} />
    <section className="profile-summary" aria-label="Account summary">
      <div className="profile-summary-icon"><UserRound size={26} /></div>
      <div className="min-w-0 flex-1"><p className="profile-summary-eyebrow">Your library identity</p><h2>{name}</h2><p className="profile-summary-description">Keep your details up to date for a smoother library experience.</p></div>
      {profile ? <div className="profile-summary-tags"><span><ShieldCheck size={14} />{profile.role}</span><span><CheckCircle2 size={14} />{profile.account_status}</span></div> : null}
    </section>
    {message ? <p role={messageError ? 'alert' : 'status'} className="profile-message">{message}</p> : null}
    <div className="profile-layout" style={!showAll ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
      {showAll || section === 'photo' ? <section className="profile-panel profile-photo-panel" aria-labelledby="profile-photo-heading">
        <div className="profile-photo-banner"><Camera size={19} /><span>Make it yours</span></div>
        <div className="profile-photo-body">
          <div className="profile-avatar">{preview || data?.currentUrl ? <img src={preview ?? data!.currentUrl!} alt={preview ? 'New picture preview' : 'Your approved profile picture'} /> : <span aria-label="No approved profile picture">{initials || <UserRound size={40} />}</span>}<span className="profile-avatar-camera"><Camera size={15} /></span></div>
          <h2 id="profile-photo-heading">Profile picture</h2><p className="profile-muted">A familiar face for your library account.</p>
          <p className="profile-photo-status">{preview ? <><ImagePlus size={14} />New picture preview</> : data?.pending ? <><Clock3 size={14} />Awaiting approval</> : data?.currentUrl ? <><CheckCircle2 size={14} />Approved picture</> : <><Camera size={14} />No picture yet</>}</p>
          {data?.pending ? <p role="status" className="profile-photo-note">Your submitted picture is awaiting Librarian review. Your approved picture stays visible until then.</p> : null}
          {data?.lastRejection ? <p role="status" className="profile-photo-note">Your previous picture was not approved: {data.lastRejection.reason}</p> : null}
          <form onSubmit={submit} className="profile-upload-form">
            <label className="profile-upload"><ImagePlus size={24} /><span>{file ? 'Choose a different picture' : 'Choose a picture'}</span><span className="profile-upload-hint">PNG, JPEG or WebP · up to 2 MB</span><input ref={fileInput} aria-label="New picture" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => selectPicture(event.target.files?.[0] ?? null)} /></label>
            <SelectedFilePreview file={file} onRemove={clearPicture} removeLabel="Remove selected picture" disabled={busy} />
            <button disabled={busy || !file} className="profile-primary-button"><ShieldCheck size={16} />{operation === 'photo' ? 'Uploading…' : 'Submit for approval'}</button>
          </form>
          <p className="profile-photo-note">New pictures appear on your account after Librarian approval.</p>
        </div>
      </section> : null}
      {showAll || section !== 'photo' ? <section className="profile-panel profile-details-panel" aria-labelledby="profile-details-heading">
        <header className="profile-panel-heading"><span className="profile-section-icon"><UserRound size={20} /></span><div><h2 id="profile-details-heading">Profile details</h2><p className="profile-muted">Only you can edit your personal information.</p></div></header>
        {profile ? <form onSubmit={saveProfile}>
          <fieldset style={!showAll && section !== 'personal' ? { display: 'none' } : undefined} className="profile-field-section" disabled={busy}><legend>Personal information</legend><div className="profile-field-grid">
            {([['first_name', 'First name'], ['last_name', 'Last name']] as const).map(([key, label]) => <label key={key}>{label}<input required maxLength={100} autoComplete={key === 'first_name' ? 'given-name' : 'family-name'} value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} /></label>)}
          </div></fieldset>
          {profile.role === 'Student' && (showAll || section === 'school') ? <fieldset className="profile-field-section" disabled={busy}><legend><GraduationCap size={16} />Academic details</legend><div className="profile-field-grid">
            {([['program_strand', 'Program / strand'], ['year_grade_level', 'Year / grade level']] as const).map(([key, label]) => <label key={key}>{label}<input required value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} /></label>)}
          </div></fieldset> : null}
          <div style={!showAll && section !== 'school' ? { display: 'none' } : undefined} className="profile-identity"><div className="profile-identity-heading"><LockKeyhole size={16} /><h3>School identity</h3><span>Read-only</span></div><p className="profile-muted">Your school ID and email are linked to your account.</p><div className="profile-field-grid"><label>School ID<input value={profile.school_id} readOnly /></label><label>School email<input value={profile.email ?? ''} readOnly /></label></div></div>
          <footer className="profile-save-bar"><p><ShieldCheck size={15} />Updates are recorded in your account history.</p><button disabled={busy} className="profile-primary-button"><Save size={16} />{operation === 'profile' ? 'Saving…' : 'Save my profile'}</button></footer>
        </form> : <p className="p-6 profile-muted">Loading profile…</p>}
      </section> : null}
    </div>
  </div>
}
