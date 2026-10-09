import { IdCard, LibraryBig, ShieldCheck } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../theme/ThemeToggle'
import { AuthenticationError, login } from './auth-api'
import { AuthAlertBanner, FieldError, PasswordField, RATE_LIMIT_MESSAGE } from './auth-form'
import { clearAccessToken, dashboardForRole, getCurrentClaims, saveAccessToken } from './auth-storage'

const SCHOOL_ID = /^[A-Z0-9][A-Z0-9._-]{2,49}$/

export function AdminLoginPage() {
  const navigate = useNavigate()
  const passwordRef = useRef<HTMLInputElement>(null)
  const [schoolId, setSchoolId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const claims = getCurrentClaims()
    if (claims) {
      clearAccessToken()
      setBanner('For security, enter your staff credentials again.')
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalizedSchoolId = schoolId.trim().toUpperCase()
    const nextErrors: Record<string, string> = {}
    if (!normalizedSchoolId) nextErrors.school_id = 'Staff School ID is required.'
    else if (!SCHOOL_ID.test(normalizedSchoolId)) nextErrors.school_id = 'Enter a valid staff School ID.'
    if (!password) nextErrors.password = 'Password is required.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setBanner(''); return }

    setBusy(true); setErrors({}); setBanner('')
    try {
      const result = await login(normalizedSchoolId, password, 'staff')
      saveAccessToken(result.token)
      navigate(result.redirect || dashboardForRole(result.user.role), { replace: true })
    } catch (error) {
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to sign in right now.')
      setErrors(authError.errors)
      setBanner(authError.code === 'TOO_MANY_LOGIN_ATTEMPTS' ? RATE_LIMIT_MESSAGE : authError.message)
      setPassword('')
      passwordRef.current?.focus()
    } finally { setBusy(false) }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#003399] px-5 py-10">
      <div className="absolute -left-36 -top-36 h-96 w-96 rounded-full border-[70px] border-[#FFF200]/10" />
      <div className="absolute -bottom-44 -right-32 h-[30rem] w-[30rem] rounded-full border-[85px] border-[#FFFFFF]/5" />
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><ThemeToggle className="rounded-xl border border-white/20 bg-white/10 p-2.5 text-white transition hover:bg-white/20" /></div>
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-end text-[#FFFFFF]">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-[#FFF200]">
            <ShieldCheck size={14} /> Restricted access
          </span>
        </div>
        <section className="overflow-hidden rounded-[2rem] bg-[#FFFFFF] shadow-2xl shadow-[#003399]">
          <header className="bg-[#FFF200] px-7 py-6 text-[#003399]">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#003399] text-[#FFFFFF]"><LibraryBig /></span>
              <div>
                <p className="font-display text-lg font-black">STI ORMOC</p>
                <p className="text-[10px] font-black uppercase tracking-[.18em]">Smart Library Staff</p>
              </div>
            </div>
          </header>
          <div className="p-7 sm:p-9">
            <p className="text-xs font-black uppercase tracking-[.2em] text-[#003399]/50">Authorized personnel only</p>
            <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-[#003399]">Staff sign-in</h1>
            {banner ? <AuthAlertBanner>{banner}</AuthAlertBanner> : null}
            <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
              <div>
                <label className="block" htmlFor="admin-school-id">
                  <span className="text-sm font-bold text-[#003399]">School ID</span>
                  <span className="relative mt-2 block">
                    <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/45" size={18} />
                    <input id="admin-school-id" autoFocus autoComplete="username" value={schoolId} onChange={(event) => setSchoolId(event.target.value)} aria-invalid={errors.school_id ? true : undefined} aria-describedby={errors.school_id ? 'admin-school-id-error' : undefined} placeholder="Enter staff School ID" className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-4 text-sm uppercase text-[#003399] outline-none placeholder:normal-case placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10" />
                  </span>
                </label>
                <FieldError id="admin-school-id-error">{errors.school_id}</FieldError>
              </div>
              <PasswordField id="admin-password" label="Password" value={password} onChange={setPassword} error={errors.password} inputRef={passwordRef} placeholder="Enter password" forgotHint="librarian" />
              <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-xl bg-[#003399] text-sm font-black uppercase tracking-[.12em] text-[#FFFFFF] shadow-lg shadow-[#003399]/20 transition hover:ring-4 hover:ring-[#FFF200] disabled:cursor-wait disabled:opacity-60">{busy ? 'Verifying…' : 'Log In'}</button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
