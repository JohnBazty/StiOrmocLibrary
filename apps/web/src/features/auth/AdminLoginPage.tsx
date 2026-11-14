import { Eye, EyeOff, IdCard, LockKeyhole, ShieldCheck } from 'lucide-react'
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
  const [message, setMessage] = useState('')
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
    <main className="public-library-reference staff-reference-page relative grid min-h-screen bg-zinc-50 transition-colors lg:grid-cols-[.95fr_1.05fr] dark:bg-[#14151b]">
      <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6"><ThemeToggle /></div>

      <section className="relative order-1 flex items-center justify-center p-5 sm:p-10 z-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/reference-logo.jpg" alt="STI College Ormoc Logo" className="h-auto w-32 rounded-lg object-contain" />
            <div>
              <p className="font-display text-lg font-black text-zinc-900 dark:text-white">STI COLLEGE ORMOC</p>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-zinc-500 dark:text-zinc-400">Staff portal</p>
            </div>
          </div>

          <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500 dark:text-zinc-400">Authorized personnel only</p>
          <h1 className="mt-2 font-display text-4xl font-black tracking-tight text-zinc-900 dark:text-white">Library Personnel Login</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Sign in with your authorized School ID to open the library workspace.
          </p>

          {message ? <AuthMessage>{message}</AuthMessage> : null}

          {switchToken ? <DeviceSwitchPrompt busy={busy} onConfirm={() => { void switchDevice() }} onCancel={() => { setSwitchToken(''); setMessage('') }} /> : <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
            <label className="block">
              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">School ID</span>
              <span className="relative mt-2 block">
                <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  aria-invalid={Boolean(errors.school_id)}
                  autoComplete="username"
                  autoFocus
                  value={schoolId}
                  onChange={(event) => setSchoolId(event.target.value)}
                  placeholder="Enter School ID"
                  className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-4 text-sm uppercase text-zinc-900 outline-none transition placeholder:normal-case placeholder:text-zinc-400 focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10 dark:border-white/15 dark:bg-[#22232e] dark:text-white dark:focus:border-[#FFF200] dark:focus:ring-[#FFF200]/10"
                />
              </span>
              {errors.school_id ? <span className="field-error mt-2 block text-xs font-bold">{errors.school_id}</span> : null}
            </label>

            <label className="block">
              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Password</span>
              <span className="relative mt-2 block">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  aria-invalid={Boolean(errors.password)}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-12 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10 dark:border-white/15 dark:bg-[#22232e] dark:text-white dark:focus:border-[#FFF200] dark:focus:ring-[#FFF200]/10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-white/10"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {errors.password ? <span className="field-error mt-2 block text-xs font-bold">{errors.password}</span> : null}
            </label>

            <div className="flex items-center justify-end">
              <Link to="/forgot-password?portal=staff" className="text-sm font-bold text-[#0b5ea2] hover:underline dark:text-[#FFF200]">
                Set or reset Staff password
              </Link>
            </div>

            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} className="h-4 w-4 accent-[#0b5ea2]" />Show password</label>
            <button
              disabled={busy}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[#0b5ea2] px-5 text-sm font-black text-white shadow-lg shadow-[#0b5ea2]/15 transition hover:bg-[#002266] active:scale-95 disabled:cursor-wait disabled:opacity-60 disabled:active:scale-100 dark:bg-[#FFF200] dark:text-[#0b5ea2] dark:hover:bg-yellow-400"
            >
              {busy ? 'Verifying account…' : 'Log In'}
            </button>
          </form>}

          <p className="mt-7 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Student or Faculty?{' '}
            <Link to="/login" className="font-black text-[#0b5ea2] underline decoration-[#0b5ea2]/30 decoration-2 underline-offset-4 transition-colors hover:decoration-[#0b5ea2] dark:text-[#FFF200] dark:decoration-[#FFF200]/30 dark:hover:decoration-[#FFF200]">
              User login
            </Link>
          </p>
        </div>
      </section>

      <section
        className="relative order-2 hidden overflow-hidden border-l border-zinc-200 bg-cover bg-center bg-no-repeat lg:flex lg:flex-col lg:justify-between dark:border-zinc-800"
        style={{ backgroundImage: "url('/reference-library-hero.webp')" }}
      >
        <div className="absolute inset-0 bg-[#0b5ea2]/85 dark:bg-[#001133]/90" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b5ea2] via-transparent to-transparent opacity-80" />

        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <img src="/reference-logo.jpg" alt="STI College Ormoc Logo" className="h-auto w-32 rounded-lg object-contain" />
            <div>
              <p className="font-display text-lg font-black">STI COLLEGE ORMOC</p>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-white/70">ILMS Administration</p>
            </div>
          </div>

          <div className="max-w-xl">
            <span className="inline-flex rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-4 py-2 text-xs font-bold uppercase tracking-[.16em] text-[#FFF200] backdrop-blur-md">
              Restricted access
            </span>
            <p className="mt-7 font-display text-5xl font-black leading-tight text-white">
              Manage the campus library desk.
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm text-white/70">
            <ShieldCheck className="text-[#FFF200]" size={20} />
            <span>Operations, accounts, and desk tools in one workspace</span>
          </div>
        </div>
      </section>
    </main>
  )
}
