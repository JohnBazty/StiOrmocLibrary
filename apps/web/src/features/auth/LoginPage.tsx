import { IdCard, LibraryBig, ShieldCheck } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../theme/ThemeToggle'
import { AuthenticationError, login } from './auth-api'
import { AuthAlertBanner, AuthStatusBanner, FieldError, PasswordField, RATE_LIMIT_MESSAGE } from './auth-form'
import { dashboardForRole, getCurrentClaims, saveAccessToken } from './auth-storage'

const SCHOOL_ID = /^[A-Z0-9][A-Z0-9._-]{2,49}$/

type Banner = { tone: 'status' | 'alert'; text: string }

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const passwordRef = useRef<HTMLInputElement>(null)
  const [schoolId, setSchoolId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const claims = getCurrentClaims()
    const state = location.state as { deniedPath?: string; registrationSuccess?: boolean; registrationSchoolId?: string; passwordReset?: boolean } | null
    if (claims) navigate(dashboardForRole(claims.role), { replace: true })
    else if (state?.passwordReset) {
      setBanner({ tone: 'status', text: 'Password updated. Sign in with your new password.' })
    } else if (state?.registrationSuccess || new URLSearchParams(location.search).has('registered')) {
      if (state?.registrationSchoolId) setSchoolId(state.registrationSchoolId)
      setBanner({ tone: 'status', text: 'Account created successfully! Sign in using your Student ID and password.' })
    } else if (state?.deniedPath) {
      setBanner({ tone: 'alert', text: 'Your account cannot open that page. Please sign in with an authorized account.' })
    }
  }, [location.search, location.state, navigate])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalizedSchoolId = schoolId.trim().toUpperCase()
    const nextErrors: Record<string, string> = {}
    if (!normalizedSchoolId) nextErrors.school_id = 'School ID is required.'
    else if (!SCHOOL_ID.test(normalizedSchoolId)) nextErrors.school_id = 'Enter a valid STI school ID.'
    if (!password) nextErrors.password = 'Password is required.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setBanner(null); return }

    setBusy(true); setErrors({}); setBanner(null)
    try {
      const result = await login(normalizedSchoolId, password, 'user')
      saveAccessToken(result.token)
      navigate(dashboardForRole(result.user.role), { replace: true })
    } catch (error) {
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to sign in right now.')
      setErrors(authError.errors)
      setBanner({
        tone: 'alert',
        text: authError.code === 'TOO_MANY_LOGIN_ATTEMPTS' ? RATE_LIMIT_MESSAGE : authError.message,
      })
      setPassword('')
      passwordRef.current?.focus()
    } finally { setBusy(false) }
  }

  return (
    <main className="relative grid min-h-screen bg-[#FFFFFF] transition-colors lg:grid-cols-[1.05fr_.95fr] dark:bg-[#000d2b]">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><ThemeToggle /></div>
      <section className="relative hidden overflow-hidden bg-[#003399] p-12 text-[#FFFFFF] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border-[70px] border-[#FFF200]/10" />
        <div className="relative flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF200] text-[#003399]"><LibraryBig /></span><div><p className="font-display text-lg font-black">STI College Ormoc</p><p className="text-xs font-bold uppercase tracking-[.18em] text-[#FFFFFF]/70">ILMS</p></div></div>
        <div className="relative max-w-xl"><span className="inline-flex rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-4 py-2 text-xs font-bold uppercase tracking-[.16em] text-[#FFF200]">Secure campus access</span><h1 className="mt-7 font-display text-5xl font-black leading-tight"><span className="block">STI College Ormoc</span><span className="mt-2 block text-3xl leading-snug sm:text-4xl">Integrated Library Management System</span></h1></div>
        <div className="relative flex items-center gap-3 text-sm text-[#FFFFFF]/70"><ShieldCheck className="text-[#FFF200]" /><span>Role-protected access with short-lived security tokens</span></div>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]"><LibraryBig /></span><div><p className="font-display font-black text-[#003399]">STI College Ormoc</p><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#003399]/60">ILMS</p></div></div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#003399]/55">Welcome back</p>
          <h2 className="mt-2 font-display text-4xl font-black tracking-tight text-[#003399]">Login</h2>
          {banner?.tone === 'status' ? <AuthStatusBanner>{banner.text}</AuthStatusBanner> : null}
          {banner?.tone === 'alert' ? <AuthAlertBanner>{banner.text}</AuthAlertBanner> : null}
          <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
            <div>
              <label className="block" htmlFor="school-id">
                <span className="text-sm font-bold text-[#003399]">School ID</span>
                <span className="relative mt-2 block">
                  <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/50" size={18} />
                  <input id="school-id" autoComplete="username" autoFocus value={schoolId} onChange={(event) => setSchoolId(event.target.value)} aria-invalid={errors.school_id ? true : undefined} aria-describedby={errors.school_id ? 'school-id-error' : undefined} placeholder="Enter your Student or Faculty ID" className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-4 text-sm uppercase text-[#003399] outline-none transition placeholder:normal-case placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10" />
                </span>
              </label>
              <FieldError id="school-id-error">{errors.school_id}</FieldError>
            </div>
            <PasswordField id="password" label="Password" value={password} onChange={setPassword} error={errors.password} inputRef={passwordRef} placeholder="Enter your password" forgotHint="none" />
            <p className="text-right text-sm"><Link to="/forgot-password" className="font-semibold text-[#003399] underline decoration-[#003399]/20 underline-offset-4">Forgot Password?</Link></p>
            <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-xl bg-[#003399] px-5 text-sm font-black text-[#FFFFFF] shadow-lg shadow-[#003399]/15 transition hover:bg-[#003399]/90 disabled:cursor-wait disabled:opacity-60">{busy ? 'Verifying account…' : 'Log In'}</button>
          </form>
          <p className="mt-7 text-center text-sm text-[#003399]/70">Don&apos;t have an account? <Link to="/register" className="font-black text-[#003399] underline decoration-[#FFF200] decoration-4 underline-offset-4">Register as Student</Link></p>
        </div>
      </section>
    </main>
  )
}
