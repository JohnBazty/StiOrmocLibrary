import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AuthMessage } from './AuthMessage'
import { changePassword, restoreCookieSession } from './auth-api'
import { getCsrfToken, getStoredClaims, passwordChangeRequired } from './auth-storage'

const field = 'mt-2 h-12 w-full rounded-xl border border-[#003399]/20 bg-white px-4 text-[#003399] focus:outline-none focus:ring-4 focus:ring-[#003399]/15'

/** Required after an Admin sets a temporary password; also open to any signed-in account. */
export function ChangePasswordPage() {
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // null = still asking the API; a new tab has the cookie but not yet the CSRF token.
  const [signedIn, setSignedIn] = useState<boolean | null>(() => getCsrfToken() ? true : null)
  useEffect(() => {
    if (signedIn === null) void restoreCookieSession().then(identity => setSignedIn(Boolean(identity)))
  }, [signedIn])
  if (signedIn === null) return <main className="flex min-h-screen items-center justify-center bg-[#003399] text-white" aria-busy="true">Please wait…</main>
  if (!signedIn || (!getCsrfToken() && !busy)) return <Navigate to="/login" replace />
  const claims = getStoredClaims(true)
  const required = passwordChangeRequired()
  const staff = claims ? ['Admin', 'Librarian', 'Staff'].includes(claims.role) : false

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (password.length < 8 || password !== confirmation) { setError('Use at least 8 characters and matching passwords.'); return }
    setBusy(true)
    try {
      const result = await changePassword(current, password, confirmation)
      navigate(staff ? '/staff' : '/login', { replace: true, state: { passwordChanged: result.message } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your password could not be changed. Try again.')
      setBusy(false)
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#003399] px-4 py-10">
    <section className="w-full max-w-md rounded-3xl bg-white p-7 text-[#003399] shadow-xl sm:p-9">
      <h1 className="font-display text-3xl font-black">Change your password</h1>
      <p className="mt-3 text-sm">{required ? 'The library set a temporary password for you. Choose your own password to continue.' : 'Choose a new password. You will sign in again afterwards.'}</p>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <form className="mt-6 space-y-5" onSubmit={submit}>
        <label className="block text-sm font-bold">{required ? 'Temporary password' : 'Current password'}<input type="password" className={field} required autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} /></label>
        <label className="block text-sm font-bold">New password<input type="password" className={field} required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label className="block text-sm font-bold">Confirm new password<input type="password" className={field} required autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <button disabled={busy} className="h-12 w-full rounded-xl bg-[#003399] font-bold text-white disabled:opacity-60">{busy ? 'Please wait…' : 'Change password'}</button>
      </form>
    </section>
  </main>
}
