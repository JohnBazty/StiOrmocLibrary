import { Eye, EyeOff, IdCard, LibraryBig, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login, AuthenticationError } from './auth-api'
import { dashboardForRole, getCurrentClaims, saveAccessToken, type AuthRole } from './auth-storage'

const SCHOOL_ID = /^[A-Z0-9][A-Z0-9._-]{2,49}$/
const ROLES: AuthRole[] = ['Student', 'Faculty', 'Librarian']

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [schoolId, setSchoolId] = useState('')
  const [role, setRole] = useState<AuthRole>('Student')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const claims = getCurrentClaims()
    const state = location.state as { deniedPath?: string; registrationSuccess?: boolean; registrationSchoolId?: string } | null
    if (claims) navigate(dashboardForRole(claims.role), { replace: true })
    else if (state?.registrationSuccess || new URLSearchParams(location.search).has('registered')) {
      if (state?.registrationSchoolId) setSchoolId(state.registrationSchoolId)
      setMessage('Account created successfully! Sign in using your Student ID and password.')
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
    if (!role) nextErrors.login_as = 'Select the account role you are signing in as.'
    if (!password) nextErrors.password = 'Password is required.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setMessage(''); return }

    setBusy(true); setErrors({}); setMessage('')
    try {
      const result = await login(normalizedSchoolId, role, password)
      saveAccessToken(result.token)
      navigate(dashboardForRole(result.user.role), { replace: true })
    } catch (error) {
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to sign in right now.')
      setErrors(authError.errors)
      setMessage(authError.message)
    } finally { setBusy(false) }
  }

  return (
    <main className="grid min-h-screen bg-[#FFFFFF] lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-[#003399] p-12 text-[#FFFFFF] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border-[70px] border-[#FFF200]/10" />
        <div className="relative flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF200] text-[#003399]"><LibraryBig /></span><div><p className="font-display text-lg font-black">STI ORMOC</p><p className="text-xs font-bold uppercase tracking-[.18em] text-[#FFFFFF]/70">Smart Library</p></div></div>
        <div className="relative max-w-xl"><span className="inline-flex rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-4 py-2 text-xs font-bold uppercase tracking-[.16em] text-[#FFF200]">Secure campus access</span><h1 className="mt-7 font-display text-5xl font-black leading-tight">Knowledge, research, and services in one secure space.</h1><p className="mt-5 max-w-lg text-lg leading-8 text-[#FFFFFF]/75">Select your account role, then sign in with the school ID registered in SmartLib.</p></div>
        <div className="relative flex items-center gap-3 text-sm text-[#FFFFFF]/70"><ShieldCheck className="text-[#FFF200]" /><span>Role-protected access with short-lived security tokens</span></div>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]"><LibraryBig /></span><div><p className="font-display font-black text-[#003399]">STI ORMOC</p><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#003399]/60">Smart Library</p></div></div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#003399]/55">Welcome back</p><h2 className="mt-2 font-display text-4xl font-black tracking-tight text-[#003399]">Login</h2><p className="mt-3 text-sm leading-6 text-[#003399]/65">Sign in with your School ID and password.</p>
          {message ? <div role="alert" className="mt-6 rounded-xl border border-[#003399] bg-[#FFF200] px-4 py-3 text-sm font-semibold text-[#003399]">{message}</div> : null}
          <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
            <label className="block"><span className="text-sm font-bold text-[#003399]">Login as</span><span className="relative mt-2 block"><UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/50" size={18} /><select value={role} onChange={(event) => setRole(event.target.value as AuthRole)} className="h-13 w-full appearance-none rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-4 text-sm font-semibold text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10">{ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select></span>{errors.login_as ? <span className="mt-2 block text-xs font-bold text-[#003399]">{errors.login_as}</span> : null}</label>
            <label className="block"><span className="text-sm font-bold text-[#003399]">School ID</span><span className="relative mt-2 block"><IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/50" size={18} /><input autoComplete="username" autoFocus value={schoolId} onChange={(event) => setSchoolId(event.target.value)} placeholder="Enter your Student, Faculty, or Staff ID" className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-4 text-sm uppercase text-[#003399] outline-none transition placeholder:normal-case placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10" /></span>{errors.school_id ? <span className="mt-2 block text-xs font-bold text-[#003399]">{errors.school_id}</span> : null}</label>
            <label className="block"><span className="text-sm font-bold text-[#003399]">Password</span><span className="relative mt-2 block"><LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/50" size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-12 text-sm text-[#003399] outline-none transition placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{errors.password ? <span className="mt-2 block text-xs font-bold text-[#003399]">{errors.password}</span> : null}</label>
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#003399]/70"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} className="h-4 w-4 accent-[#003399]" />Show password</label>
            <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-xl bg-[#003399] px-5 text-sm font-black text-[#FFFFFF] shadow-lg shadow-[#003399]/15 transition hover:bg-[#003399]/90 disabled:cursor-wait disabled:opacity-60">{busy ? 'Verifying account…' : 'Login'}</button>
          </form>
          <p className="mt-7 text-center text-sm text-[#003399]/70">Don&apos;t have an account? <Link to="/register" className="font-black text-[#003399] underline decoration-[#FFF200] decoration-4 underline-offset-4">Register as Student</Link></p>
          <div className="mt-6 border-t border-[#003399]/10 pt-6 text-center"><Link to="/admin/login" className="inline-flex items-center gap-2 rounded-xl border border-[#003399]/20 px-4 py-2.5 text-xs font-black text-[#003399] hover:bg-[#FFF200]"><ShieldCheck size={15} /> System Administrator Login</Link><p className="mt-3 text-xs leading-5 text-[#003399]/55">Faculty and staff accounts are issued by the campus library.</p></div>
        </div>
      </section>
    </main>
  )
}
