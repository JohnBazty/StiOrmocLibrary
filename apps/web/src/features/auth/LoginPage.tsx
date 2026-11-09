import { ArrowLeft, Eye, EyeOff, IdCard, LibraryBig, LockKeyhole, ShieldCheck } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../theme/ThemeToggle'
import { AuthMessage } from './AuthMessage'
import { login, AuthenticationError, LoginCodeRequired, verifyLoginCode, resendLoginCode, type LoginChallenge } from './auth-api'
import { getCurrentClaims, saveAccessToken } from './auth-storage'
import { catalogAuthLink, catalogLoginDestination } from '../catalog/catalog-login-continuation'
import { useAuthPopupBusy } from './PublicAuthLayout'

const SCHOOL_ID = /^[A-Z0-9][A-Z0-9._-]{2,49}$/

export function LoginPage({ popup = false }: { popup?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null)
  const [code, setCode] = useState('')
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const [schoolId, setSchoolId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  useAuthPopupBusy(busy)

  useEffect(() => {
    const claims = getCurrentClaims()
    const state = location.state as { deniedPath?: string; registrationSuccess?: boolean; registrationSchoolId?: string; sessionExpired?: boolean } | null
    if (claims) navigate(catalogLoginDestination(location.search,claims.role), { replace: true })
    else if (state?.registrationSuccess || new URLSearchParams(location.search).has('registered')) {
      if (state?.registrationSchoolId) setSchoolId(state.registrationSchoolId)
      setMessageError(false)
      setMessage('Your school email is verified. Sign in using your School ID and password.')
    } else if (state?.sessionExpired) { setMessage('You were signed out after 10 minutes of inactivity. Sign in to continue.')
    } else if (state?.deniedPath) {
      setMessage('Your account cannot open that page. Please sign in with an authorized account.')
    }
  }, [location.search, location.state, navigate])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalizedSchoolId = schoolId.trim().toUpperCase()
    const nextErrors: Record<string, string> = {}
    if (!normalizedSchoolId) nextErrors.school_id = 'School ID is required.'
    else if (!SCHOOL_ID.test(normalizedSchoolId)) nextErrors.school_id = 'Enter a valid STI school ID.'
    if (!password) nextErrors.password = 'Password is required.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setMessage(''); return }

    setBusy(true); setErrors({}); setMessage(''); setMessageError(true)
    try {
      const result = await login(normalizedSchoolId, password, 'user')
      saveAccessToken(result.token)
      navigate(catalogLoginDestination(location.search,result.user.role), { replace: true })
    } catch (error) {
      if (error instanceof LoginCodeRequired) { setChallenge(error.challenge); setPassword(''); setCode(''); setResendAt(Date.now() + 60_000); return }
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to sign in right now.')
      setErrors(authError.errors)
      setMessage(authError.message)
    } finally { setBusy(false) }
  }

  return (
    <div className={popup ? 'public-auth-form' : 'relative grid min-h-screen bg-[#FFFFFF] transition-colors lg:grid-cols-[1.05fr_.95fr] dark:bg-[#000d2b]'}>
      {!popup && <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><ThemeToggle /></div>}
      {!popup && <section className="relative hidden overflow-hidden bg-[#003399] p-12 text-[#FFFFFF] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border-[70px] border-[#FFF200]/10" />
        <div className="relative flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF200] text-[#003399]"><LibraryBig /></span><div><p className="font-display text-lg font-black">STI COLLEGE ORMOC</p><p className="text-xs font-bold uppercase tracking-[.18em] text-[#FFFFFF]/70">ILMS</p></div></div>
        <div className="relative max-w-xl"><span className="inline-flex rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-4 py-2 text-xs font-bold uppercase tracking-[.16em] text-[#FFF200]">Secure campus access</span><h1 className="mt-7 font-display text-5xl font-black leading-tight">STI College Ormoc Integrated Library Management System</h1></div>
        <div className="relative flex items-center gap-3 text-sm text-[#FFFFFF]/70"><ShieldCheck className="text-[#FFF200]" /><span>Access your library account securely.</span></div>
      </section>}

      <section className={popup ? '' : 'flex items-center justify-center p-5 sm:p-10'}>
        <div className={popup ? 'w-full' : 'w-full max-w-md'}>
          {!popup && <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]"><LibraryBig /></span><div><p className="font-display font-black text-[#003399]">STI COLLEGE ORMOC</p><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#003399]/60">ILMS</p></div></div>}
          {!popup && <Link to="/#catalog" className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 py-2.5 text-sm font-bold text-[#003399] transition hover:bg-[#003399]/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#003399] dark:border-white/20 dark:bg-[#001a4d] dark:text-white dark:hover:bg-white/10"><ArrowLeft size={18} aria-hidden="true" />Back to browsing</Link>}
          {!popup && <p className="text-xs font-black uppercase tracking-[.18em] text-[#003399]/55">Welcome back</p>}<h2 id={popup ? 'auth-form-heading' : undefined} className={`mt-2 font-display ${popup ? 'text-3xl' : 'text-4xl'} font-black tracking-tight text-[#003399]`}>Log In</h2>
          {popup && <p className="mt-2 text-sm leading-relaxed opacity-65">Sign in to borrow books and manage your library activity.</p>}
          {catalogAuthLink('/login',location.search)!=='/login'&&<p className="mt-3 text-sm text-[#003399]/75">Sign in to continue with your selected book. New here? Register an account below. Borrowing becomes available after email verification and account approval.</p>}
          {message ? <AuthMessage error={messageError}>{message}</AuthMessage> : null}
          {challenge ? <form className="mt-7 space-y-4" onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setMessage(''); try { const result = await verifyLoginCode(challenge.challengeId, code); saveAccessToken(result.token); navigate(catalogLoginDestination(location.search, result.user.role), { replace: true }) } catch (error) { setMessageError(true); setMessage(error instanceof Error ? error.message : 'The code could not be verified.') } finally { setBusy(false) } }}>
            <p className="text-sm">Enter the six-digit code sent to <strong>{challenge.emailHint}</strong>. It expires in 10 minutes.</p>
            <label className="block text-sm font-bold">Login code<input className="mt-2 h-13 w-full rounded-xl border p-3 text-lg" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} autoFocus /></label>
            <button disabled={busy || code.length !== 6} className="min-h-11 w-full rounded-xl bg-[#003399] p-3 font-bold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Verify and sign in'}</button>
            <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || now < resendAt} className="min-h-11 underline disabled:opacity-50" onClick={async () => { setBusy(true); setMessage(''); try { await resendLoginCode(challenge.challengeId); setResendAt(Date.now() + 60_000); setMessageError(false); setMessage('A new code was sent. Use the newest code.') } catch (error) { setMessageError(true); setMessage(error instanceof Error ? error.message : 'Unable to resend.') } finally { setBusy(false) } }}>{now < resendAt ? `Resend in ${Math.ceil((resendAt - now) / 1000)}s` : 'Resend code'}</button><button type="button" disabled={busy} className="min-h-11 underline" onClick={() => { setChallenge(null); setCode(''); setMessage('') }}>Back to login</button></div>
          </form> : <form className="mt-7 space-y-5" onSubmit={submit} autoComplete="off" noValidate>
            <label className="block"><span className="text-sm font-bold text-[#003399]">Student Number / Faculty ID</span><span className="relative mt-2 block"><IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/50" size={18} /><input aria-invalid={Boolean(errors.school_id)} aria-describedby={errors.school_id ? 'login-school_id-error' : undefined} autoComplete="off" autoFocus value={schoolId} onChange={(event) => setSchoolId(event.target.value)} placeholder="Enter your Student or Faculty ID" className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-4 text-sm uppercase text-[#003399] outline-none transition placeholder:normal-case placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10" /></span>{errors.school_id ? <span id="login-school_id-error" className="field-error mt-2 block text-xs font-bold">{errors.school_id}</span> : null}</label>
            <label className="block"><span className="text-sm font-bold text-[#003399]">Password</span><span className="relative mt-2 block"><LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/50" size={18} /><input type={showPassword ? 'text' : 'password'} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'login-password-error' : undefined} autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-12 text-sm text-[#003399] outline-none transition placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{errors.password ? <span id="login-password-error" className="field-error mt-2 block text-xs font-bold">{errors.password}</span> : null}</label>
            {!popup && <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#003399]/70"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} className="h-4 w-4 accent-[#003399]" />Show password</label>}
            <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-xl bg-[#003399] px-5 text-sm font-black text-[#FFFFFF] shadow-lg shadow-[#003399]/15 transition hover:bg-[#003399]/90 disabled:cursor-wait disabled:opacity-60">{busy ? 'Verifying account…' : 'Log In'}</button>
          </form>}
          <p className="mt-5 text-right"><Link to="/forgot-password" onClick={event => { if (busy) event.preventDefault() }} className="text-sm font-bold text-[#003399] underline">Forgot Password?</Link></p>
          {!popup && <p className="mt-7 text-center text-sm text-[#003399]/70">Don&apos;t have an account? <Link to={catalogAuthLink('/register',location.search)} state={location.state} onClick={event => { if (busy) event.preventDefault() }} className="font-black text-[#003399] underline decoration-[#FFF200] decoration-4 underline-offset-4">Register an account</Link></p>}
        </div>
      </section>
    </div>
  )
}
