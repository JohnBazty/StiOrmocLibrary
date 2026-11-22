import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AuthMessage } from './AuthMessage'
import { OtpCodeInput } from './OtpCodeInput'
import { rosterRegistrationRequest } from './auth-api'

type Props = {
  role?: 'Student'|'Faculty'
  fieldClass: string
  busy: boolean
  onBusy: (busy: boolean) => void
  onComplete: (schoolId: string) => void
}

export function RosterRegistrationForm({ fieldClass, busy, onBusy, onComplete, role='Student' }: Props) {
  const [schoolId, setSchoolId] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [grant, setGrant] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [canResend, setCanResend] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const lastAutoCode = useRef('')
  const normalizedId = schoolId.trim().toUpperCase()
  const validId = /^[A-Z0-9][A-Z0-9._-]{2,49}$/.test(normalizedId)

  useEffect(() => {
    if (!retryAt) return
    const timer = window.setTimeout(() => setCanResend(true), Math.max(0, retryAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [retryAt])

  async function requestCode() {
    const result = await rosterRegistrationRequest<{ challengeId: string }>('/begin', { school_id: normalizedId }, undefined, role)
    lastAutoCode.current = ''
    setChallengeId(result.challengeId)
    setCode('')
    setCanResend(false)
    setRetryAt(Date.now() + 60_000)
  }

  async function verifyEmailCode(nextCode: string) {
    const result = await rosterRegistrationRequest<{ grant: string }>('/verify', { challenge_id: challengeId, code: nextCode }, undefined, role)
    setGrant(result.grant)
    setCode('')
  }

  async function run(action: () => Promise<void>) {
    if (busy || inFlight.current) return
    inFlight.current = true
    onBusy(true)
    setError('')
    try { await action() }
    catch (err) { setError(err instanceof Error ? err.message : 'Try again in a moment.') }
    finally { inFlight.current = false; onBusy(false) }
  }

  useEffect(() => {
    if (code.length < 6) {
      lastAutoCode.current = ''
      return
    }
    if (!challengeId || grant || busy || inFlight.current) return
    if (lastAutoCode.current === code) return
    lastAutoCode.current = code
    void run(() => verifyEmailCode(code))
  }, [challengeId, grant, busy, code])

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      if (!challengeId) return requestCode()
      if (!grant) return verifyEmailCode(code)
      if (password !== confirmation) {
        setError('The passwords do not match.')
        return
      }
      const result = await rosterRegistrationRequest<{ schoolId: string }>('/complete', {
        challenge_id: challengeId, grant, password, confirm_password: confirmation,
      }, undefined, role)
      onComplete(result.schoolId)
    })
  }

  function restart() {
    lastAutoCode.current = ''
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
      <p className="text-sm">Enter the {role} ID on your school record. We use the school email on the enrollment roster.</p>
      <label className="block space-y-2 text-sm font-bold">{role} ID
        <input required maxLength={50} autoComplete="username" className={fieldClass} value={schoolId} disabled={busy}
          aria-invalid={schoolId.trim().length > 0 && !validId ? true : undefined}
          onChange={event => setSchoolId(event.target.value)} />
      </label>
      {schoolId.trim().length > 0 && !validId && (
        <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">Enter a valid {role} ID (at least 3 letters, numbers, dots, underscores, or hyphens).</p>
      )}
    </> : !grant ? <>
      <p role="status" className="text-sm">A 6-digit verification code was sent to your school email. Check your inbox and spam folder.</p>
      <OtpCodeInput label="Email verification code" value={code} onChange={setCode} disabled={busy} autoFocus />
      {code.length > 0 && code.length < 6 && (
        <p className="text-xs text-slate-600 dark:text-slate-300">Enter all 6 digits from the email.</p>
      )}
    </> : <>
      <p role="status" className="text-sm">School email verified. Set a password to finish activating your account.</p>
      <label className="block space-y-2 text-sm font-bold">Password
        <input required autoFocus type="password" minLength={8} maxLength={72} autoComplete="new-password"
          className={fieldClass} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
      </label>
      {password.length > 0 && password.length < 8 && (
        <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">Use at least 8 characters.</p>
      )}
      <label className="block space-y-2 text-sm font-bold">Confirm password
        <input required type="password" minLength={8} maxLength={72} autoComplete="new-password"
          className={fieldClass} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
      </label>
      {confirmation.length > 0 && password !== confirmation && (
        <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">The passwords do not match.</p>
      )}
    </>}
    <button className="min-h-12 w-full rounded-xl bg-[#FFF200] px-4 font-bold text-[#0b5ea2] disabled:opacity-55"
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
