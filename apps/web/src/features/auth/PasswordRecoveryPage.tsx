import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthMessage } from './AuthMessage'
import { requestPasswordRecovery, verifyPasswordRecovery, resetPassword } from './auth-api'
import { clearAccessToken, setSessionIdentity } from './auth-storage'

const field = 'mt-2 h-12 w-full rounded-xl border border-[#003399]/20 bg-white px-4 text-[#003399] focus:outline-none focus:ring-4 focus:ring-[#003399]/15'
export function PasswordRecoveryPage() {
  const [stage, setStage] = useState<'request' | 'verify' | 'reset' | 'done'>('request')
  const [identifier, setIdentifier] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  // Keep the short-lived reset token in component memory, never URL/local storage.
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  async function requestCode() {
    const result = await requestPasswordRecovery(identifier.trim())
    setChallengeId(result.challengeId); setMessage(result.message); setStage('verify'); setCode(''); setRetryAt(Date.now() + 60_000)
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (stage === 'request') await requestCode()
      else if (stage === 'verify') {
        const result = await verifyPasswordRecovery(challengeId, code)
        setResetToken(result.resetToken); setCode(''); setStage('reset'); setMessage('Code verified. Choose a new password within five minutes.')
      } else if (stage === 'reset') {
        if (password.length < 8 || password !== confirmation) throw new Error('Use at least 8 characters and matching passwords.')
        const result = await resetPassword(challengeId, resetToken, password, confirmation)
        clearAccessToken(); setSessionIdentity(null); setResetToken(''); setPassword(''); setConfirmation(''); setStage('done'); setMessage(result.message)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Password recovery is unavailable. Please try again.') }
    finally { setBusy(false) }
  }
  async function resend() {
    if (Date.now() < retryAt) { setError('Wait one minute before requesting another code.'); return }
    setBusy(true); setError('')
    try { await requestCode() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to request a code.') }
    finally { setBusy(false) }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#003399] px-4 py-10">
    <section className="w-full max-w-md rounded-3xl bg-white p-7 text-[#003399] shadow-xl sm:p-9">
      <p className="text-xs font-black tracking-widest">STI COLLEGE ORMOC · SMART LIBRARY</p>
      <h1 className="mt-3 font-display text-3xl font-black">Forgot Password</h1>
      <p className="mt-3 text-sm">Student accounts can recover access using the school email saved on their account.</p>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {message ? <AuthMessage error={false}>{message}</AuthMessage> : null}
      {stage !== 'done' ? <form className="mt-6 space-y-5" onSubmit={submit}>
        {stage === 'request' ? <label className="block text-sm font-bold">School ID or school email<input className={field} required autoComplete="username" value={identifier} onChange={event => setIdentifier(event.target.value)} maxLength={254} /></label> : null}
        {stage === 'verify' ? <><label className="block text-sm font-bold">Verification code<input className={field} autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /></label><p className="text-sm">The code expires in 10 minutes. Three incorrect codes lock recovery for 15 minutes.</p></> : null}
        {stage === 'reset' ? <><label className="block text-sm font-bold">New password<input type="password" className={field} required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label><label className="block text-sm font-bold">Confirm new password<input type="password" className={field} required autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label></> : null}
        <button disabled={busy} className="h-12 w-full rounded-xl bg-[#003399] font-bold text-white disabled:opacity-60">{busy ? 'Please wait…' : stage === 'request' ? 'Send verification code' : stage === 'verify' ? 'Verify code' : 'Update password'}</button>
        {stage === 'verify' ? <button type="button" disabled={busy} onClick={() => void resend()} className="text-sm font-bold underline">Resend code</button> : null}
        {stage !== 'request' ? <button type="button" disabled={busy} onClick={() => { setStage('request'); setResetToken(''); setChallengeId(''); setCode(''); setPassword(''); setConfirmation(''); setMessage(''); setError('') }} className="ml-4 text-sm underline">Start again</button> : null}
      </form> : null}
      <Link to="/login" className="mt-6 inline-block text-sm font-bold underline">Return to Log In</Link>
    </section>
  </main>
}
