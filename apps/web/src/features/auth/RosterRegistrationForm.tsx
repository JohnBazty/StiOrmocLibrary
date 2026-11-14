import { useEffect, useState, type FormEvent } from 'react'
import { AuthMessage } from './AuthMessage'
import { rosterRegistrationRequest } from './auth-api'

type Props = {
  fieldClass: string
  busy: boolean
  onBusy: (busy: boolean) => void
  onComplete: (schoolId: string) => void
}

export function RosterRegistrationForm({ fieldClass, busy, onBusy, onComplete }: Props) {
  const [schoolId, setSchoolId] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [grant, setGrant] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [canResend, setCanResend] = useState(false)
  const [error, setError] = useState('')
  const normalizedId = schoolId.trim().toUpperCase()
  const validId = /^[A-Z0-9][A-Z0-9._-]{2,49}$/.test(normalizedId)

  useEffect(() => {
    if (!retryAt) return
    const timer = window.setTimeout(() => setCanResend(true), Math.max(0, retryAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [retryAt])

  async function requestCode() {
    const result = await rosterRegistrationRequest<{ challengeId: string }>('/begin', { school_id: normalizedId })
    setChallengeId(result.challengeId)
    setCode('')
    setCanResend(false)
    setRetryAt(Date.now() + 60_000)
  }

  async function run(action: () => Promise<void>) {
    if (busy) return
    onBusy(true)
    setError('')
    try { await action() }
    catch (err) { setError(err instanceof Error ? err.message : 'Try again in a moment.') }
    finally { onBusy(false) }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      if (!challengeId) return requestCode()
      if (!grant) {
        const result = await rosterRegistrationRequest<{ grant: string }>('/verify', { challenge_id: challengeId, code })
        setGrant(result.grant)
        setCode('')
        return
      }
      if (password !== confirmation) {
        setError('The passwords do not match.')
        return
      }
      const result = await rosterRegistrationRequest<{ schoolId: string }>('/complete', {
        challenge_id: challengeId, grant, password, confirm_password: confirmation,
      })
      onComplete(result.schoolId)
    })
  }

  function restart() {
    setChallengeId('')
    setGrant('')
    setCode('')
    setPassword('')
    setConfirmation('')
    setError('')
  }

  return <form className="mt-5 space-y-4" onSubmit={submit}>
    {error && <AuthMessage error>{error}</AuthMessage>}
    {!challengeId ? <>
      <p className="text-sm">Enter the Student ID on your school record. We use the school email on the enrollment roster.</p>
      <label className="block space-y-2 text-sm font-bold">Student ID
        <input required maxLength={50} autoComplete="username" className={fieldClass} value={schoolId} disabled={busy}
          onChange={event => setSchoolId(event.target.value)} />
      </label>
    </> : !grant ? <>
      <p role="status" className="text-sm">If your ID is eligible, a code was sent to your school email. Check your inbox and spam folder. If you already have an account, sign in instead.</p>
      <label className="block space-y-2 text-sm font-bold">Email verification code
        <input required autoFocus inputMode="numeric" maxLength={6} autoComplete="one-time-code" className={fieldClass}
          value={code} disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} />
      </label>
    </> : <>
      <p role="status" className="text-sm">School email verified. Set a password to finish creating your account.</p>
      <label className="block space-y-2 text-sm font-bold">Password
        <input required autoFocus type="password" minLength={8} maxLength={72} autoComplete="new-password"
          className={fieldClass} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
      </label>
      <label className="block space-y-2 text-sm font-bold">Confirm password
        <input required type="password" minLength={8} maxLength={72} autoComplete="new-password"
          className={fieldClass} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
      </label>
    </>}
    <button className="min-h-12 w-full rounded-xl bg-[#FFF200] px-4 font-bold text-catalog-brand disabled:opacity-55"
      disabled={busy || (!challengeId ? !validId : !grant && code.length !== 6)}>
      {busy ? 'Please wait…' : !challengeId ? 'Send email code' : !grant ? 'Verify email code' : 'Create account'}
    </button>
    {challengeId && <div className="flex flex-wrap gap-3 text-sm">
      {!grant && <button type="button" disabled={busy || !canResend} onClick={() => void run(requestCode)}
        className="min-h-11 font-bold underline disabled:opacity-55">{canResend ? 'Resend code' : 'Resend available in one minute'}</button>}
      <button type="button" disabled={busy} className="min-h-11 font-bold underline" onClick={restart}>Start over</button>
    </div>}
  </form>
}
