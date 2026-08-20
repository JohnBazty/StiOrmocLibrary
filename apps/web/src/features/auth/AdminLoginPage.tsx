import { ArrowLeft, Eye, EyeOff, IdCard, LibraryBig, LockKeyhole, ShieldCheck } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthenticationError, login } from './auth-api'
import { clearAccessToken, getCurrentClaims, saveAccessToken } from './auth-storage'

const SCHOOL_ID = /^[A-Z0-9][A-Z0-9._-]{2,49}$/

export function AdminLoginPage() {
  const navigate = useNavigate()
  const [schoolId, setSchoolId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const claims = getCurrentClaims()
    if (claims) {
      clearAccessToken()
      setMessage(claims.role === 'Admin'
        ? 'For security, enter your administrator credentials again.'
        : 'This sign-in page is restricted to System Administrator accounts.')
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalizedSchoolId = schoolId.trim().toUpperCase()
    const nextErrors: Record<string, string> = {}
    if (!normalizedSchoolId) nextErrors.school_id = 'Administrator School ID is required.'
    else if (!SCHOOL_ID.test(normalizedSchoolId)) nextErrors.school_id = 'Enter a valid administrator School ID.'
    if (!password) nextErrors.password = 'Password is required.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setMessage(''); return }

    setBusy(true); setErrors({}); setMessage('')
    try {
      const result = await login(normalizedSchoolId, 'Admin', password)
      if (result.user.role !== 'Admin') throw new AuthenticationError('This account cannot access the Administration Portal.', 'ADMIN_ROLE_REQUIRED')
      saveAccessToken(result.token)
      navigate('/admin/dashboard', { replace: true })
    } catch (error) {
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to open the Administration Portal right now.')
      setErrors(authError.errors)
      setMessage(authError.message)
    } finally { setBusy(false) }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#003399] px-5 py-10">
      <div className="absolute -left-36 -top-36 h-96 w-96 rounded-full border-[70px] border-[#FFF200]/10" />
      <div className="absolute -bottom-44 -right-32 h-[30rem] w-[30rem] rounded-full border-[85px] border-[#FFFFFF]/5" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-between text-[#FFFFFF]"><Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-[#FFFFFF]/75 hover:text-[#FFF200]"><ArrowLeft size={17} /> User login</Link><span className="inline-flex items-center gap-2 rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-[#FFF200]"><ShieldCheck size={14} /> Restricted access</span></div>
        <section className="overflow-hidden rounded-[2rem] bg-[#FFFFFF] shadow-2xl shadow-[#003399]">
          <header className="bg-[#FFF200] px-7 py-6 text-[#003399]"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#003399] text-[#FFFFFF]"><LibraryBig /></span><div><p className="font-display text-lg font-black">STI ORMOC</p><p className="text-[10px] font-black uppercase tracking-[.18em]">Smart Library Administration</p></div></div></header>
          <div className="p-7 sm:p-9">
            <p className="text-xs font-black uppercase tracking-[.2em] text-[#003399]/50">Authorized personnel only</p><h1 className="mt-2 font-display text-3xl font-black tracking-tight text-[#003399]">Administration Portal</h1><p className="mt-3 text-sm leading-6 text-[#003399]/65">Sign in with a registered System Administrator account to manage SmartLib.</p>
            {message ? <div role="alert" className="mt-5 rounded-xl border border-[#003399] bg-[#FFF200] px-4 py-3 text-sm font-bold text-[#003399]">{message}</div> : null}
            <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
              <label className="block"><span className="text-sm font-bold text-[#003399]">Administrator School ID</span><span className="relative mt-2 block"><IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/45" size={18} /><input autoFocus autoComplete="username" value={schoolId} onChange={(event) => setSchoolId(event.target.value)} placeholder="Enter administrator ID" className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-4 text-sm uppercase text-[#003399] outline-none placeholder:normal-case placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10" /></span>{errors.school_id ? <span className="mt-2 block text-xs font-bold text-[#003399]">{errors.school_id}</span> : null}</label>
              <label className="block"><span className="text-sm font-bold text-[#003399]">Password</span><span className="relative mt-2 block"><LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/45" size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter administrator password" className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-12 text-sm text-[#003399] outline-none placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{errors.password ? <span className="mt-2 block text-xs font-bold text-[#003399]">{errors.password}</span> : null}</label>
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#003399]/65"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} className="h-4 w-4 accent-[#003399]" />Show password</label>
              <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-xl bg-[#003399] text-sm font-black uppercase tracking-[.12em] text-[#FFFFFF] shadow-lg shadow-[#003399]/20 transition hover:ring-4 hover:ring-[#FFF200] disabled:cursor-wait disabled:opacity-60">{busy ? 'Verifying administrator…' : 'Open Administration Portal'}</button>
            </form>
            <p className="mt-6 border-t border-[#003399]/10 pt-5 text-center text-xs leading-5 text-[#003399]/55">Login attempts are role-checked by the server. Student, Faculty, and Librarian accounts cannot enter this portal.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
