import { ArrowLeft, Eye, EyeOff, IdCard, LibraryBig, LockKeyhole, ShieldCheck } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../theme/ThemeToggle'
import { AuthMessage } from './AuthMessage'
import { AuthenticationError, DeviceSwitchRequired, confirmDeviceSwitch, login, resumeDeviceSession, saveLogin, type LoginResult } from './auth-api'
import { dashboardForRole, getCurrentClaims, type AuthRole } from './auth-storage'
import { DeviceSwitchPrompt } from './DeviceSwitchPrompt'

const SCHOOL_ID = /^[A-Z0-9][A-Z0-9._-]{2,49}$/
const STAFF_ROLES: AuthRole[] = ['Admin', 'Librarian', 'Staff']

function staffDestination(role: AuthRole, path?: string) {
  return path && new RegExp(`^/${role.toLowerCase()}(?:[/?#]|$)`).test(path) ? path : dashboardForRole(role)
}

export function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const deniedPath = (location.state as { deniedPath?: string } | null)?.deniedPath
  const [schoolId, setSchoolId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(() => (location.state as { passwordChanged?: string } | null)?.passwordChanged ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [switchToken, setSwitchToken] = useState('')

  useEffect(() => {
    const claims = getCurrentClaims()
    if (claims) { navigate(staffDestination(claims.role, deniedPath), { replace: true }); return }
    let active = true
    void resumeDeviceSession().then(identity => {
      if (active && identity) navigate(staffDestination(identity.role, deniedPath), { replace: true })
    }).catch(() => {
      if (active) setMessage('Your device could not reconnect. Check your connection and try again.')
    })
    return () => { active = false }
  }, [navigate, deniedPath])

  function finish(result: LoginResult) {
    if (!STAFF_ROLES.includes(result.user.role)) throw new AuthenticationError('This account cannot access the Staff Portal.', 'STAFF_ROLE_REQUIRED')
    saveLogin(result)
    navigate(staffDestination(result.user.role, deniedPath), { replace: true })
  }

  async function switchDevice() {
    setBusy(true)
    setMessage('')
    try { finish(await confirmDeviceSwitch(switchToken)) }
    catch (error) {
      if (error instanceof AuthenticationError && error.code === 'DEVICE_SWITCH_EXPIRED') setSwitchToken('')
      setMessage(error instanceof AuthenticationError ? error.message : 'Unable to switch devices right now.')
    } finally { setBusy(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalizedSchoolId = schoolId.trim().toUpperCase()
    const nextErrors: Record<string, string> = {}
    if (!normalizedSchoolId) nextErrors.school_id = 'School ID is required.'
    else if (!SCHOOL_ID.test(normalizedSchoolId)) nextErrors.school_id = 'Enter a valid School ID.'
    if (!password) nextErrors.password = 'Password is required.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setMessage(''); return }

    setBusy(true); setErrors({}); setMessage('')
    try {
      finish(await login(normalizedSchoolId, password, 'staff'))
    } catch (error) {
      if (error instanceof DeviceSwitchRequired) { setPassword(''); setSwitchToken(error.switchToken); return }
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to open the Library Personnel Login right now.')
      setErrors(authError.errors)
      setMessage(authError.message)
    } finally { setBusy(false) }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b5ea2] px-5 py-10">
      <div className="absolute -left-36 -top-36 h-96 w-96 rounded-full border-[70px] border-[#FFF200]/10" />
      <div className="absolute -bottom-44 -right-32 h-[30rem] w-[30rem] rounded-full border-[85px] border-[#FFFFFF]/5" />
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><ThemeToggle className="rounded-xl border border-white/20 bg-white/10 p-2.5 text-white transition hover:bg-white/20" /></div>
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-between text-[#FFFFFF]"><Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-[#FFFFFF]/75 hover:text-[#FFF200]"><ArrowLeft size={17} /> User login</Link><span className="inline-flex items-center gap-2 rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-[#FFF200]"><ShieldCheck size={14} /> Restricted access</span></div>
        <section className="overflow-hidden rounded-[2rem] bg-[#FFFFFF] shadow-2xl shadow-[#0b5ea2]">
          <header className="bg-[#FFF200] px-7 py-6 text-[#0b5ea2]"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b5ea2] text-[#FFFFFF]"><LibraryBig /></span><div><p className="font-display text-lg font-black">STI COLLEGE ORMOC</p><p className="text-[10px] font-black uppercase tracking-[.18em]">ILMS Administration</p></div></div></header>
          <div className="p-7 sm:p-9">
            <p className="text-xs font-black uppercase tracking-[.2em] text-[#0b5ea2]/50">Authorized personnel only</p><h1 className="mt-2 font-display text-3xl font-black tracking-tight text-[#0b5ea2]">Library Personnel Login</h1>
            {message ? <AuthMessage>{message}</AuthMessage> : null}
            {switchToken ? <DeviceSwitchPrompt busy={busy} onConfirm={() => { void switchDevice() }} onCancel={() => { setSwitchToken(''); setMessage('') }} /> : <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
              <label className="block"><span className="text-sm font-bold text-[#0b5ea2]">School ID</span><span className="relative mt-2 block"><IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0b5ea2]/45" size={18} /><input aria-invalid={Boolean(errors.school_id)} autoFocus autoComplete="username" value={schoolId} onChange={(event) => setSchoolId(event.target.value)} placeholder="Enter School ID" className="h-13 w-full rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] pl-12 pr-4 text-sm uppercase text-[#0b5ea2] outline-none placeholder:normal-case placeholder:text-[#0b5ea2]/40 focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10" /></span>{errors.school_id ? <span className="field-error mt-2 block text-xs font-bold">{errors.school_id}</span> : null}</label>
              <label className="block"><span className="text-sm font-bold text-[#0b5ea2]">Password</span><span className="relative mt-2 block"><LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0b5ea2]/45" size={18} /><input type={showPassword ? 'text' : 'password'} aria-invalid={Boolean(errors.password)} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="h-13 w-full rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] pl-12 pr-12 text-sm text-[#0b5ea2] outline-none placeholder:text-[#0b5ea2]/40 focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#0b5ea2]/60 hover:bg-[#0b5ea2]/5">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{errors.password ? <span className="field-error mt-2 block text-xs font-bold">{errors.password}</span> : null}</label>
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#0b5ea2]/65"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} className="h-4 w-4 accent-[#0b5ea2]" />Show password</label>
              <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-xl bg-[#0b5ea2] text-sm font-black uppercase tracking-[.12em] text-[#FFFFFF] shadow-lg shadow-[#0b5ea2]/20 transition hover:ring-4 hover:ring-[#FFF200] disabled:cursor-wait disabled:opacity-60">{busy ? 'Verifying account…' : 'Log In'}</button>
            </form>}
            <Link to="/forgot-password?portal=staff" className="mt-5 inline-block text-sm font-bold text-[#0b5ea2] underline">Set or reset Staff password</Link>
          </div>
        </section>
      </div>
    </main>
  )
}
